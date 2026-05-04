"""統計與趨勢端點。"""
import time
from datetime import date
from threading import Lock
from typing import Any, Callable, Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..db import get_db

router = APIRouter()

# ──────────────────────────────────────────────────────────
# Cache-Control headers (給瀏覽器跟 CDN 用)
# ──────────────────────────────────────────────────────────
_CACHE_LONG  = "public, max-age=900,  stale-while-revalidate=1800"   # 15 min
_CACHE_MED   = "public, max-age=300,  stale-while-revalidate=600"    # 5 min
_CACHE_SHORT = "public, max-age=60,   stale-while-revalidate=120"    # 1 min

# ──────────────────────────────────────────────────────────
# 進程內 TTL 快取 — 給昂貴查詢用
# ──────────────────────────────────────────────────────────
_cache: dict[str, tuple[float, Any]] = {}
_cache_lock = Lock()


def _ttl_get(key: str, ttl: float, factory: Callable[[], Any]) -> Any:
    """簡易 TTL cache — single process, thread-safe。"""
    now = time.monotonic()
    with _cache_lock:
        hit = _cache.get(key)
        if hit and (now - hit[0]) < ttl:
            return hit[1]
    val = factory()
    with _cache_lock:
        _cache[key] = (now, val)
    return val


@router.get("/county-summary")
def county_summary(
    response: Response,
    deal_kind: str = Query("sale", regex="^(sale|presale|rent)$"),
    db: Session = Depends(get_db),
):
    response.headers["Cache-Control"] = _CACHE_LONG
    def _q():
        rows = db.execute(text("""
            SELECT mv.county_code, c.name AS county_name,
                   mv.total_deals, mv.last_deal_date,
                   mv.avg_unit_price_ping, mv.median_unit_price_ping
              FROM mv_county_summary mv
              JOIN county c ON c.code = mv.county_code
             WHERE mv.deal_kind = :dk
          ORDER BY median_unit_price_ping DESC NULLS LAST
        """), {"dk": deal_kind}).mappings().all()
        return [dict(r) for r in rows]
    return _ttl_get(f"cs:{deal_kind}", 900, _q)


@router.get("/district-monthly")
def district_monthly(
    response: Response,
    county: str,
    district: Optional[str] = None,
    deal_kind: str = Query("sale", regex="^(sale|presale|rent)$"),
    months: int = Query(36, ge=1, le=120),
    db: Session = Depends(get_db),
):
    response.headers["Cache-Control"] = _CACHE_LONG
    """指定鄉鎮的月度趨勢；不指定 district 則回傳整個縣市彙總。"""
    sql = """
        SELECT month::date AS month,
               SUM(deals) AS deals,
               (SUM(deals * median_unit_price_ping) / NULLIF(SUM(deals), 0)) AS median_unit_price_ping,
               (SUM(deals * avg_unit_price_ping)    / NULLIF(SUM(deals), 0)) AS avg_unit_price_ping
          FROM mv_district_monthly
         WHERE county_code = :c
           AND deal_kind = :dk
           AND month >= (CURRENT_DATE - (:months || ' months')::interval)
    """
    params = {"c": county, "dk": deal_kind, "months": str(months)}
    if district:
        sql += " AND district = :d"; params["d"] = district
    sql += " GROUP BY month ORDER BY month"
    rows = db.execute(text(sql), params).mappings().all()
    return [dict(r) for r in rows]


@router.get("/distribution")
def price_distribution(
    response: Response,
    county: str,
    district: Optional[str] = None,
    deal_kind: str = Query("sale", regex="^(sale|presale|rent)$"),
    months: int = Query(12, ge=1, le=60),
    db: Session = Depends(get_db),
):
    response.headers["Cache-Control"] = _CACHE_LONG
    cache_key = f"dist:{county}:{district}:{deal_kind}:{months}"
    return _ttl_get(cache_key, 900, lambda: _distribution_impl(
        county, district, deal_kind, months, db,
    ))


