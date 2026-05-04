import asyncio
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
from sqlalchemy import text

from .db import SessionLocal
from .routers import calc, compare, geo, meta, stats, transactions
from .settings import settings


def _warmup_sync():
    """容器啟動後預先把昂貴查詢跑一次填 cache，避免第一個使用者卡 25s+。"""
    # 等 DB 完成 recovery
    for attempt in range(12):
        try:
            with SessionLocal() as db:
                db.execute(text("SELECT 1")).scalar()
            break
        except Exception as e:
            logger.warning(f"warmup: DB 還沒就緒 ({attempt+1}/12) — {e}")
            time.sleep(5)
    else:
        logger.error("warmup: DB 連不上，放棄熱機")
        return

    db = SessionLocal()
    try:
        # 直接呼叫 router 內的查詢函式（透過內部 helper），會自動填 _ttl_get cache
        from .routers.meta import list_counties, list_building_types, list_districts
        from .routers.stats import county_summary, _heatmap_impl, _momentum_impl, _underpriced_impl
        from fastapi import Response

        r = Response()
        t0 = time.monotonic()
        list_counties(r, db)
        list_building_types(r, db)
        county_summary(r, db, deal_kind="sale")

        # 各縣市 districts + 動能熱機
        for cc in ["a", "f", "h", "b", "d", "e"]:
            try:
                list_districts(cc, r, db)
                _momentum_impl(cc, "sale", db)
            except Exception as e:
                logger.warning(f"warmup district/momentum {cc}: {e}")

        # 撿漏雷達 (最慢的一支)
        try:
            _underpriced_impl(None, None, 0.85, 6, 6, db)
        except Exception as e:
            logger.warning(f"warmup underpriced: {e}")

        logger.info(f"warmup 完成，耗時 {time.monotonic() - t0:.1f}s")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 背景跑，不擋啟動
    asyncio.create_task(asyncio.to_thread(_warmup_sync))
    yield


app = FastAPI(
    title="Have-House API",
    description="台灣不動產實價登錄 — 統計、地圖、購屋試算 API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_origin_regex=settings.CORS_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(meta.router,         prefix="/api/meta",         tags=["meta"])
app.include_router(transactions.router, prefix="/api/transactions", tags=["transactions"])
app.include_router(stats.router,        prefix="/api/stats",        tags=["stats"])
app.include_router(geo.router,          prefix="/api/geo",          tags=["geo"])
app.include_router(compare.router,      prefix="/api/compare",      tags=["compare"])
app.include_router(calc.router,         prefix="/api/calc",         tags=["calculators"])


@app.get("/api/health")
def health():
    return {"ok": True}
