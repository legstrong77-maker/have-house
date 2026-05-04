import time
from datetime import date
from threading import Lock
from typing import Any, Callable, Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..db import get_db

router = APIRouter()

_CACHE_MED  = "public, max-age=300, stale-while-revalidate=600"   # 5 min
_CACHE_LONG = "public, max-age=900, stale-while-revalidate=1800"  # 15 min

_cache: dict[str, tuple[float, Any]] = {}
_cache_lock = Lock()


def _ttl_get(key: str, ttl: float, factory: Callable[[], Any]) -> Any:
    now = time.monotonic()
    with _cache_lock:
        hit = _cache.get(key)
        if hit and (now - hit[0]) < ttl:
            return hit[1]
    val = factory()
    with _cache_lock:
        _cache[key] = (now, val)
    return val


@router.get("")
def search(
    response: Response,
    county: Optional[str] = None,
    district: Optional[str] = None,
    deal_kind: str = Query("sale", regex="^(sale|presale|rent)$"),
    building_type: Optional[str] = None,
    min_price: Optional[int] = None,
    max_price: Optional[int] = None,
    min_age: Optional[float] = None,
    max_age: Optional[float] = None,
    min_ping: Optional[float] = None,
    max_ping: Optional[float] = None,
    rooms: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    exclude_special: bool = True,
    residential_only: bool = True,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    sort: str = Query("deal_date", regex="^(deal_date|unit_price_per_ping|total_price)$"),
    order: str = Query("desc", regex="^(asc|desc)$"),
    db: Session = Depends(get_db),
):
    # 同樣參數 5 分鐘內回 cache，瀏覽器 + server 兩層
    response.headers["Cache-Control"] = _CACHE_MED
    cache_key = (
        f"tx:{county}:{district}:{deal_kind}:{building_type}:"
        f"{min_price}:{max_price}:{min_age}:{max_age}:{min_ping}:{max_ping}:"
        f"{rooms}:{date_from}:{date_to}:{exclude_special}:{residential_only}:"
        f"{sort}:{order}:{limit}:{offset}"
    )
    return _ttl_get(cache_key, 300, lambda: _search_impl(
        county, district, deal_kind, building_type,
        min_price, max_price, min_age, max_age, min_ping, max_ping,
        rooms, date_from, date_to, exclude_special, residential_only,
        limit, offset, sort, order, db,
    ))


def _search_impl(
    county, district, deal_kind, building_type,
    min_price, max_price, min_age, max_age, min_ping, max_ping,
    rooms, date_from, date_to, exclude_special, residential_only,
    limit, offset, sort, order, db,
):
    where = ["deal_kind = :deal_kind"]
    params: dict = {"deal_kind": deal_kind}
    if county:
        where.append("county_code = :county"); params["county"] = county
    if district:
        where.append("district = :district"); params["district"] = district
    if building_type:
        where.append("building_type = :bt"); params["bt"] = building_type
    if min_price is not None:
        where.append("total_price >= :minp"); params["minp"] = min_price
    if max_price is not None:
        where.append("total_price <= :maxp"); params["maxp"] = max_price
    if min_age is not None:
        where.append("age_years >= :mina"); params["mina"] = min_age
    if max_age is not None:
        where.append("age_years <= :maxa"); params["maxa"] = max_age
    if min_ping is not None:
        where.append("building_area_sqm >= :min_sqm"); params["min_sqm"] = float(min_ping) / 0.3025
    if max_ping is not None:
        where.append("building_area_sqm <= :max_sqm"); params["max_sqm"] = float(max_ping) / 0.3025
    if rooms is not None:
        where.append("rooms = :rooms"); params["rooms"] = rooms
    if date_from:
        where.append("deal_date >= :df"); params["df"] = date_from
    if date_to:
        where.append("deal_date <= :dt"); params["dt"] = date_to
    if exclude_special:
        where.append("is_special_deal = FALSE")
    if residential_only:
        # 排除明顯非住宅或極小坪數異常列
        where.append("unit_price_per_ping IS NOT NULL")
        where.append("building_area_sqm >= 20")
        where.append("(building_type IS NULL OR building_type NOT IN ('其他','工廠','倉庫','店面','辦公商業大樓','土地','農舍'))")

    where_sql = " AND ".join(where)
    params["limit"] = limit
    params["offset"] = offset

    # 加入 id 作為次要排序鍵，避免相同主鍵造成分頁不穩定
    sql = f"""
        SELECT id, county_code, district, address, building_type,
               total_floors, transfer_floor_num, age_years,
               rooms, halls, baths,
               building_area_sqm, total_price, unit_price_per_ping,
               deal_date, deal_kind, is_special_deal,
               ST_Y(geom) AS lat, ST_X(geom) AS lng
          FROM transactions
         WHERE {where_sql}
         ORDER BY {sort} {order.upper()}, id ASC
         LIMIT :limit OFFSET :offset
    """
    rows = db.execute(text(sql), params).mappings().all()

    return {
        "results": [dict(r) for r in rows],
        "limit": limit,
        "offset": offset,
    }


