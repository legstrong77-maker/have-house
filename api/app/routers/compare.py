"""比較 / 同物件分析。"""
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..db import get_db

router = APIRouter()


@router.post("/regions")
def compare_regions(
    payload: dict,
    db: Session = Depends(get_db),
):
    """同時比較多個鄉鎮市區。

    payload = { "regions": [{"county":"f","district":"板橋區"}, ...], "deal_kind":"sale" }
    """
    regions = payload.get("regions", [])
    deal_kind = payload.get("deal_kind", "sale")
    out = []
    for reg in regions:
        row = db.execute(text("""
            SELECT
                COUNT(*) AS deals_12m,
                percentile_cont(0.50) WITHIN GROUP (ORDER BY unit_price_per_ping) AS median_ping,
                AVG(unit_price_per_ping)                                          AS avg_ping,
                AVG(total_price)                                                  AS avg_total,
                AVG(building_area_sqm * 0.3025)                                   AS avg_ping_size,
                AVG(age_years)                                                    AS avg_age
              FROM transactions
             WHERE county_code=:c AND district=:d AND deal_kind=:dk
               AND is_special_deal=FALSE
               AND unit_price_per_ping BETWEEN 1000 AND 5000000
               AND deal_date >= CURRENT_DATE - INTERVAL '12 months'
        """), {"c": reg["county"], "d": reg["district"], "dk": deal_kind}).mappings().first()
        out.append({"region": reg, "stats": dict(row) if row else None})
    return out


@router.get("/similar")
def similar_properties(
    county: str,
    district: str,
    building_type: Optional[str] = None,
    rooms: Optional[int] = None,
    age_min: Optional[float] = None,
    age_max: Optional[float] = None,
    area_ping_min: Optional[float] = None,
    area_ping_max: Optional[float] = None,
    months: int = Query(24, ge=1, le=60),
    limit: int = Query(30, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """找與輸入條件相近的成交（相似物件雷達）。"""
    where = ["county_code=:c", "district=:d", "deal_kind='sale'", "is_special_deal=FALSE",
             "unit_price_per_ping IS NOT NULL",
             "deal_date >= CURRENT_DATE - (:m || ' months')::interval"]
    params: dict = {"c": county, "d": district, "m": str(months)}
    if building_type:
        where.append("building_type=:bt"); params["bt"] = building_type
    if rooms is not None:
        where.append("rooms=:r"); params["r"] = rooms
    if age_min is not None:
        where.append("age_years>=:amn"); params["amn"] = age_min
    if age_max is not None:
        where.append("age_years<=:amx"); params["amx"] = age_max
    if area_ping_min is not None:
        where.append("building_area_sqm * 0.3025 >= :min_ping"); params["min_ping"] = area_ping_min
    if area_ping_max is not None:
        where.append("building_area_sqm * 0.3025 <= :max_ping"); params["max_ping"] = area_ping_max
    params["limit"] = limit

    sql = f"""
        SELECT id, address, building_type, rooms, halls, baths,
               age_years, building_area_sqm, total_price, unit_price_per_ping,
               deal_date, ST_X(geom) AS lng, ST_Y(geom) AS lat
          FROM transactions
         WHERE {' AND '.join(where)}
         ORDER BY deal_date DESC
         LIMIT :limit
    """
    rows = db.execute(text(sql), params).mappings().all()
    if not rows:
        return {"results": [], "estimate": None}

    # 給「客觀參考價區間」（不是建議出價）
    summary = db.execute(text(f"""
        SELECT percentile_cont(0.25) WITHIN GROUP (ORDER BY unit_price_per_ping) AS p25,
               percentile_cont(0.50) WITHIN GROUP (ORDER BY unit_price_per_ping) AS p50,
               percentile_cont(0.75) WITHIN GROUP (ORDER BY unit_price_per_ping) AS p75,
               COUNT(*) AS n
          FROM transactions
         WHERE {' AND '.join(where)}
    """), params).mappings().first()

    return {
        "results": [dict(r) for r in rows],
        "reference_unit_price_per_ping": dict(summary) if summary else None,
        "disclaimer": "上述為相似物件成交分布之客觀統計，並非建議出價。實際合理價需考量物件個別條件、屋況、樓層、面向、管理品質、周邊設施與市場時點等因素。",
    }
