import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const DEFAULT_TARGET_HOST = "127.0.0.1";
const DEFAULT_TARGET_PORT = 3773;
const DEFAULT_LISTEN_PORT = 3780;
const RETRY_DELAY_MS = 5000;

/**
 * Normalize an IPv4-mapped IPv6 address (e.g. ::ffff:10.0.0.5 -> 10.0.0.5).
 */
export function normalizeIp(address) {
  return String(address ?? "").replace(/^::ffff:/i, "").trim();
}

/**
 * Validate an IP literal and optionally reject wildcard bind addresses.
 */
export function assertValidListenIp(listenIp, { allowWildcard = false } = {}) {
  if (!listenIp || net.isIP(listenIp) === 0) {
    throw new Error(`Invalid listenIp "${listenIp}". Provide a valid IPv4 or IPv6 address.`);
  }
  if (!allowWildcard && ["0.0.0.0", "::"].includes(listenIp)) {
    throw new Error(
      `Refusing wildcard listenIp "${listenIp}". Pass --allow-wildcard to override.`
    );
  }
}

/**
 * Read the running T3 Code Desktop backend port from server-runtime.json if present.
 */
export function readT3RuntimePort({
  t3Home = process.env.T3CODE_HOME?.trim() || path.join(os.homedir(), ".t3"),
  fallbackPort = DEFAULT_TARGET_PORT,
} = {}) {
  const runtimePath = path.join(t3Home, "userdata", "server-runtime.json");
  try {
    const raw = fs.readFileSync(runtimePath, "utf8");
    const data = JSON.parse(raw);
    const port = Number(data?.port);
    if (Number.isInteger(port) && port > 0 && port <= 65535) {
      return port;
    }
  } catch {
    // Fall back when T3 Code is not running yet or file is absent.
  }
  return fallbackPort;
}

/**
 * Parse a comma-separated list or string array into normalized, non-empty IPs.
 */
export function normalizeAllowList(allow) {
  if (!allow) return [];
  const items = Array.isArray(allow) ? allow : String(allow).split(",");
  return items.map((item) => normalizeIp(item)).filter(Boolean);
}

/**
 * Load JSON config file if it exists (returns {} if implicit path is missing).
 */
export function loadConfigFile(configPath, { required = false } = {}) {
  if (!configPath) return {};
  if (!fs.existsSync(configPath)) {
    if (required) {
      throw new Error(`Config file not found: ${configPath}`);
    }
    return {};
  }
  const parsed = JSON.parse(fs.readFileSync(configPath, "utf8").replace(/^\uFEFF/, ""));
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid config object in ${configPath}`);
  }
  return parsed;
}

/**
 * Parse CLI arguments into forwarder options.
 */
export function parseCliArgs(argv) {
  const result = {
    help: false,
    configPath: undefined,
    listenIp: undefined,
    listenPort: undefined,
    targetHost: undefined,
    targetPort: undefined,
    autoTargetPort: undefined,
    allow: undefined,
    allowWildcard: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) {
        throw new Error(`Missing value for ${arg}`);
      }
      return argv[++i];
    };

    switch (arg) {
      case "-h":
      case "--help":
        result.help = true;
        break;
      case "-c":
      case "--config":
        result.configPath = next();
        break;
      case "-l":
      case "--listen":
      case "--listen-ip":
        result.listenIp = next();
        break;
      case "-p":
      case "--port":
      case "--listen-port":
        result.listenPort = Number(next());
        break;
      case "--target-host":
        result.targetHost = next();
        break;
      case "-t":
      case "--target-port":
        result.targetPort = Number(next());
        break;
      case "--auto-target-port":
        result.autoTargetPort = true;
        break;
      case "--no-auto-target-port":
        result.autoTargetPort = false;
        break;
      case "-a":
      case "--allow":
        result.allow = next();
        break;
      case "--allow-wildcard":
        result.allowWildcard = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return result;
}

/**
 * Resolve effective forwarder options from CLI args + config file + defaults.
 */
export function resolveOptions(cliArgs, { defaultConfigPath } = {}) {
  const explicitConfig = Boolean(cliArgs.configPath);
  const config = loadConfigFile(cliArgs.configPath ?? defaultConfigPath, {
    required: explicitConfig,
  });

  const listenIp = cliArgs.listenIp ?? config.listenIp;
  const listenPort = cliArgs.listenPort ?? config.listenPort ?? DEFAULT_LISTEN_PORT;
  const targetHost = cliArgs.targetHost ?? config.targetHost ?? DEFAULT_TARGET_HOST;
  const targetPort = cliArgs.targetPort ?? config.targetPort ?? DEFAULT_TARGET_PORT;
  const autoTargetPort = cliArgs.autoTargetPort ?? config.autoTargetPort ?? true;
  const allow = normalizeAllowList(cliArgs.allow ?? config.allow);
  const allowWildcard = Boolean(cliArgs.allowWildcard || config.allowWildcard);

  assertValidListenIp(listenIp, { allowWildcard });
  for (const port of [listenPort, targetPort]) {
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      throw new Error(`Invalid port: ${port}`);
    }
  }

  return {
    listenIp,
    listenPort,
    targetHost,
    targetPort,
    autoTargetPort,
    allow,
    allowWildcard,
  };
}

/**
 * Create and start a single-IP TCP forwarder with optional source IP allowlist.
 */
export function createForwarder(options) {
  const {
    listenIp,
    listenPort = DEFAULT_LISTEN_PORT,
    targetHost = DEFAULT_TARGET_HOST,
    targetPort = DEFAULT_TARGET_PORT,
    autoTargetPort = true,
    allow = [],
    allowWildcard = false,
    retryDelayMs = RETRY_DELAY_MS,
    t3Home,
    logger = console,
  } = options;

  assertValidListenIp(listenIp, { allowWildcard });
  const allowSet = new Set(normalizeAllowList(allow));
  let retryTimer = null;
  let stopped = false;

  const server = net.createServer((client) => {
    const from = normalizeIp(client.remoteAddress);
    if (allowSet.size > 0 && !allowSet.has(from)) {
      logger.log(`[refused] ${from || "unknown"}`);
      client.destroy();
      return;
    }

    const effectivePort = autoTargetPort
      ? readT3RuntimePort({ t3Home, fallbackPort: targetPort })
      : targetPort;

    const upstream = net.connect(effectivePort, targetHost);
    for (const socket of [client, upstream]) {
      socket.setKeepAlive(true, 30_000);
    }

    client.pipe(upstream);
    upstream.pipe(client);

    client.on("error", () => upstream.destroy());
    upstream.on("error", () => client.destroy());
    client.on("close", () => upstream.destroy());
  });

  const listen = () => {
    if (!stopped) {
      server.listen(listenPort, listenIp);
    }
  };

  server.on("listening", () => {
    const addr = server.address();
    const boundPort = typeof addr === "object" && addr ? addr.port : listenPort;
    const allowLabel = allowSet.size > 0 ? [...allowSet].join(", ") : "* (pairing auth only)";
    logger.log(
      `[listening] http://${listenIp}:${boundPort} -> ${targetHost}:${targetPort}${autoTargetPort ? " (auto from server-runtime.json)" : ""} | allow: ${allowLabel}`
    );
  });

  server.on("error", (error) => {
    if (stopped) return;
    logger.log(`[error] ${error.code ?? error.message}: retrying in ${retryDelayMs}ms`);
    retryTimer = setTimeout(listen, retryDelayMs);
  });

  listen();

  return {
    server,
    stop() {
      stopped = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      return new Promise((resolve) => {
        server.close(() => resolve());
      });
    },
  };
}
