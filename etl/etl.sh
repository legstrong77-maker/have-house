#!/usr/bin/env bash
# 在 etl / scheduler 容器內使用：
#   ./etl.sh 113S4         # 跑指定一季
#   ./etl.sh latest        # 跑最新一季（自動推算）
#   ./etl.sh backfill      # 全量回填 ROC 110 起
#   ./etl.sh backfill 111  # 從指定 ROC 年回填
#
set -e
cd /app

case "${1:-latest}" in
  latest)
    exec python -m etl.pipeline --mode season --latest
    ;;
  backfill)
    SINCE="${2:-110}"
    exec python -m etl.pipeline --mode backfill --since "$SINCE"
    ;;
  *)
    exec python -m etl.pipeline --mode season --season "$1"
    ;;
esac
