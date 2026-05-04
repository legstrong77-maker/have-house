"""ETL 主流程入口。

用法：
    python -m etl.pipeline --mode season --season 113S4
    python -m etl.pipeline --mode season --latest
    python -m etl.pipeline --mode backfill --since 110     # 從 ROC 110 補到最新
"""
from __future__ import annotations

import argparse
import sys
import time

import psycopg
from loguru import logger

from .config import DATABASE_URL
from .download import all_seasons_since, download_season, extract, latest_season
from .load import attach_geocoded_points, load_records, refresh_views
from .parse import discover_files, parse_csv


# DB 啟動時可能還在 recovery / starting up，這些訊息代表「等一下會好」
_RETRYABLE_HINTS = (
    "the database system is starting up",
    "the database system is not yet accepting connections",
    "consistent recovery state has not been yet reached",
    "the database system is shutting down",
)


def connect_db(max_attempts: int = 12, sleep_s: float = 5.0) -> psycopg.Connection:
    """psycopg.connect 包一層 retry — 容器一起啟動時 DB 還在 recovery 是常態。"""
    for attempt in range(1, max_attempts + 1):
        try:
            return psycopg.connect(DATABASE_URL)
        except psycopg.OperationalError as e:
            msg = str(e).lower()
            if attempt < max_attempts and any(h in msg for h in _RETRYABLE_HINTS):
                logger.warning(
                    f"DB 尚未就緒（{attempt}/{max_attempts}），{sleep_s:.0f}s 後重試："
                    f"{type(e).__name__}: {e.__class__.__qualname__}"
                )
                time.sleep(sleep_s)
                continue
            raise
    raise RuntimeError("connect_db: 重試上限")


def _open_run(conn: psycopg.Connection, season: str) -> int:
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO etl_runs (season, period_kind, status) VALUES (%s,%s,%s) RETURNING id",
            (season, "season", "running"),
        )
        run_id = cur.fetchone()[0]
    conn.commit()
    return run_id


def _close_run(conn: psycopg.Connection, run_id: int, ok: bool, rows: int, err: str = "") -> None:
    with conn.cursor() as cur:
        cur.execute(
            """UPDATE etl_runs
                  SET finished_at=now(), rows_loaded=%s, status=%s, error_text=%s
                WHERE id=%s""",
            (rows, "success" if ok else "failed", err, run_id),
        )
    conn.commit()


def _already_success(conn: psycopg.Connection) -> set[str]:
    with conn.cursor() as cur:
        cur.execute("SELECT DISTINCT season FROM etl_runs WHERE status='success'")
        return {r[0] for r in cur.fetchall()}


def run_season(season: str, finalize: bool = True) -> int:
    logger.info(f"=== ETL season={season} start ===")
    zip_path = download_season(season)
    extract_dir = extract(zip_path)
    csv_files = discover_files(extract_dir)
    logger.info(f"找到 {len(csv_files)} 個 CSV")

    total = 0
    bad_csvs: list[str] = []
    with connect_db() as conn:
        run_id = _open_run(conn, season)
        try:
            for csv in csv_files:
                logger.info(f"-> {csv.name}")
                # 單一 CSV 失敗（解析錯、爛資料、編碼壞掉等）不該拖累整季：
                # log 警告、rollback 把連線拉回 idle、繼續下一個 CSV
                try:
                    rec_iter = parse_csv(csv)
                    inserted = load_records(conn, rec_iter, source_file=csv.name, season=season)
                    total += inserted
                    logger.info(f"   {csv.name}: {inserted:,} rows")
                except Exception as csv_err:
                    logger.warning(
                        f"   ⚠ {csv.name} 失敗（{type(csv_err).__name__}）：{csv_err}；略過此 CSV"
                    )
                    bad_csvs.append(csv.name)
                    try:
                        conn.rollback()
                    except Exception:
                        pass
            if bad_csvs:
                logger.warning(f"本季略過 {len(bad_csvs)} 個壞 CSV：{bad_csvs}")
            if finalize:
                attached = attach_geocoded_points(conn)
                logger.info(f"附加經緯度：{attached:,} 列（從 cache）")
                refresh_views(conn)
                logger.info("MV 已 refresh")
            # 即使有壞 CSV 仍標 success（部分資料總比整季 fail 好）；
            # error_text 記錄哪些 CSV 沒進去，便於日後審計
            err_text = ("partial: skipped " + ", ".join(bad_csvs)) if bad_csvs else ""
            _close_run(conn, run_id, ok=True, rows=total, err=err_text)
        except Exception as e:
            logger.exception("ETL failed")
            _close_run(conn, run_id, ok=False, rows=total, err=str(e))
            raise
    logger.info(f"=== ETL season={season} done, total={total:,} ===")
    return total


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["season", "backfill"], default="season")
    ap.add_argument("--season", help="例 113S4")
    ap.add_argument("--latest", action="store_true")
    ap.add_argument("--since", type=int, default=110, help="backfill 從哪個 ROC 年起")
    ap.add_argument("--force", action="store_true", help="backfill 時不略過已成功的季")
    args = ap.parse_args()

    if args.mode == "season":
        season = args.season or (latest_season() if args.latest else None)
        if not season:
            logger.error("請指定 --season YYYS 或 --latest")
            return 2
        run_season(season)
        return 0

    if args.mode == "backfill":
        seasons = all_seasons_since(args.since)
        logger.info(f"backfill {len(seasons)} 季：{seasons[0]} → {seasons[-1]}")

        with connect_db() as conn:
            done = set() if args.force else _already_success(conn)
        if done:
            logger.info(f"已成功 {len(done)} 季，將略過：{sorted(done)}")

        ran_any = False
        for s in seasons:
            if s in done:
                logger.info(f"[skip] {s} 已成功 → 不重跑")
                continue
            try:
                run_season(s, finalize=False)
                ran_any = True
            except Exception:
                logger.warning(f"{s} 失敗，繼續下一季")
                continue

        if ran_any:
            logger.info("=== backfill 完成，執行一次性 finalize（geocode attach + MV refresh）===")
            with connect_db() as conn:
                attached = attach_geocoded_points(conn)
                logger.info(f"附加經緯度：{attached:,} 列（從 cache）")
                refresh_views(conn)
                logger.info("MV 已 refresh")
        else:
            logger.info("沒有新的季要跑，略過 finalize")
        return 0

    return 0


if __name__ == "__main__":
    sys.exit(main())
