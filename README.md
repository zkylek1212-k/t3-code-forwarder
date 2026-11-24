# t3-code-forwarder

[English](#english) | [繁體中文](#繁體中文)

---

## English

A tiny, zero-dependency Node.js TCP forwarder for **T3 Code Desktop**.

It lets you keep T3 Code Desktop's built-in backend bound strictly to `127.0.0.1` while exposing it **only on one chosen private / LAN / VPN IP** (and optionally only to an allowlist of client IPs), instead of enabling T3's built-in LAN share which binds `0.0.0.0`.

> **Important limitation:** When using T3 Code Desktop's built-in Local environment, **the T3 Code Desktop window on the host PC must stay open**. Closing the window stops the local backend and disconnects remote devices.

### Why use this?

- **Bind a single IP, not `0.0.0.0`**: Ideal when Windows Firewall is disabled or you have multiple network adapters (Wi-Fi, VPN, Meshnet, ZeroTier, Tailscale) and want T3 reachable on only one specific interface IP.
- **Survives T3 Code updates**: Lives outside the T3 Code installation directory and uses standard TCP forwarding (`node:net`).
- **Auto-detects backend port**: By default reads `~/.t3/userdata/server-runtime.json` (respecting `T3CODE_HOME`) on each connection so it still works if T3 starts on a port other than `3773`.
- **Optional IP allowlist**: Restrict incoming connections to specific client IPs (e.g., your phone's VPN IP), on top of T3 Code's built-in pairing authentication.
- **Resilient bind retry**: If your VPN interface isn't up yet at boot, it retries every 5 seconds until the IP is ready.

### Requirements

- Node.js >= 20
- T3 Code Desktop installed and running locally (with **Local environment** enabled)

### Step 1: Find the IP Addresses

1. **Find your host PC's interface IP** (the LAN / VPN / Meshnet IP you want to bind):
   - **Windows PowerShell**:
     ```powershell
     Get-NetIPAddress -AddressFamily IPv4 |
       Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
       Select-Object InterfaceAlias, IPAddress
     ```
   - **macOS / Linux**: `ifconfig` or `ip -4 addr`

2. **Find your phone / client device IP (optional, for `--allow`)**:
   - Check the VPN / Meshnet / Wi-Fi IP shown on your phone.
   - If you're unsure what source IP your phone arrives with, start the forwarder in the foreground with a dummy allow IP (e.g., `--allow 127.0.0.1`), try opening `http://<listenIp>:3780` from the phone, and read the `[refused] <client-ip>` line in the terminal.

### Step 2: Clone & Start the Forwarder

```bash
git clone https://github.com/zkylek1212-k/t3-code-forwarder.git
cd t3-code-forwarder
```

#### Option A: Windows Auto-Start at Logon (Recommended on Windows)

Saves `config.json` (gitignored), registers a user-level Scheduled Task (`T3-Code-Forwarder`, no administrator rights required), and starts it immediately:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\install-task.ps1 -ListenIp <HOST_IP> -ListenPort 3780 -Allow <DEVICE_IP>
```

- Multiple allowed devices: `-Allow <IP1>,<IP2>`
- Allow any client that can reach `<HOST_IP>` (relying on T3 pairing auth only): omit `-Allow`

#### Option B: Run Manually in Terminal (Windows / macOS / Linux)

With CLI flags:

```bash
node src/cli.mjs --listen <HOST_IP> --port 3780 --allow <DEVICE_IP>
```

Or copy `config.example.json` to `config.json` (gitignored), edit it, and run:

```bash
npm start
```

### Step 3: Windows Firewall (If Enabled on the New PC)

If Windows Firewall is turned on, inbound TCP traffic on your listen port (`3780`) must be allowed, or the phone will time out:

- Allow `node.exe` when prompted by Windows Defender Firewall (Private networks), **or**
- Add a port rule (PowerShell as Administrator, scoped to your local IP):
  ```powershell
  New-NetFirewallRule -DisplayName "T3 Code Forwarder (3780)" -Direction Inbound -Protocol TCP -LocalAddress <HOST_IP> -LocalPort 3780 -Action Allow
  ```

### Step 4: Pair Your Phone / Remote Device

1. Make sure **T3 Code Desktop** is open on the host PC and the forwarder is running.
2. Run the pairing helper:
   - If `config.json` exists (e.g. created by `install-task.ps1`):
     ```bash
     node src/pair.mjs --ttl 15m
     ```
   - If you ran via CLI flags **without** `config.json`, pass `--listen` (and `--port` if not `3780`):
     ```bash
     node src/pair.mjs --listen <HOST_IP> --port 3780 --ttl 15m
     ```
3. **Important:** Do **not** scan the QR code printed by `t3 pair` (it still encodes `127.0.0.1:3773`). Instead, open the **`--- Forwarded URL ---`** printed at the bottom on your phone's browser.
   - *(Manual fallback: run `t3 pair` directly and replace `127.0.0.1:3773` with `<HOST_IP>:3780`.)*

### Verify, Update Devices, & Uninstall (Windows)

- **Verify the forwarder is listening**:
  ```powershell
  Get-NetTCPConnection -LocalPort 3780 -State Listen
  ```
- **Add/change allowed devices later**:
  Re-run `install-task.ps1` with the updated `-Allow` list (it automatically stops the old `node.exe` process, updates `config.json`, and restarts the task), **or** edit `config.json` and run:
  ```powershell
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.CommandLine -match 't3-code-forwarder' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Start-ScheduledTask -TaskName T3-Code-Forwarder
  ```
- **Stop and remove auto-start**:
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\scripts\windows\uninstall-task.ps1
  ```

### CLI Options

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

### Tests

```bash
npm test
```

---

## 繁體中文

輕量、零外部套件依賴的 Node.js TCP 轉發器，專為 **T3 Code Desktop** 設計。

它可以讓 T3 Code 桌面版內建後端繼續只綁在 `127.0.0.1`，同時透過本工具**只監聽你指定的單一內網 / 區網 / VPN IP**（並可選填來源裝置 IP 白名單），避免開啟 T3 內建網路分享而將 port 敞開在 `0.0.0.0`。

> **使用限制：** 搭配 T3 Code 桌面版內建的 Local environment 時，**電腦上的 T3 Code Desktop 視窗必須保持開啟**；關掉視窗後，內建後端會停止，手機也會跟著斷線。

### 為什麼要用這個工具？

- **只綁定單一指定 IP，不開 `0.0.0.0`**：適合 Windows 防火牆停用、或電腦同時有多張網卡（Wi-Fi、VPN、Meshnet、ZeroTier、Tailscale），只想讓特定網段連入的情境。
- **不隨 T3 Code 更新失效**：獨立於 T3 Code 安裝目錄之外，使用純 TCP 轉發（`node:net`）。
- **自動偵測後端 port**：預設每次連線會讀取 `~/.t3/userdata/server-runtime.json`（支援 `T3CODE_HOME`），即使 T3 改用非 `3773` port 也能自動對上。
- **來源 IP 白名單（選用）**：可在 T3 原生配對驗證之外，再加一層只放行指定裝置 IP 的限制。
- **斷線重試**：若開機時 VPN 網卡尚未就緒，會每 5 秒自動重試綁定直到成功。

### 環境需求

- Node.js >= 20
- 本機已安裝並開啟 **T3 Code Desktop**（使用預設的內建 Local environment）

### 步驟 1：查詢要填寫的 IP

1. **查詢這台電腦要綁定的網卡 IP**（例如 VPN / Meshnet / 區網 Wi-Fi IP）：
   - **Windows PowerShell**：
     ```powershell
     Get-NetIPAddress -AddressFamily IPv4 |
       Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
       Select-Object InterfaceAlias, IPAddress
     ```
   - **macOS / Linux**：`ifconfig` 或 `ip -4 addr`

2. **查詢手機／遠端裝置的來源 IP（有要設 `--allow` 白名單才需要）**：
   - 在手機 VPN / Meshnet 或 Wi-Fi 設定中查看該裝置配到的 IP。
   - 若不確定手機連進來時的真實來源 IP，可先在終端機用假白名單（例如 `--allow 127.0.0.1`）前景啟動轉發器，再用手機瀏覽器試連 `http://<電腦IP>:3780`，終端機就會印出 `[refused] <手機來源IP>`。

### 步驟 2：下載與啟動轉發器

```bash
git clone https://github.com/zkylek1212-k/t3-code-forwarder.git
cd t3-code-forwarder
```

#### 方式 A：Windows 設定開機自動在背景執行（推薦）

會自動寫入 `config.json`（已列入 `.gitignore`）、註冊目前使用者的登入排程 `T3-Code-Forwarder`（**免系統管理員權限**），並立即在背景啟動：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\install-task.ps1 -ListenIp <電腦綁定IP> -ListenPort 3780 -Allow <手機IP>
```

- 多台裝置：`-Allow <IP1>,<IP2>`
- 不限制來源裝置 IP（只靠指定電腦網卡 IP ＋ T3 配對碼驗證）：省略 `-Allow` 參數即可

#### 方式 B：手動在終端機執行（Windows / macOS / Linux）

直接用命令列參數啟動：

```bash
node src/cli.mjs --listen <電腦綁定IP> --port 3780 --allow <手機IP>
```

或複製 `config.example.json` 為 `config.json`（已忽略版控）修改後執行：

```bash
npm start
```

### 步驟 3：Windows 防火牆確認（如果新電腦有開防火牆）

這台電腦之外，其他預設開啟 Windows 防火牆的電腦會擋掉外部連入的 TCP `3780`：

- 首次跳出 Windows Defender 防火牆詢問 `node.exe` 時允許私人網路，**或**
- 以系統管理員身分在 PowerShell 放行該指定 IP 與 port：
  ```powershell
  New-NetFirewallRule -DisplayName "T3 Code Forwarder (3780)" -Direction Inbound -Protocol TCP -LocalAddress <電腦綁定IP> -LocalPort 3780 -Action Allow
  ```

### 步驟 4：手機／遠端裝置配對

1. 確認電腦上的 **T3 Code Desktop** 開著，且轉發器正在執行。
2. 執行配對輔助腳本：
   - 若已有 `config.json`（例如剛才跑過 `install-task.ps1`）：
     ```bash
     node src/pair.mjs --ttl 15m
     ```
   - 若剛才只用 CLI 參數啟動、**沒有建 `config.json`**，請務必補上 `--listen`（以及若不是 `3780` 則加 `--port`）：
     ```bash
     node src/pair.mjs --listen <電腦綁定IP> --port 3780 --ttl 15m
     ```
3. **注意：** `t3 pair` 畫出來的 **QR code 裡面仍是 `127.0.0.1:3773`**，請不要直接掃該 QR code；請複製並用手機瀏覽器開啟輸出最下方的 **`--- Forwarded URL ---`** 網址即可完成配對。
   - *(手動替代做法：直接執行 `t3 pair`，把印出網址裡的 `127.0.0.1:3773` 換成 `<電腦綁定IP>:3780` 後在手機打開。)*

### 檢查狀態、新增裝置與移除（Windows）

- **檢查轉發器是否正在監聽**：
  ```powershell
  Get-NetTCPConnection -LocalPort 3780 -State Listen
  ```
- **之後要新增或修改允許的裝置 IP**：
  直接重新執行一次 `install-task.ps1` 並帶入新的 `-Allow` 清單（腳本會自動停止舊的 `node.exe`、更新 `config.json` 並重啟排程）；或手動改完 `config.json` 後重啟：
  ```powershell
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.CommandLine -match 't3-code-forwarder' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Start-ScheduledTask -TaskName T3-Code-Forwarder
  ```
- **停止轉發器並移除自動啟動排程**：
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\scripts\windows\uninstall-task.ps1
  ```

---

### License

MIT