def _distribution_impl(
    county: str, district: Optional[str], deal_kind: str, months: int, db: Session,
):
    """同區同類產品的單價直方圖（每坪），用於同物件比較。"""
    where = ["county_code = :c", "deal_kind = :dk", "is_special_deal = FALSE",
             "unit_price_per_ping IS NOT NULL",
             "deal_date >= (CURRENT_DATE - (:m || ' months')::interval)",
             "unit_price_per_ping BETWEEN 1000 AND 5000000"]
    params = {"c": county, "dk": deal_kind, "m": str(months)}
    if district:
        where.append("district = :d"); params["d"] = district
    sql = f"""
        WITH src AS (
            SELECT unit_price_per_ping AS p FROM transactions
             WHERE {' AND '.join(where)}
        ),
        bins AS (
            SELECT width_bucket(p, 0, 5000000, 50) AS bin, COUNT(*) AS n,
                   MIN(p) AS lo, MAX(p) AS hi
              FROM src GROUP BY 1
        )
        SELECT bin, n, lo, hi FROM bins ORDER BY bin
    """
    rows = db.execute(text(sql), params).mappings().all()
    stats = db.execute(text(f"""
        SELECT COUNT(*) AS n,
               percentile_cont(0.10) WITHIN GROUP (ORDER BY unit_price_per_ping) AS p10,
               percentile_cont(0.25) WITHIN GROUP (ORDER BY unit_price_per_ping) AS p25,
               percentile_cont(0.50) WITHIN GROUP (ORDER BY unit_price_per_ping) AS p50,
               percentile_cont(0.75) WITHIN GROUP (ORDER BY unit_price_per_ping) AS p75,
               percentile_cont(0.90) WITHIN GROUP (ORDER BY unit_price_per_ping) AS p90,
               AVG(unit_price_per_ping) AS mean
          FROM transactions WHERE {' AND '.join(where)}
    """), params).mappings().first()
    return {"bins": [dict(r) for r in rows], "stats": dict(stats) if stats else None}


@router.get("/heatmap")
def heatmap(
    response: Response,
    county: str,
    deal_kind: str = Query("sale", regex="^(sale|presale|rent)$"),
    months: int = Query(12, ge=1, le=60),
    db: Session = Depends(get_db),
):
    """各鄉鎮市區的當前中位數，給地圖上色。"""
    response.headers["Cache-Control"] = _CACHE_LONG
    cache_key = f"heat:{county}:{deal_kind}:{months}"
    return _ttl_get(cache_key, 900, lambda: _heatmap_impl(county, deal_kind, months, db))


def _heatmap_impl(county: str, deal_kind: str, months: int, db: Session):
    rows = db.execute(text("""
        SELECT district,
               COUNT(*) AS deals,
               percentile_cont(0.50) WITHIN GROUP (ORDER BY unit_price_per_ping) AS median_price_ping
          FROM transactions
         WHERE county_code = :c
           AND deal_kind = :dk
           AND is_special_deal = FALSE
           AND unit_price_per_ping IS NOT NULL
           AND unit_price_per_ping BETWEEN 1000 AND 5000000
           AND deal_date >= (CURRENT_DATE - (:m || ' months')::interval)
      GROUP BY district
      ORDER BY median_price_ping DESC NULLS LAST
    """), {"c": county, "dk": deal_kind, "m": str(months)}).mappings().all()
    return [dict(r) for r in rows]


@router.get("/underpriced")
def underpriced(
    response: Response,
    county: Optional[str] = None,
    district: Optional[str] = None,
    threshold: float = Query(0.85, ge=0.5, le=1.0, description="低於同區同類別 P25 的幾倍視為撿漏"),
    months: int = Query(6, ge=1, le=24),
    limit: int = Query(50, ge=1, le=300),
    db: Session = Depends(get_db),
):
    """撿漏雷達：找出近 N 個月成交中，單價明顯低於同區同類別 P25 的物件。"""
    response.headers["Cache-Control"] = _CACHE_LONG
    cache_key = f"under:{county}:{district}:{threshold}:{months}:{limit}"
    return _ttl_get(cache_key, 900, lambda: _underpriced_impl(
        county, district, threshold, months, limit, db,
    ))


