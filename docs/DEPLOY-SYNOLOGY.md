# 部署到 Synology NAS

本指南假設你的 Synology DSM 7.x，已安裝 **Container Manager**（舊名 Docker）。

## 1. 準備

1. DSM > Container Manager 確認已啟用
2. 建立資料夾，例如 `/volume1/docker/have-house`，並把整個 repo 複製進去（可從電腦用 File Station 上傳）
3. 透過 SSH 進入 NAS（控制台 > 終端機 SNMP > 啟用 SSH），切換到專案目錄：
   ```bash
   cd /volume1/docker/have-house
   cp .env.example .env
   nano .env   # 改密碼 POSTGRES_PASSWORD
   ```

## 2. 啟動

```bash
sudo docker compose up -d --build db api web scheduler
```

首次部署，**手動補一次歷史資料**（從 ROC 110 年起到最新季）：

```bash
sudo docker compose run --rm etl python -m etl.pipeline --mode backfill --since 110
```

之後 scheduler 會在每月 2 / 12 / 22 日凌晨 3 點自動拉最新一季。

## 3. 用瀏覽器訪問

- 內網：`http://<NAS_IP>:8080`
- 想對外公開但不想開 port？用 **Cloudflare Tunnel**，下面 4 章節。

## 4. Cloudflare Tunnel（強烈推薦）

不用固定 IP、不用開 router port，免費，自帶 HTTPS、防 DDoS。

1. 註冊 Cloudflare 帳號，把你的網域加到 Cloudflare（DNS 切過去）。
2. 進入 [Zero Trust 控制台](https://one.dash.cloudflare.com/) > Networks > Tunnels > Create a tunnel
3. 選 Cloudflared，命名（例：`have-house`），複製 token
4. 在 NAS 上跑：
   ```bash
   sudo docker run -d --restart unless-stopped --name cloudflared \
     --network=have-house_default \
     cloudflare/cloudflared:latest tunnel run --token YOUR_TOKEN
   ```
   `--network=have-house_default` 讓它能透過 service 名 `web:80` 連到本站。
5. 回 Cloudflare 後台 > Public Hostnames，新增：
   - Subdomain: `house`（任意）
   - Domain: 你的網域
   - Service: `http://web:80`
6. 完成後 `https://house.你的網域.tld` 就能開站，且自動 HTTPS。

## 5. 資源使用估算

| 服務 | CPU / RAM 估算（穩態） |
|---|---|
| Postgres | 100~300 MB RAM，穩態 1~3% CPU |
| API | 100 MB RAM |
| Web (nginx) | < 50 MB RAM |
| Scheduler | 60 MB RAM（idle）；每旬執行時短暫 200~400 MB |
| 資料量 | ROC 110~113 全台累積約 5 GB（含 raw json） |

DS220+ 等級或以上的機器跑得很順。

## 6. 升級

```bash
git pull
sudo docker compose up -d --build api web scheduler
```

ETL Schema 若有改動：
```bash
sudo docker compose exec db psql -U havehouse -d havehouse -f /docker-entrypoint-initdb.d/004_views.sql
```

## 7. 備份

```bash
sudo docker compose exec db pg_dump -U havehouse havehouse | gzip > backup_$(date +%F).sql.gz
```

放進 Synology Hyper Backup 排程即可。
