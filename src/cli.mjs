#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createForwarder, parseCliArgs, resolveOptions } from "./forwarder.mjs";

const USAGE = `t3-code-forwarder

Forward a single private/LAN/VPN IP:port to T3 Code Desktop's local loopback server.

Usage:
  node src/cli.mjs --listen <ip> [options]

Options:
  -l, --listen <ip>         Local interface IP to bind (required unless set in config.json)
  -p, --port <port>         Listen port (default: 3780)
      --target-host <ip>    Upstream host (default: 127.0.0.1)
  -t, --target-port <port>  Fallback upstream port (default: 3773)
      --auto-target-port    Read live port from ~/.t3/userdata/server-runtime.json (default: on)
      --no-auto-target-port Always use --target-port without reading server-runtime.json
  -a, --allow <ip1,ip2>     Optional comma-separated client IP allowlist
  -c, --config <path>       JSON config path (defaults to ./config.json if present)
      --allow-wildcard      Allow binding 0.0.0.0 or :: (disabled by default for safety)
  -h, --help                Show this help
`;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultConfigPath = path.join(repoRoot, "config.json");

try {
  const cliArgs = parseCliArgs(process.argv.slice(2));
  if (cliArgs.help) {
    console.log(USAGE);
    process.exit(0);
  }

  const options = resolveOptions(cliArgs, { defaultConfigPath });
  const forwarder = createForwarder(options);

  const shutdown = async () => {
    await forwarder.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
} catch (error) {
  console.error(`Error: ${error.message}`);
  console.error("Run with --help for usage.");
  process.exit(1);
}
