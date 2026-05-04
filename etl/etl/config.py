import os
from pathlib import Path

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://havehouse:havehouse@localhost:5432/havehouse",
)

# 內政部實價登錄 Open Data 下載路徑
# 季資料：每季更新；旬報：每 10 天更新（跑 incremental 用）
MOI_BASE = "https://plvr.land.moi.gov.tw"
MOI_SEASON_URL = f"{MOI_BASE}/DownloadSeason"   # ?season=113S4&type=zip&fileName=lvr_landcsv.zip

DATA_DIR = Path(os.environ.get("DATA_DIR", "/data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

# 縣市代碼 → 名稱（需與 SQL seed 一致）
COUNTY_CODES = {
    "a": "臺北市", "b": "臺中市", "c": "基隆市", "d": "臺南市",
    "e": "高雄市", "f": "新北市", "g": "宜蘭縣", "h": "桃園市",
    "i": "嘉義市", "j": "新竹縣", "k": "苗栗縣", "m": "南投縣",
    "n": "彰化縣", "o": "新竹市", "p": "雲林縣", "q": "嘉義縣",
    "t": "屏東縣", "u": "花蓮縣", "v": "臺東縣", "w": "金門縣",
    "x": "澎湖縣", "z": "連江縣",
}

SQM_PER_PING = 3.305785

# 排程（旬報：每月 1 / 11 / 21 日後一天去抓最新）
SCHEDULE_DAYS = [2, 12, 22]
SCHEDULE_HOUR = 3   # 凌晨 3 點

# Geocoding（自架 Nominatim 或公開服務；公開服務有頻率限制，預設關閉）
NOMINATIM_URL = os.environ.get("NOMINATIM_URL", "")  # 例 http://nominatim:8080
GEOCODE_ENABLED = bool(NOMINATIM_URL)
GEOCODE_RPS = float(os.environ.get("GEOCODE_RPS", "1"))  # 公開 Nominatim 規範 1 req/s
