# t3-code-forwarder

A tiny, zero-dependency Node.js TCP forwarder for **T3 Code Desktop**.

It lets you keep T3 Code Desktop's built-in backend bound strictly to `127.0.0.1` while exposing it **only on one chosen private / LAN / VPN IP** (and optionally only to an allowlist of client IPs), instead of enabling T3's built-in LAN share which binds `0.0.0.0`.

## Why use this?

- **Bind a single IP, not `0.0.0.0`**: Ideal when Windows Firewall is off or you have multiple network adapters (Wi-Fi, VPN, Meshnet, ZeroTier, Tailscale) and want T3 reachable on only one specific interface IP.
- **Survives T3 Code updates**: Lives outside the T3 Code installation directory and uses standard TCP forwarding (`node:net`).
- **Auto-detects backend port**: By default reads `~/.t3/userdata/server-runtime.json` (respecting `T3CODE_HOME`) on each connection so it still works if T3 starts on a port other than `3773`.
- **Optional IP allowlist**: Restrict incoming connections to specific client IPs (e.g., your phone's VPN IP), on top of T3 Code's built-in pairing authentication.
- **Resilient bind retry**: If your VPN interface isn't up yet at boot, it retries every 5 seconds until the IP is ready.

## Requirements

- Node.js >= 20
- T3 Code Desktop running locally (with its built-in Local environment enabled)

## Quick Start

1. Clone the repo:

   ```bash
   git clone https://github.com/zkylek1212-k/t3-code-forwarder.git
   cd t3-code-forwarder
   ```

2. Run directly with CLI flags:

   ```bash
   node src/cli.mjs --listen 192.168.1.100 --port 3780 --allow 192.168.1.50
   ```

   Or omit `--allow` if you only want to restrict by the listening interface IP (pairing code auth still applies):

   ```bash
   node src/cli.mjs --listen 192.168.1.100 --port 3780
   ```

   Or copy `config.example.json` to `config.json` (gitignored) and run:

   ```bash
   npm start
   ```

## Pairing a Phone or Remote Device

1. Keep T3 Code Desktop open on the host PC and start the forwarder.
2. Generate a pairing link using the included helper (which rewrites `127.0.0.1:3773` in `t3 pair` output to your forwarded IP/port):

   ```bash
   node src/pair.mjs --ttl 15m
   ```

   Or run `t3 pair` directly and replace `127.0.0.1:3773` with `<listenIp>:<listenPort>` when opening the URL on your phone.

## Windows Auto-Start at Logon

To save `config.json` and register a user-level Windows Scheduled Task (`T3-Code-Forwarder`, no administrator rights required):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\install-task.ps1 -ListenIp 192.168.1.100 -ListenPort 3780 -Allow 192.168.1.50
```

To add more allowed devices later, re-run `install-task.ps1` with a comma-separated list (e.g., `-Allow 192.168.1.50,192.168.1.51`) or edit `config.json` and restart the task.

To stop and remove the scheduled task:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\uninstall-task.ps1
```

## CLI Options

| Flag | Default | Description |
|---|---|---|
| `-l, --listen <ip>` | *(from `config.json`)* | Specific IPv4/IPv6 interface address to bind |
| `-p, --port <port>` | `3780` | Port to listen on |
| `--target-host <ip>` | `127.0.0.1` | Local T3 Code backend host |
| `-t, --target-port <port>` | `3773` | Fallback backend port |
| `--auto-target-port` | `true` | Read live port from `~/.t3/userdata/server-runtime.json` |
| `--no-auto-target-port` | — | Always forward to `--target-port` |
| `-a, --allow <ip1,ip2>` | *(none)* | Optional comma-separated allowed client IPs |
| `-c, --config <path>` | `./config.json` | Path to JSON config file |
| `--allow-wildcard` | `false` | Allow `0.0.0.0` or `::` (not recommended) |

## Tests

```bash
npm test
```

## License

MIT
