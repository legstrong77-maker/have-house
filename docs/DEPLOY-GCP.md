# 部署到 Google Cloud（替代方案）

本站資料量小、流量低，**家用 NAS 已綽綽有餘**。如果一定要上 GCP，以下是最便宜的搭法。

## 架構

| 元件 | GCP 服務 | 用途 |
|---|---|---|
| Postgres + PostGIS | **Cloud SQL for PostgreSQL** | 資料庫 |
| API | **Cloud Run** | 容器化後端 |
| 靜態前端 | **Firebase Hosting** 或 Cloud Run | React build 出來的 dist |
| ETL（每旬） | **Cloud Run Jobs** + **Cloud Scheduler** | 觸發抓資料 |
| ZIP 暫存 | **Cloud Storage** | 緩存下載的 ZIP |

## 估算成本（最小規格，每月）

| 項目 | 規格 | 每月（USD） |
|---|---|---|
| Cloud SQL db-f1-micro 0.6GB | + 10GB SSD | $9 ~ $12 |
| Cloud Run（API + ETL Jobs） | 低流量 | $0 ~ $3（免費額度內常為 $0） |
| Cloud Storage（5GB） |  | $0.10 |
| Firebase Hosting |  | $0 |
| **合計** |  | **約 $10 ~ $15** |

跟自有 NAS 比起來幾乎全部來自 Cloud SQL。如果可以接受 Postgres 自架在一台 Compute Engine e2-micro，**有機會壓到 $5 / 月以內**（但要自己處理備份）。

## 步驟概要

1. `gcloud sql instances create have-house-db --database-version=POSTGRES_16 --tier=db-f1-micro --region=asia-east1`
2. 安裝 PostGIS：連上 Cloud SQL，`CREATE EXTENSION postgis;`
3. 建 Service Account，把 ETL 用的權限授給它
4. 把 `etl/` build 成 image push 到 Artifact Registry
5. `gcloud run jobs create have-house-etl --image=...`
6. `gcloud scheduler jobs create http have-house-etl-trigger --schedule="0 3 2,12,22 * *" --uri=...`（呼叫 Cloud Run Job）
7. 把 `api/` 部署成 Cloud Run Service
8. 把 `web/` build 出 `dist/`，`firebase deploy --only hosting`，並把 `/api/*` rewrite 到 Cloud Run

## 何時值得上雲

- 你想讓**全台網路使用者**都能看（家裡上行頻寬不夠）
- 你想要 **99.9%+** 可用性
- 你不想自己管 NAS 升級 / 備份

否則：留在 Synology + Cloudflare Tunnel 是最划算的選項。
