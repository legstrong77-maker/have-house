"""把 parse 出來的 dict 批次寫入 Postgres。

策略：COPY 進 TEMP 表 → 單條 INSERT...SELECT...ON CONFLICT DO UPDATE 完成 upsert。
比 executemany 快一個量級以上，特別在遠端 / NAS 連線上。
"""
from __future__ import annotations

import json
from typing import Iterable

import psycopg
from loguru import logger

from .normalize import normalize_address
from .config import COUNTY_CODES

_RAW_ROW_PLACEHOLDER = json.dumps({"_": "see source CSV"}, ensure_ascii=False)

# COPY 進 staging 的欄位順序；不含 id / geom / geocode_source / inserted_at（由預設值或後續 attach 處理）
COPY_COLUMNS = [
    "serial_no", "deal_kind", "county_code", "district", "address", "address_normalized",
    "land_area_sqm", "building_area_sqm", "parking_area_sqm",
    "transfer_floor", "transfer_floor_num", "total_floors",
    "building_type", "main_use", "main_material",
    "build_completion", "age_years",
    "rooms", "halls", "baths", "has_partition", "has_management",
    "deal_date", "total_price", "unit_price_per_sqm", "unit_price_per_ping",
    "parking_kind", "parking_price", "note", "is_special_deal",
    "raw_row", "source_file", "source_season",
]

_COLS_CSV = ", ".join(COPY_COLUMNS)

# CREATE TABLE AS ... WHERE FALSE 取得相同欄位型別、但無 NOT NULL/FK/serial 預設
CREATE_STAGE_SQL = """
CREATE TEMP TABLE _stage ON COMMIT DROP AS
SELECT serial_no, deal_kind, county_code, district, address, address_normalized,
       land_area_sqm, building_area_sqm, parking_area_sqm,
       transfer_floor, transfer_floor_num, total_floors,
       building_type, main_use, main_material,
       build_completion, age_years,
       rooms, halls, baths, has_partition, has_management,
       deal_date, total_price, unit_price_per_sqm, unit_price_per_ping,
       parking_kind, parking_price, note, is_special_deal,
       raw_row, source_file, source_season
  FROM transactions WHERE FALSE;
"""

UPSERT_FROM_STAGE_SQL = f"""
INSERT INTO transactions ({_COLS_CSV})
SELECT DISTINCT ON (serial_no, deal_kind) {_COLS_CSV}
  FROM _stage
 ORDER BY serial_no, deal_kind, ctid DESC
ON CONFLICT (serial_no, deal_kind) DO UPDATE SET
    address              = EXCLUDED.address,
    address_normalized   = EXCLUDED.address_normalized,
    deal_date            = EXCLUDED.deal_date,
    total_price          = EXCLUDED.total_price,
    unit_price_per_sqm   = EXCLUDED.unit_price_per_sqm,
    unit_price_per_ping  = EXCLUDED.unit_price_per_ping,
    note                 = EXCLUDED.note,
    is_special_deal      = EXCLUDED.is_special_deal,
    raw_row              = EXCLUDED.raw_row,
    source_file          = EXCLUDED.source_file,
    source_season        = EXCLUDED.source_season,
    inserted_at          = now();
"""


def _prepare(record: dict, source_file: str, season: str) -> dict:
    record = dict(record)
    county_name = COUNTY_CODES.get(record["county_code"])
    record["address_normalized"] = normalize_address(record.get("address"), county_name)
    record["raw_row"] = _RAW_ROW_PLACEHOLDER
    record["source_file"] = source_file
    record["source_season"] = season
    return record


def load_records(
    conn: psycopg.Connection,
    records: Iterable[dict],
    source_file: str,
    season: str,
) -> int:
    """Stream records via COPY into a TEMP table, then upsert in one statement.

    Returns the number of rows affected by the final upsert (inserted + updated).
    """
    staged = 0
    affected = 0
    try:
        with conn.cursor() as cur:
            cur.execute(CREATE_STAGE_SQL)
            with cur.copy(f"COPY _stage ({_COLS_CSV}) FROM STDIN") as cp:
                for r in records:
                    rec = _prepare(r, source_file, season)
                    cp.write_row([rec.get(c) for c in COPY_COLUMNS])
                    staged += 1
                    if staged % 10000 == 0:
                        logger.info(f"  ...staged {staged:,}")
            if staged == 0:
                # 空 CSV：rollback 才能丟掉 _stage，否則下個 CSV 會撞 DuplicateTable
                conn.rollback()
                return 0
            cur.execute(UPSERT_FROM_STAGE_SQL)
            affected = cur.rowcount
        # commit 觸發 ON COMMIT DROP，自動清掉 _stage
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    logger.info(f"  upsert: staged={staged:,} affected={affected:,}")
    return affected


def attach_geocoded_points(conn: psycopg.Connection) -> int:
    """把 geocode_cache 的點寫回 transactions.geom（針對還沒有 geom 的列）。"""
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE transactions t
               SET geom           = ST_SetSRID(ST_MakePoint(g.lng, g.lat), 4326),
                   geocode_source = COALESCE(t.geocode_source, g.source)
              FROM geocode_cache g
             WHERE t.address_normalized = g.address_normalized
               AND t.geom IS NULL
        """)
        affected = cur.rowcount
    conn.commit()
    return affected


def refresh_views(conn: psycopg.Connection) -> None:
    # REFRESH MATERIALIZED VIEW CONCURRENTLY 不能在 transaction 內執行，
    # 改用 autocommit 模式跑這兩條。
    prev = conn.autocommit
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute("REFRESH MATERIALIZED VIEW mv_district_monthly;")
            cur.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY mv_county_summary;")
    finally:
        conn.autocommit = prev
