"""下載內政部實價登錄 Open Data ZIP。"""
from __future__ import annotations

import zipfile
from datetime import date
from pathlib import Path

import httpx
from loguru import logger
from tenacity import retry, stop_after_attempt, wait_exponential

from .config import DATA_DIR, MOI_SEASON_URL


def latest_season(today: date | None = None) -> str:
    """回傳目前可用的最新季資料代號，例：'113S4'。

    內政部官方季資料一般在 季結束後約 6 週 公告。保險起見，本函式回傳
    *上一季* 作為「目前一定下載得到」的最新值。"""
    today = today or date.today()
    roc_year = today.year - 1911
    season = (today.month - 1) // 3 + 1
    season -= 1
    if season <= 0:
        season = 4
        roc_year -= 1
    return f"{roc_year}S{season}"


def all_seasons_since(start_year_roc: int = 110) -> list[str]:
    """自指定 ROC 年起到最新一季的所有 season 代號。"""
    latest = latest_season()
    latest_year = int(latest.split("S")[0])
    latest_q = int(latest.split("S")[1])
    out: list[str] = []
    for y in range(start_year_roc, latest_year + 1):
        for q in (1, 2, 3, 4):
            if y == latest_year and q > latest_q:
                break
            out.append(f"{y}S{q}")
    return out


@retry(stop=stop_after_attempt(4), wait=wait_exponential(min=2, max=30))
def download_season(season: str, dest_dir: Path | None = None) -> Path:
    """下載指定季的 ZIP，回傳本地路徑。"""
    dest_dir = dest_dir or DATA_DIR
    dest_dir.mkdir(parents=True, exist_ok=True)
    out = dest_dir / f"lvr_{season}.zip"

    if out.exists() and out.stat().st_size > 0:
        logger.info(f"[skip] {season} 已存在 -> {out}")
        return out

    params = {"season": season, "type": "zip", "fileName": "lvr_landcsv.zip"}
    logger.info(f"[get] season={season} {MOI_SEASON_URL}?{params}")
    with httpx.Client(timeout=120.0, follow_redirects=True) as client:
        r = client.get(MOI_SEASON_URL, params=params)
        r.raise_for_status()
        if not r.content or r.content[:2] != b"PK":
            raise RuntimeError(f"下載到非 ZIP 內容（{len(r.content)} bytes），可能該季尚未公告")
        out.write_bytes(r.content)
    logger.info(f"[ok ] {season} -> {out} ({out.stat().st_size:,} bytes)")
    return out


def extract(zip_path: Path) -> Path:
    """解壓 ZIP 到同目錄下的子資料夾，回傳該資料夾。"""
    extract_dir = zip_path.with_suffix("")
    extract_dir.mkdir(exist_ok=True)
    with zipfile.ZipFile(zip_path, "r") as z:
        z.extractall(extract_dir)
    return extract_dir