@router.get("/count")
def count(
    response: Response,
    county: Optional[str] = None,
    district: Optional[str] = None,
    deal_kind: str = Query("sale", regex="^(sale|presale|rent)$"),
    building_type: Optional[str] = None,
    min_price: Optional[int] = None,
    max_price: Optional[int] = None,
    min_age: Optional[float] = None,
    max_age: Optional[float] = None,
    min_ping: Optional[float] = None,
    max_ping: Optional[float] = None,
    rooms: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    exclude_special: bool = True,
    residential_only: bool = True,
    db: Session = Depends(get_db),
):
    """獨立 count 端點 — 用 EXPLAIN 估算大資料表筆數，避免每次翻頁全表掃描。"""
    response.headers["Cache-Control"] = _CACHE_MED
    cache_key = (
        f"cnt:{county}:{district}:{deal_kind}:{building_type}:"
        f"{min_price}:{max_price}:{min_age}:{max_age}:{min_ping}:{max_ping}:"
        f"{rooms}:{date_from}:{date_to}:{exclude_special}:{residential_only}"
    )
    return _ttl_get(cache_key, 300, lambda: _count_impl(
        county, district, deal_kind, building_type,
        min_price, max_price, min_age, max_age, min_ping, max_ping,
        rooms, date_from, date_to, exclude_special, residential_only, db,
    ))


def _count_impl(
    county, district, deal_kind, building_type,
    min_price, max_price, min_age, max_age, min_ping, max_ping,
    rooms, date_from, date_to, exclude_special, residential_only, db,
):
    where = ["deal_kind = :deal_kind"]
    params: dict = {"deal_kind": deal_kind}
    if county:        where.append("county_code = :county"); params["county"] = county
    if district:      where.append("district = :district"); params["district"] = district
    if building_type: where.append("building_type = :bt"); params["bt"] = building_type
    if min_price is not None:
        where.append("total_price >= :minp"); params["minp"] = min_price
    if max_price is not None:
        where.append("total_price <= :maxp"); params["maxp"] = max_price
    if min_age is not None:
        where.append("age_years >= :mina"); params["mina"] = min_age
    if max_age is not None:
        where.append("age_years <= :maxa"); params["maxa"] = max_age
    if min_ping is not None:
        where.append("building_area_sqm >= :min_sqm"); params["min_sqm"] = float(min_ping) / 0.3025
    if max_ping is not None:
        where.append("building_area_sqm <= :max_sqm"); params["max_sqm"] = float(max_ping) / 0.3025
    if rooms is not None:
        where.append("rooms = :rooms"); params["rooms"] = rooms
    if date_from:     where.append("deal_date >= :df"); params["df"] = date_from
    if date_to:       where.append("deal_date <= :dt"); params["dt"] = date_to
    if exclude_special:
        where.append("is_special_deal = FALSE")
    if residential_only:
        where.append("unit_price_per_ping IS NOT NULL")
        where.append("building_area_sqm >= 20")
        where.append("(building_type IS NULL OR building_type NOT IN ('其他','工廠','倉庫','店面','辦公商業大樓','土地','農舍'))")
    where_sql = " AND ".join(where)
    n = db.execute(text(f"SELECT COUNT(*) FROM transactions WHERE {where_sql}"), params).scalar() or 0
    return {"total": int(n)}


