"""解析內政部實價登錄 CSV。

檔名規則：
  [縣市代碼]_lvr_land_a.csv  -> 不動產買賣
  [縣市代碼]_lvr_land_b.csv  -> 預售屋買賣
  [縣市代碼]_lvr_land_c.csv  -> 不動產租賃

CSV 第一列是英文欄名，第二列是中文欄名說明，第三列起才是資料。
我們以英文欄名為準。
"""
from __future__ import annotations

import re
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Iterator

import pandas as pd
from loguru import logger

from .config import COUNTY_CODES, SQM_PER_PING

DEAL_KIND = {"a": "sale", "b": "presale", "c": "rent"}

# 移轉層次中文 → 數字（部分）
CN_NUM = {
    "零": 0, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5,
    "六": 6, "七": 7, "八": 8, "九": 9, "十": 10,
    "壹": 1, "貳": 2, "參": 3, "肆": 4, "伍": 5,
    "陸": 6, "柒": 7, "捌": 8, "玖": 9, "拾": 10,
}


def discover_files(extract_dir: Path) -> list[Path]:
    """找到所有 *_lvr_land_[abc].csv（a 買賣 / b 預售 / c 租賃）。"""
    out: list[Path] = []
    for p in extract_dir.rglob("*_lvr_land_*.csv"):
        if re.match(r"^[a-z]_lvr_land_[abc]\.csv$", p.name, re.IGNORECASE):
            out.append(p)
    return sorted(out)


def parse_roc_date(s: str) -> date | None:
    """1110105 -> 2022-01-05；空字串或非法 -> None。"""
    if not s or not str(s).strip():
        return None
    s = str(s).strip().rjust(7, "0")
    try:
        roc_y = int(s[:-4])
        m = int(s[-4:-2])
        d = int(s[-2:])
        max_roc = date.today().year - 1911 + 1  # 今年 ROC 年 + 1 年緩衝
        if roc_y <= 0 or roc_y > max_roc or not 1 <= m <= 12 or not 1 <= d <= 31:
            return None
        return date(roc_y + 1911, m, d)
    except (ValueError, TypeError):
        return None


def parse_int(v: Any) -> int | None:
    if v is None or pd.isna(v):
        return None
    try:
        return int(Decimal(str(v).strip()))
    except (InvalidOperation, ValueError):
        return None


def _smallint(n: int | None) -> int | None:
    """夾在 SMALLINT 範圍 (-32768 ~ 32767)；超過視為壞資料 → None。

    Why: 內政部實價登錄偶有人手滑打 '4444444' 之類的房數 / 衛浴數，
    SMALLINT COPY 會炸整個 batch。直接丟掉這格比讓整季 fail 好。"""
    if n is None or not (-32768 <= n <= 32767):
        return None
    return n


def parse_dec(v: Any) -> Decimal | None:
    if v is None or pd.isna(v):
        return None
    try:
        return Decimal(str(v).strip())
    except (InvalidOperation, ValueError):
        return None


def parse_floor(s: Any) -> int | None:
    """'三層' -> 3 ；'地下二層' -> -2；'十二層' -> 12；其餘抓不到 -> None。"""
    if not s or pd.isna(s):
        return None
    txt = str(s).strip()
    if not txt:
        return None
    m = re.search(r"(\d+)", txt)
    if m:
        n = int(m.group(1))
        return -n if "地下" in txt else n
    sign = -1 if "地下" in txt else 1
    txt = txt.replace("地下", "").replace("層", "")
    if not txt:
        return None
    if "十" in txt:
        a, _, b = txt.partition("十")
        tens = CN_NUM.get(a, 1) if a else 1
        ones = CN_NUM.get(b, 0) if b else 0
        return sign * (tens * 10 + ones)
    if txt in CN_NUM:
        return sign * CN_NUM[txt]
    return None


def parse_completion(s: Any) -> date | None:
    return parse_roc_date(s)


def parse_yes(s: Any) -> bool | None:
    if s is None or pd.isna(s):
        return None
    t = str(s).strip()
    if t in ("有",):
        return True
    if t in ("無",):
        return False
    return None


def detect_special_deal(note: str | None) -> bool:
    if not note:
        return False
    keywords = ["親友", "員工", "債務", "瑕疵", "凶宅", "受贈", "急售", "急讓", "受迫", "特殊"]
    return any(k in note for k in keywords)


