import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertValidListenIp,
  createForwarder,
  parseCliArgs,
  readT3RuntimePort,
  resolveOptions,
} from "../src/forwarder.mjs";
import { rewritePairingText } from "../src/pair.mjs";

function listenEphemeral(server, host = "127.0.0.1") {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, () => resolve(server.address().port));
  });
}

test("assertValidListenIp rejects wildcard and invalid IPs by default", () => {
  assert.throws(() => assertValidListenIp(""), /Invalid listenIp/);
  assert.throws(() => assertValidListenIp("not-an-ip"), /Invalid listenIp/);
  assert.throws(() => assertValidListenIp("0.0.0.0"), /Refusing wildcard/);
  assert.throws(() => assertValidListenIp("::"), /Refusing wildcard/);
  assert.doesNotThrow(() => assertValidListenIp("127.0.0.1"));
  assert.doesNotThrow(() => assertValidListenIp("0.0.0.0", { allowWildcard: true }));
});

test("parseCliArgs and resolveOptions merge config file with CLI overrides", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t3-fwd-cfg-"));
  const cfgPath = path.join(dir, "config.json");
  fs.writeFileSync(
    cfgPath,
    JSON.stringify({
      listenIp: "192.168.10.20",
      listenPort: 3780,
      targetPort: 3773,
      allow: ["192.168.10.30"],
    })
  );

  try {
    const opts = resolveOptions(
      parseCliArgs(["--config", cfgPath, "--port", "3888", "--allow", "10.0.0.2,10.0.0.3"]),
      {}
    );
    assert.equal(opts.listenIp, "192.168.10.20");
    assert.equal(opts.listenPort, 3888);
    assert.equal(opts.targetPort, 3773);
    assert.deepEqual(opts.allow, ["10.0.0.2", "10.0.0.3"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("readT3RuntimePort reads port from server-runtime.json with fallback", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "t3-fwd-home-"));
  const userdata = path.join(home, "userdata");
  fs.mkdirSync(userdata, { recursive: true });
  fs.writeFileSync(path.join(userdata, "server-runtime.json"), JSON.stringify({ port: 4123 }));

  try {
    assert.equal(readT3RuntimePort({ t3Home: home, fallbackPort: 3773 }), 4123);
    assert.equal(
      readT3RuntimePort({ t3Home: path.join(home, "missing"), fallbackPort: 3773 }),
      3773
    );
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("createForwarder forwards TCP traffic for allowed IP and rejects unlisted IPs", async () => {
  const upstream = net.createServer((socket) => {
    socket.on("data", (chunk) => socket.write(Buffer.concat([Buffer.from("echo:"), chunk])));
  });
  const upstreamPort = await listenEphemeral(upstream, "127.0.0.1");

  const forwardPort = await new Promise((resolve) => {
    const probe = net.createServer();
    probe.listen(0, "127.0.0.1", () => {
      const p = probe.address().port;
      probe.close(() => resolve(p));
    });
  });

  const logs = [];
  const forwarder = createForwarder({
    listenIp: "127.0.0.1",
    listenPort: forwardPort,
    targetHost: "127.0.0.1",
    targetPort: upstreamPort,
    autoTargetPort: false,
    allow: ["127.0.0.1"],
    logger: { log: (msg) => logs.push(msg) },
  });

  await new Promise((resolve) => forwarder.server.once("listening", resolve));

  try {
    // 1. Allowed client receives echoed response.
    const reply = await new Promise((resolve, reject) => {
      const client = net.connect(forwardPort, "127.0.0.1", () => {
        client.write("hello");
      });
      client.on("data", (d) => {
        client.end();
        resolve(d.toString("utf8"));
      });
      client.on("error", reject);
    });
    assert.equal(reply, "echo:hello");

    // 2. Non-whitelisted client gets rejected.
    await forwarder.stop();
    const denyForwarder = createForwarder({
      listenIp: "127.0.0.1",
      listenPort: forwardPort,
      targetHost: "127.0.0.1",
      targetPort: upstreamPort,
      autoTargetPort: false,
      allow: ["10.255.255.254"],
      logger: { log: (msg) => logs.push(msg) },
    });
    await new Promise((resolve) => denyForwarder.server.once("listening", resolve));

    const closed = await new Promise((resolve) => {
      const client = net.connect(forwardPort, "127.0.0.1");
      let gotData = false;
      client.on("data", () => {
        gotData = true;
      });
      client.on("close", () => resolve(!gotData));
      client.on("error", () => resolve(!gotData));
    });
    assert.equal(closed, true);
    await denyForwarder.stop();
  } finally {
    await forwarder.stop().catch(() => {});
    await new Promise((resolve) => upstream.close(() => resolve()));
  }
});

test("rewritePairingText replaces loopback URL with forwarded IP:port", () => {
  const sample = "Pairing URL: http://127.0.0.1:3773/?token=abc123\nLocal: http://localhost:3773/pair";
  const out = rewritePairingText(sample, "100.64.0.10", 3780);
  assert.match(out, /http:\/\/100\.64\.0\.10:3780\/\?token=abc123/);
  assert.match(out, /http:\/\/100\.64\.0\.10:3780\/pair/);
});
