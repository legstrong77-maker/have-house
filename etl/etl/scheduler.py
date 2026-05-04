"""長駐排程：每月 2、12、22 日凌晨 3 點抓最新季資料。"""
from __future__ import annotations

import os
import time
from datetime import datetime

import schedule
from loguru import logger

from .config import SCHEDULE_DAYS, SCHEDULE_HOUR
from .download import latest_season
from .pipeline import run_season


def job() -> None:
    today = datetime.now()
    if today.day not in SCHEDULE_DAYS:
        return
    season = latest_season()
    logger.info(f"[scheduler] day={today.day} hour={today.hour} -> run {season}")
    try:
        run_season(season)
    except Exception:
        logger.exception("scheduled run failed")


def main() -> None:
    schedule.every().day.at(f"{SCHEDULE_HOUR:02d}:00").do(job)
    logger.info(f"scheduler 啟動：每天 {SCHEDULE_HOUR:02d}:00 檢查（實際只在 {SCHEDULE_DAYS} 日執行）")

    if os.environ.get("RUN_ON_START", "false").lower() == "true":
        logger.info("RUN_ON_START=true：先跑一次最新季")
        try:
            run_season(latest_season())
        except Exception:
            logger.exception("startup run failed")

    while True:
        schedule.run_pending()
        time.sleep(60)


if __name__ == "__main__":
    main()
