"""Geocoding：地址 → 經緯度。

預設：先查 geocode_cache，命中則用；未命中則（若有設 NOMINATIM_URL）打 Nominatim。
為遵守 Nominatim 公開服務政策，請自架（Docker：mediagis/nominatim）。
若沒設定地理編碼服務，這層會跳過，後端用區位中心點代替（在 API 層處理）。
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Iterable

import httpx
import psycopg
from loguru import logger

from .config import GEOCODE_ENABLED, GEOCODE_RPS, NOMINATIM_URL


@dataclass
class GeoResult:
    lat: float
    lng: float
    accuracy: str = "street"
    source: str = "nominatim"


class Geocoder:
    def __init__(self, conn: psycopg.Connection):
        self.conn = conn
        self._sleep = 1.0 / max(GEOCODE_RPS, 0.1)
        self._last_call = 0.0

    def lookup_cached(self, addr: str) -> GeoResult | None:
        with self.conn.cursor() as cur:
            cur.execute(
                "SELECT lat, lng, accuracy, source FROM geocode_cache WHERE address_normalized=%s",
                (addr,),
            )
            row = cur.fetchone()
            if row:
                return GeoResult(lat=row[0], lng=row[1], accuracy=row[2] or "street", source="cached")
        return None

    def store(self, addr: str, gr: GeoResult) -> None:
        with self.conn.cursor() as cur:
            cur.execute(
                """INSERT INTO geocode_cache (address_normalized, lat, lng, source, accuracy)
                   VALUES (%s,%s,%s,%s,%s)
                   ON CONFLICT (address_normalized) DO NOTHING""",
                (addr, gr.lat, gr.lng, gr.source, gr.accuracy),
            )

    def query_nominatim(self, addr: str) -> GeoResult | None:
        if not GEOCODE_ENABLED:
            return None
        delta = time.time() - self._last_call
        if delta < self._sleep:
            time.sleep(self._sleep - delta)
        self._last_call = time.time()

        url = NOMINATIM_URL.rstrip("/") + "/search"
        try:
            r = httpx.get(
                url,
                params={"q": addr, "format": "json", "limit": 1, "countrycodes": "tw"},
                timeout=10.0,
                headers={"User-Agent": "Have-House/0.1 (legstrong77@gmail.com)"},
            )
            r.raise_for_status()
            data = r.json()
            if not data:
                return None
            first = data[0]
            return GeoResult(
                lat=float(first["lat"]),
                lng=float(first["lon"]),
                accuracy="street",
                source="nominatim",
            )
        except (httpx.HTTPError, KeyError, ValueError) as e:
            logger.warning(f"geocode fail addr={addr} err={e}")
            return None

    def geocode(self, addr: str) -> GeoResult | None:
        cached = self.lookup_cached(addr)
        if cached:
            return cached
        gr = self.query_nominatim(addr)
        if gr:
            self.store(addr, gr)
        return gr

    def batch(self, addrs: Iterable[str]) -> dict[str, GeoResult]:
        out: dict[str, GeoResult] = {}
        for a in addrs:
            r = self.geocode(a)
            if r:
                out[a] = r
        return out
