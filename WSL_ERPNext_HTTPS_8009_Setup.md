# WSL ERPNext HTTPS Setup on Port 8009

Use this when ERPNext is running inside WSL Ubuntu on port `8000`.

Final POS URL:

```text
https://abdulrafaykhan07.nayatel.net:8009
```

## 1. Install Caddy Inside WSL Ubuntu

Open WSL Ubuntu:

```bash
sudo apt update
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

Check ERPNext is reachable inside WSL:

```bash
curl -I http://127.0.0.1:8000
```

## 2. Configure Caddy

Edit Caddy config:

```bash
sudo nano /etc/caddy/Caddyfile
```

Replace content with:

```caddy
abdulrafaykhan07.nayatel.net:8009 {
    tls internal
    reverse_proxy 127.0.0.1:8000
}
```

Restart Caddy:

```bash
sudo systemctl restart caddy
sudo systemctl status caddy
```

Test inside WSL:

```bash
curl -k -I https://abdulrafaykhan07.nayatel.net:8009
```

## 3. Allow WSL Firewall Port

If UFW is enabled:

```bash
sudo ufw allow 8009/tcp
sudo ufw status
```

## 4. Forward Windows Port 8009 to WSL

Run PowerShell as Administrator on Windows.

Get WSL IP:

```powershell
wsl hostname -I
```

Example output:

```text
172.24.144.23
```

Add Windows portproxy. Replace `172.24.144.23` with your WSL IP:

```powershell
netsh interface portproxy delete v4tov4 listenport=8009 listenaddress=0.0.0.0
netsh interface portproxy add v4tov4 listenport=8009 listenaddress=0.0.0.0 connectport=8009 connectaddress=172.24.144.23
```

Allow Windows firewall:

```powershell
New-NetFirewallRule -DisplayName "ERPNext HTTPS 8009 to WSL" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8009
```

Check portproxy:

```powershell
netsh interface portproxy show all
```

Important:

WSL IP can change after reboot. If HTTPS stops working later, repeat this section.

## 5. Router Port Forwarding

In router settings:

```text
External port: 8009
Internal IP: Windows PC LAN IP
Internal port: 8009
Protocol: TCP
```

Find Windows LAN IP:

```powershell
ipconfig
```

Use the IPv4 address of the Windows network adapter.

## 6. Trust Caddy Certificate on Windows POS

Caddy `tls internal` creates a private local CA.

Copy Caddy root certificate from WSL:

```bash
sudo cp /var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt /mnt/c/Users/Administrator/Desktop/caddy-root.crt
sudo chmod 644 /mnt/c/Users/Administrator/Desktop/caddy-root.crt
```

On Windows:

1. Double-click `caddy-root.crt`
2. Click **Install Certificate**
3. Select **Local Machine**
4. Select **Place all certificates in the following store**
5. Choose **Trusted Root Certification Authorities**
6. Finish

Restart the POS app after installing the certificate.

## 7. Test From Windows

Open browser on Windows:

```text
https://abdulrafaykhan07.nayatel.net:8009
```

If browser opens without certificate warning, use this in POS settings:

```text
https://abdulrafaykhan07.nayatel.net:8009
```

## 8. Common Problems

If browser cannot connect:

```powershell
netsh interface portproxy show all
```

Check WSL IP again:

```powershell
wsl hostname -I
```

Update portproxy if WSL IP changed.

If browser shows certificate warning:

Install `caddy-root.crt` into:

```text
Trusted Root Certification Authorities
```

If Caddy is not running:

```bash
sudo systemctl restart caddy
sudo systemctl status caddy
```

If ERPNext is not running:

```bash
cd ~/frappe-bench
bench start
```

Then test:

```bash
curl -I http://127.0.0.1:8000
```