def _underpriced_impl(
    county: Optional[str], district: Optional[str], threshold: float,
    months: int, limit: int, db: Session,
):
    where_recent = ["t.deal_kind = 'sale'", "t.is_special_deal = FALSE",
                    "t.unit_price_per_ping IS NOT NULL",
                    "t.unit_price_per_ping BETWEEN 1000 AND 5000000",
                    "t.building_area_sqm >= 20",
                    "t.deal_date >= CURRENT_DATE - (:m || ' months')::interval"]
    params: dict = {"m": str(months), "th": threshold, "limit": limit}
    if county:
        where_recent.append("t.county_code = :c"); params["c"] = county
    if district:
        where_recent.append("t.district = :d"); params["d"] = district

    sql = f"""
        WITH p25 AS (
          SELECT county_code, district, building_type,
                 percentile_cont(0.25) WITHIN GROUP (ORDER BY unit_price_per_ping) AS p25_ping,
                 COUNT(*) AS n
            FROM transactions
           WHERE deal_kind='sale' AND is_special_deal=FALSE
             AND unit_price_per_ping BETWEEN 1000 AND 5000000
             AND building_area_sqm >= 20
             AND deal_date >= CURRENT_DATE - INTERVAL '24 months'
        GROUP BY 1,2,3
          HAVING COUNT(*) >= 10
        )
        SELECT t.id, t.county_code, t.district, t.address, t.building_type,
               t.total_price, t.unit_price_per_ping, t.deal_date,
               t.age_years, t.building_area_sqm,
               t.rooms, t.halls, t.baths,
               t.total_floors, t.transfer_floor_num, t.is_special_deal,
               p.p25_ping AS region_p25_ping,
               (t.unit_price_per_ping / p.p25_ping) AS price_ratio
          FROM transactions t
          JOIN p25 p ON p.county_code = t.county_code
                    AND p.district    = t.district
                    AND p.building_type = t.building_type
         WHERE {' AND '.join(where_recent)}
           AND t.unit_price_per_ping <= p.p25_ping * :th
         ORDER BY price_ratio ASC
         LIMIT :limit
    """
    rows = db.execute(text(sql), params).mappings().all()
    return [dict(r) for r in rows]


@router.get("/momentum")
def momentum(
    response: Response,
    county: str,
    deal_kind: str = Query("sale", regex="^(sale|presale|rent)$"),
    db: Session = Depends(get_db),
):
    """價格動能：各區「過去 6 個月中位 vs. 過去 6~12 個月中位」漲跌幅。"""
    response.headers["Cache-Control"] = _CACHE_LONG
    cache_key = f"mom:{county}:{deal_kind}"
    return _ttl_get(cache_key, 900, lambda: _momentum_impl(county, deal_kind, db))


def _momentum_impl(county: str, deal_kind: str, db: Session):
    rows = db.execute(text("""
        WITH recent AS (
          SELECT district,
                 percentile_cont(0.50) WITHIN GROUP (ORDER BY unit_price_per_ping) AS p_now,
                 COUNT(*) AS n_now
            FROM transactions
           WHERE county_code = :c AND deal_kind = :dk
             AND is_special_deal = FALSE AND unit_price_per_ping IS NOT NULL
             AND unit_price_per_ping BETWEEN 1000 AND 5000000
             AND deal_date >= (CURRENT_DATE - INTERVAL '6 months')
        GROUP BY district
        ),
        prior AS (
          SELECT district,
                 percentile_cont(0.50) WITHIN GROUP (ORDER BY unit_price_per_ping) AS p_prev,
                 COUNT(*) AS n_prev
            FROM transactions
           WHERE county_code = :c AND deal_kind = :dk
             AND is_special_deal = FALSE AND unit_price_per_ping IS NOT NULL
             AND unit_price_per_ping BETWEEN 1000 AND 5000000
             AND deal_date >= (CURRENT_DATE - INTERVAL '12 months')
             AND deal_date <  (CURRENT_DATE - INTERVAL '6 months')
        GROUP BY district
        )
        SELECT r.district, r.p_now, p.p_prev, r.n_now, p.n_prev,
               (r.p_now - p.p_prev) / NULLIF(p.p_prev, 0) AS pct_change
          FROM recent r LEFT JOIN prior p USING (district)
      ORDER BY pct_change DESC NULLS LAST
    """), {"c": county, "dk": deal_kind}).mappings().all()
    return [dict(r) for r in rows]
