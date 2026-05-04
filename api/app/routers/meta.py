import time
from threading import Lock
from typing import Any, Callable

from fastapi import APIRouter, Depends, Response
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..db import get_db

router = APIRouter()

# 給瀏覽器 / CDN 用的快取秒數 (這些資料變動很慢)
_LONG_CACHE  = "public, max-age=3600, stale-while-revalidate=7200"
_SHORT_CACHE = "public, max-age=300,  stale-while-revalidate=600"

# 進程內 TTL cache — 給沒有 HTTP cache 的請求 (curl / 第一次訪客)
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


@router.get("/counties")
def list_counties(response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = _LONG_CACHE
    def _q():
        rows = db.execute(text("SELECT code, name FROM county ORDER BY name")).all()
        return [{"code": r.code, "name": r.name} for r in rows]
    return _ttl_get("counties", 3600, _q)


@router.get("/districts")
def list_districts(county: str, response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = _LONG_CACHE
    def _q():
        rows = db.execute(
            text("""SELECT DISTINCT district
                      FROM transactions
                     WHERE county_code = :c
                  ORDER BY district"""),
            {"c": county},
        ).all()
        return [r.district for r in rows]
    return _ttl_get(f"districts:{county}", 3600, _q)


@router.get("/data-freshness")
def freshness(response: Response, db: Session = Depends(get_db)):
    """資料新鮮度：最後一筆成交日 + 最後一次 ETL 時間。"""
    response.headers["Cache-Control"] = _SHORT_CACHE
    last_deal = db.execute(text("SELECT MAX(deal_date) FROM transactions")).scalar()
    last_run = db.execute(text(
        "SELECT season, finished_at, rows_loaded "
        "FROM etl_runs WHERE status='success' "
        "ORDER BY finished_at DESC NULLS LAST LIMIT 1"
    )).first()
    return {
        "last_deal_date": str(last_deal) if last_deal else None,
        "last_etl": {
            "season": last_run.season if last_run else None,
            "finished_at": str(last_run.finished_at) if last_run else None,
            "rows_loaded": last_run.rows_loaded if last_run else None,
        },
    }


@router.get("/building-types")
def list_building_types(response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = _LONG_CACHE
    def _q():
        rows = db.execute(text(
            "SELECT building_type, COUNT(*) AS n "
            "FROM transactions WHERE building_type IS NOT NULL "
            "GROUP BY building_type ORDER BY n DESC"
        )).all()
        return [{"name": r.building_type, "count": r.n} for r in rows]
    # 1 hr server cache —— 25 秒的 query 不能讓每個訪客都付一次
    return _ttl_get("btypes", 3600, _q)
