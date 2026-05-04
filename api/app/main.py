from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import calc, compare, geo, meta, stats, transactions
from .settings import settings

app = FastAPI(
    title="Have-House API",
    description="台灣不動產實價登錄 — 統計、地圖、購屋試算 API",
    version="0.1.0",
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
