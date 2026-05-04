# Have-House · 台灣房價資料站

> 用內政部實價登錄 Open Data 自動同步、視覺化、提供購屋試算的開源網站。

```
資料來源：內政部不動產交易實價查詢服務網（Open Data）
更新節奏：每月 1、11、21 日（旬報）
部署目標：Synology NAS + Cloudflare Tunnel
```

---

## 一眼看完

| 模組 | 內容 |
|---|---|
| **ETL** | Python 排程，每旬抓官方 ZIP，自動解析 22 縣市 × 買賣/預售/租賃 CSV，標準化地址、偵測異常值 |
| **DB** | PostgreSQL 16 + PostGIS（空間查詢）+ Materialized View（聚合預算） |
| **API** | FastAPI，含 stats / geo / compare / calc 5 大類 25+ 個端點 |
| **Web** | React + Vite + MapLibre + Recharts（無需付費地圖 API） |
| **部署** | Docker Compose，一鍵起 NAS；可選 Cloudflare Tunnel 對外 |

---

## 功能（與你原始需求對照）

| 你提的需求 | 我們的做法 |
|---|---|
| 「爬」實價登錄全部資料 | **不爬，用官方 Open Data** — 合法、穩定、免封鎖；旬報 = 該系統能做到的最即時 |
| 地圖、查看每地區房價 | `/map`：MapLibre + 平移即查 bbox；點 marker 看單筆 |
| 區域統計與比較 | `/region`：縣市/鄉鎮鑽取，趨勢線、各區排名、價格動能；`/compare`：多區並排 |
| 給購屋建議（含金額） | **改成不會踩法規地雷的 4 個試算工具**（見下） |
| 區域價格波動 | `/region` 有「動能」表（過去 6 個月 vs. 6~12 個月百分比變化） |
| 即時滾動最新資料 | Scheduler 每月 2 / 12 / 22 日凌晨自動拉最新一季；UI 顯示「最新成交日 + 最近 ETL」 |

### 試算工具（避開「給金額建議」的法律風險）

1. **房貸試算** — 標準月付/總息/首年攤還表
2. **可負擔房價** — 用收入 + DTI 上限 + 自備款，倒推合理總價
3. **升息壓力測試** — 利率 +0.5% / +1% / +1.5% / +2% 月付增加多少
4. **租 vs 買** — 給定年限算「買的淨成本」vs「租 + 自備款投資的淨成本」、回本年

### 加碼的功能（讓使用者更好用）

- **資料新鮮度標示**（頂列即時顯示最新成交日 + 上次 ETL 季別）
- **特殊交易過濾**（親友、員工、債務、瑕疵、凶宅 → 排除在統計外）
- **異常值自動排除**（每坪 < 1,000 元 / > 500 萬元的明顯雜訊）
- **相似物件參考價區間**（P25–P50–P75，輸入條件 → 客觀分布，**不**告訴你「該出多少」）
- **價格動能榜**（哪個區半年內最熱 / 最冷）
- **附近成交查詢**（GIS：給座標 + 半徑 → 半徑內所有成交）
- **多區並排比較**（中位、平均、坪數、屋齡）

---

## 5 分鐘起站

```bash
# 1. 在 NAS 或本機，到專案目錄
cp .env.example .env
nano .env   # 改 POSTGRES_PASSWORD

# 2. 起所有服務
docker compose up -d --build

# 3. 跑歷史回填（首次部署，約 30~60 分鐘視網速）
docker compose run --rm etl python -m etl.pipeline --mode backfill --since 110

# 4. 開瀏覽器
open http://localhost:8080
```

之後 scheduler 會自動每旬同步。手動觸發單一季：
```bash
docker compose run --rm etl python -m etl.pipeline --mode season --season 113S4
```

---

## 主機選擇

| 選項 | 推薦度 | 備註 |
|---|---|---|
| **Synology NAS + Cloudflare Tunnel** | ✅ 強推 | 零月費、自帶 HTTPS、不用開 router port、24h 在線 |
| 自架 VPS（Linode/DO/Vultr） | OK | 月費 5~10 USD |
| Google Cloud（Cloud Run + Cloud SQL） | 可行 | 月費 10~15 USD，scaling 簡單；見 `docs/DEPLOY-GCP.md` |

詳細 NAS 部署 → [docs/DEPLOY-SYNOLOGY.md](docs/DEPLOY-SYNOLOGY.md)
GCP 部署 → [docs/DEPLOY-GCP.md](docs/DEPLOY-GCP.md)
架構說明 → [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

## 路線圖（Phase 2，這次先沒做）

- [ ] Geocoding 全自動化：Container 內自架 Nominatim（台灣 OSM extract ~1.5 GB）
- [ ] 學區圖層、捷運站圖層、嫌惡設施圖層（資料源：政府開放資料平臺）
- [ ] 收藏物件 + 新成交通知（Email / LINE Notify）
- [ ] PDF 區域報告匯出
- [ ] 同社區歷年成交（需要更精細的「社區」識別欄位）
- [ ] 預售屋撤銷案件追蹤（官方資料有，需特殊解析）
- [ ] 移動端 PWA、暗色模式自動切換

---

## 法律與資料倫理

- 本站所有統計**僅供參考**，不構成購屋、投資、金融或不動產顧問建議。
- 我們不嘗試還原實價登錄的區段化門牌，也不串接姓名/個資。
- 「特殊關係交易」依官方備註欄關鍵字過濾，**仍可能有遺漏** — 顯著偏離市價之單筆勿依賴。
- 任何決策前請諮詢專業仲介、估價師或代書。

---

## 授權

MIT。資料著作權屬內政部，請遵守該網站的開放資料使用條款。
