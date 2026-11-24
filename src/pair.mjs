#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCliArgs, resolveOptions } from "./forwarder.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultConfigPath = path.join(repoRoot, "config.json");

function extractForwarderFlags(argv) {
  const forwarderArgs = [];
  const pairArgs = [];
  const valueFlags = new Set([
    "-c",
    "--config",
    "-l",
    "--listen",
    "--listen-ip",
    "-p",
    "--port",
    "--listen-port",
    "--target-host",
    "-t",
    "--target-port",
    "-a",
    "--allow",
  ]);
  const boolFlags = new Set([
    "--auto-target-port",
    "--no-auto-target-port",
    "--allow-wildcard",
  ]);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (valueFlags.has(arg)) {
      forwarderArgs.push(arg);
      if (i + 1 < argv.length) forwarderArgs.push(argv[++i]);
    } else if (boolFlags.has(arg)) {
      forwarderArgs.push(arg);
    } else {
      pairArgs.push(arg);
    }
  }
  return { forwarderArgs, pairArgs };
}

export function rewritePairingText(text, listenIp, listenPort) {
  const hostPart = listenIp.includes(":") ? `[${listenIp}]` : listenIp;
  return text.replace(
    /https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?/gi,
    `http://${hostPart}:${listenPort}`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { forwarderArgs, pairArgs } = extractForwarderFlags(process.argv.slice(2));
    const options = resolveOptions(parseCliArgs(forwarderArgs), { defaultConfigPath });

    const t3Cmd =
      process.platform === "win32"
        ? path.join(os.homedir(), ".t3", "bin", "t3.cmd")
        : "t3";

    const res = spawnSync(t3Cmd, ["pair", ...pairArgs], {
      encoding: "utf8",
      shell: process.platform === "win32",
    });

    if (res.error) throw res.error;
    if (res.stderr) process.stderr.write(res.stderr);
    if (res.stdout) {
      process.stdout.write(res.stdout);
      const rewritten = rewritePairingText(res.stdout, options.listenIp, options.listenPort);
      const urls = rewritten.match(/http:\/\/[^\s]+/g);
      if (urls?.length) {
        console.log("\n--- Forwarded URL (open this instead of scanning the 127.0.0.1 QR code above) ---");
        for (const u of new Set(urls)) console.log(u);
      }
    }
    process.exit(res.status ?? 0);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}
