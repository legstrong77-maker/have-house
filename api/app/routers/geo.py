"""地理 / 地圖相關端點。"""
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..db import get_db

router = APIRouter()


@router.get("/points")
def points_in_bbox(
    minLng: float, minLat: float, maxLng: float, maxLat: float,
    deal_kind: str = Query("sale", regex="^(sale|presale|rent)$"),
    months: int = Query(12, ge=1, le=120),
    limit: int = Query(2000, ge=1, le=10000),
    db: Session = Depends(get_db),
):
    """回傳某 bbox 內、近 N 個月的成交點（已 geocode 的部分）。"""
    sql = text("""
        SELECT id, county_code, district, address, building_type,
               total_price, unit_price_per_ping, deal_date,
               ST_X(geom) AS lng, ST_Y(geom) AS lat
          FROM transactions
         WHERE deal_kind = :dk
           AND is_special_deal = FALSE
           AND geom IS NOT NULL
           AND geom && ST_MakeEnvelope(:minLng, :minLat, :maxLng, :maxLat, 4326)
           AND deal_date >= (CURRENT_DATE - (:m || ' months')::interval)
         ORDER BY deal_date DESC
         LIMIT :limit
    """)
    rows = db.execute(sql, {
        "dk": deal_kind, "minLng": minLng, "minLat": minLat,
        "maxLng": maxLng, "maxLat": maxLat, "m": str(months), "limit": limit,
    }).mappings().all()
    return {"count": len(rows), "points": [dict(r) for r in rows]}


@router.get("/district-summary")
def district_summary(
    county: str,
    deal_kind: str = Query("sale", regex="^(sale|presale|rent)$"),
    months: int = Query(12, ge=1, le=120),
    db: Session = Depends(get_db),
):
    """各鄉鎮市區彙總 + 由已 geocode 之點推算的代表座標（地圖縮小時用的熱區覆蓋）。"""
    sql = text("""
        SELECT t.district,
               COUNT(*) AS deals,
               COUNT(*) FILTER (WHERE t.geom IS NOT NULL) AS geo_deals,
               percentile_cont(0.50) WITHIN GROUP (
                 ORDER BY t.unit_price_per_ping
               ) AS median_unit_price_ping,
               percentile_cont(0.25) WITHIN GROUP (
                 ORDER BY t.unit_price_per_ping
               ) AS p25_ping,
               percentile_cont(0.75) WITHIN GROUP (
                 ORDER BY t.unit_price_per_ping
               ) AS p75_ping,
               AVG(ST_X(t.geom)) FILTER (WHERE t.geom IS NOT NULL) AS lng,
               AVG(ST_Y(t.geom)) FILTER (WHERE t.geom IS NOT NULL) AS lat
          FROM transactions t
         WHERE t.county_code = :c
           AND t.deal_kind = :dk
           AND t.is_special_deal = FALSE
           AND t.unit_price_per_ping IS NOT NULL
           AND t.unit_price_per_ping BETWEEN 1000 AND 5000000
           AND t.deal_date >= (CURRENT_DATE - (:m || ' months')::interval)
      GROUP BY t.district
      HAVING COUNT(*) FILTER (WHERE t.geom IS NOT NULL) > 0
      ORDER BY median_unit_price_ping DESC NULLS LAST
    """)
    rows = db.execute(sql, {"c": county, "dk": deal_kind, "m": str(months)}).mappings().all()
    return [dict(r) for r in rows]


@router.get("/nearby")
def nearby(
    lat: float, lng: float,
    radius_m: int = Query(500, ge=50, le=5000),
    deal_kind: str = Query("sale", regex="^(sale|presale|rent)$"),
    months: int = Query(24, ge=1, le=120),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """以使用者選定的點為圓心，找半徑內的成交。"""
    sql = text("""
        SELECT id, address, building_type, total_price, unit_price_per_ping, deal_date,
               age_years, building_area_sqm, total_floors, transfer_floor_num,
               ST_DistanceSphere(geom, ST_SetSRID(ST_MakePoint(:lng,:lat),4326)) AS dist_m,
               ST_X(geom) AS lng, ST_Y(geom) AS lat
          FROM transactions
         WHERE deal_kind = :dk
           AND is_special_deal = FALSE
           AND geom IS NOT NULL
           AND ST_DWithin(geom::geography,
                          ST_SetSRID(ST_MakePoint(:lng,:lat),4326)::geography,
                          :r)
           AND deal_date >= (CURRENT_DATE - (:m || ' months')::interval)
         ORDER BY dist_m ASC
         LIMIT :limit
    """)
    rows = db.execute(sql, {
        "lat": lat, "lng": lng, "r": radius_m, "dk": deal_kind,
        "m": str(months), "limit": limit
    }).mappings().all()
    return [dict(r) for r in rows]