@router.get("/{tx_id}/neighbors")
def neighbors(
    tx_id: int,
    months: int = Query(36, ge=1, le=120),
    limit: int = Query(30, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """同地段（同路名）成交歷史 — 用 address 前段（去掉門牌號）匹配。"""
    base = db.execute(text("""
        SELECT id, county_code, district, address,
               regexp_replace(COALESCE(address,''), '\\d+(-\\d+)?號.*$', '') AS road_seg,
               geom
          FROM transactions WHERE id = :id
    """), {"id": tx_id}).mappings().first()
    if not base:
        return {"results": [], "road_seg": None}
    road_seg = (base["road_seg"] or "").strip()
    if not road_seg:
        return {"results": [], "road_seg": None}

    rows = db.execute(text("""
        SELECT id, address, building_type,
               total_price, unit_price_per_ping,
               age_years, building_area_sqm,
               rooms, halls, baths,
               total_floors, transfer_floor_num,
               deal_date, deal_kind, is_special_deal
          FROM transactions
         WHERE county_code = :c AND district = :d
           AND id != :self_id
           AND address ILIKE :prefix
           AND deal_date >= CURRENT_DATE - (:m || ' months')::interval
           AND is_special_deal = FALSE
         ORDER BY deal_date DESC, id ASC
         LIMIT :limit
    """), {
        "c": base["county_code"], "d": base["district"], "self_id": tx_id,
        "prefix": road_seg + "%", "m": str(months), "limit": limit,
    }).mappings().all()
    return {"road_seg": road_seg, "results": [dict(r) for r in rows]}


@router.get("/{tx_id}/yield-estimate")
def yield_estimate(tx_id: int, db: Session = Depends(get_db)):
    """估算同區同類別的租金中位 → 對該物件粗估投報率。"""
    base = db.execute(text("""
        SELECT total_price, building_area_sqm, county_code, district, building_type
          FROM transactions WHERE id = :id
    """), {"id": tx_id}).mappings().first()
    if not base or not base["total_price"] or not base["building_area_sqm"]:
        return None

    # 同區同建物型態的租金 / 平方公尺中位（過去 24 個月）
    rent = db.execute(text("""
        SELECT percentile_cont(0.50) WITHIN GROUP (
                 ORDER BY total_price / NULLIF(building_area_sqm, 0)
               ) AS median_rent_per_sqm,
               COUNT(*) AS n
          FROM transactions
         WHERE county_code = :c AND district = :d AND deal_kind = 'rent'
           AND building_area_sqm > 5
           AND deal_date >= CURRENT_DATE - INTERVAL '24 months'
    """), {"c": base["county_code"], "d": base["district"]}).mappings().first()

    if not rent or not rent["median_rent_per_sqm"] or rent["n"] < 5:
        return {"estimate": None, "samples": rent["n"] if rent else 0}

    monthly = float(rent["median_rent_per_sqm"]) * float(base["building_area_sqm"])
    annual = monthly * 12
    yield_pct = annual / float(base["total_price"])
    return {
        "estimated_monthly_rent": round(monthly, 0),
        "estimated_annual_rent": round(annual, 0),
        "gross_yield": round(yield_pct, 4),
        "samples": rent["n"],
        "note": "毛投報率 = 同區租金中位 × 12 ÷ 此物件總價；未扣除稅費、管理費、空置率。",
    }


@router.get("/{tx_id}")
def get_one(tx_id: int, db: Session = Depends(get_db)):
    row = db.execute(text("""
        SELECT id, county_code, district, address, building_type, main_use, main_material,
               build_completion, age_years,
               total_floors, transfer_floor_num,
               rooms, halls, baths, has_partition, has_management,
               land_area_sqm, building_area_sqm, parking_area_sqm,
               total_price, unit_price_per_ping, parking_price, parking_kind,
               deal_date, deal_kind, note, is_special_deal,
               ST_Y(geom) AS lat, ST_X(geom) AS lng
          FROM transactions WHERE id = :id
    """), {"id": tx_id}).mappings().first()
    if not row:
        return {"error": "not found"}, 404
    return dict(row)