def parse_csv(path: Path) -> Iterator[dict]:
    """逐筆 yield 標準化好的 dict（尚未 normalize 地址 / geocode）。"""
    fname = path.name.lower()
    m = re.match(r"^([a-z])_lvr_land_([abc])\.csv$", fname)
    if not m:
        logger.warning(f"檔名未匹配，略過：{path}")
        return
    county_code = m.group(1)
    deal_kind = DEAL_KIND[m.group(2)]
    if county_code not in COUNTY_CODES:
        logger.warning(f"未知縣市代碼 {county_code}，略過：{path}")
        return

    # 第二列是中文欄名說明，要跳過
    # on_bad_lines="skip" 處理少數列欄位數對不上（備註含逗號未 quote）
    try:
        df = pd.read_csv(
            path, dtype=str, keep_default_na=False, encoding="utf-8",
            low_memory=False, on_bad_lines="skip",
        )
    except UnicodeDecodeError:
        df = pd.read_csv(
            path, dtype=str, keep_default_na=False, encoding="utf-8-sig",
            low_memory=False, on_bad_lines="skip",
        )
    if len(df) > 0 and df.iloc[0].astype(str).str.contains("區段位置").any():
        df = df.iloc[1:].reset_index(drop=True)
    elif len(df) > 0:
        first_row_joined = " ".join(str(v) for v in df.iloc[0].values)
        if any(k in first_row_joined for k in ["鄉鎮", "交易標的", "土地位置"]):
            df = df.iloc[1:].reset_index(drop=True)

    cols = {c.strip(): c for c in df.columns}

    def col(*candidates: str) -> str | None:
        for c in candidates:
            if c in cols:
                return cols[c]
        return None

    c_district  = col("The villages and towns urban district", "鄉鎮市區")
    c_addr      = col("The road or street, lane and alley", "land sector position building sector house number plate", "土地位置建物門牌")
    c_land_area = col("land shifting total area square meter", "土地移轉總面積平方公尺")
    c_bldg_area = col("building shifting total area", "building shifting total area square meter", "建物移轉總面積平方公尺")
    c_park_area = col("berth shifting total area square meter", "車位移轉總面積平方公尺")
    c_floor     = col("shifting level", "transferring floor", "移轉層次")
    c_total_fl  = col("total floor number", "總樓層數")
    c_btype     = col("building state", "建物型態")
    c_main_use  = col("main use", "主要用途")
    c_material  = col("main building materials", "主要建材")
    c_complete  = col("construction to complete the years", "建築完成年月")
    c_rooms     = col("building present situation pattern - room", "建物現況格局-房")
    c_halls     = col("building present situation pattern - hall", "建物現況格局-廳")
    c_baths     = col("building present situation pattern - health", "建物現況格局-衛")
    c_partition = col("building present situation pattern - compartmented", "建物現況格局-隔間")
    c_mgmt      = col("Whether there is manages the organization", "有無管理組織")
    c_deal_dt   = col("transaction year month and day", "交易年月日")
    c_total_pr  = col("total price NTD", "總價元")
    c_unit_pr   = col("the unit price (NTD / square meter)", "單價元平方公尺")
    c_park_kind = col("the berth category", "車位類別")
    c_park_pr   = col("the berth total price NTD", "車位總價元")
    c_note      = col("the note", "備註")
    c_serial    = col("serial number", "編號")

    # df.to_dict('records') 比 df.iterrows() 快 5-10x（iterrows 每列都建一個 Series）
    for row in df.to_dict("records"):
        deal_dt = parse_roc_date(row.get(c_deal_dt) if c_deal_dt else None)
        if deal_dt is None:
            continue

        bldg_area = parse_dec(row.get(c_bldg_area) if c_bldg_area else None)
        unit_per_sqm = parse_dec(row.get(c_unit_pr) if c_unit_pr else None)
        unit_per_ping = (unit_per_sqm * Decimal(SQM_PER_PING)) if unit_per_sqm else None

        completion = parse_completion(row.get(c_complete) if c_complete else None)
        age = None
        if completion and deal_dt:
            age = round((deal_dt - completion).days / 365.25, 1)

        note_text = (row.get(c_note) if c_note else None) or ""
        record = {
            "serial_no": (row.get(c_serial) if c_serial else "") or "",
            "deal_kind": deal_kind,
            "county_code": county_code,
            "district": (row.get(c_district) if c_district else "") or "",
            "address": (row.get(c_addr) if c_addr else None),
            "land_area_sqm": parse_dec(row.get(c_land_area) if c_land_area else None),
            "building_area_sqm": bldg_area,
            "parking_area_sqm": parse_dec(row.get(c_park_area) if c_park_area else None),
            "transfer_floor": (row.get(c_floor) if c_floor else None),
            "transfer_floor_num": parse_floor(row.get(c_floor) if c_floor else None),
            "total_floors": parse_floor(row.get(c_total_fl) if c_total_fl else None),
            "building_type": (row.get(c_btype) if c_btype else None),
            "main_use": (row.get(c_main_use) if c_main_use else None),
            "main_material": (row.get(c_material) if c_material else None),
            "build_completion": completion,
            "age_years": age,
            "rooms": _smallint(parse_int(row.get(c_rooms) if c_rooms else None)),
            "halls": _smallint(parse_int(row.get(c_halls) if c_halls else None)),
            "baths": _smallint(parse_int(row.get(c_baths) if c_baths else None)),
            "has_partition": parse_yes(row.get(c_partition) if c_partition else None),
            "has_management": parse_yes(row.get(c_mgmt) if c_mgmt else None),
            "deal_date": deal_dt,
            "total_price": parse_int(row.get(c_total_pr) if c_total_pr else None),
            "unit_price_per_sqm": unit_per_sqm,
            "unit_price_per_ping": unit_per_ping,
            "parking_kind": (row.get(c_park_kind) if c_park_kind else None),
            "parking_price": parse_int(row.get(c_park_pr) if c_park_pr else None),
            "note": note_text or None,
            "is_special_deal": detect_special_deal(note_text),
        }
        if not record["serial_no"]:
            continue
        yield record
