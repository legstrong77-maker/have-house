from fastapi import APIRouter, Depends, Response
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..db import get_db

router = APIRouter()

# 給瀏覽器 / CDN 用的快取秒數 (這些資料變動很慢)
_LONG_CACHE  = "public, max-age=3600, stale-while-revalidate=7200"
_SHORT_CACHE = "public, max-age=300,  stale-while-revalidate=600"


@router.get("/counties")
def list_counties(response: Response, db: Session = Depends(get_db)):
    rows = db.execute(text("SELECT code, name FROM county ORDER BY name")).all()
    response.headers["Cache-Control"] = _LONG_CACHE
    return [{"code": r.code, "name": r.name} for r in rows]


@router.get("/districts")
def list_districts(county: str, response: Response, db: Session = Depends(get_db)):
    rows = db.execute(
        text("""SELECT DISTINCT district
                  FROM transactions
                 WHERE county_code = :c
              ORDER BY district"""),
        {"c": county},
    ).all()
    response.headers["Cache-Control"] = _LONG_CACHE
    return [r.district for r in rows]


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
    rows = db.execute(text(
        "SELECT building_type, COUNT(*) AS n "
        "FROM transactions WHERE building_type IS NOT NULL "
        "GROUP BY building_type ORDER BY n DESC"
    )).all()
    response.headers["Cache-Control"] = _LONG_CACHE
    return [{"name": r.building_type, "count": r.n} for r in rows]
