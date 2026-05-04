-- ============================================================
-- 效能用補強索引（複合 / 部分索引）
-- 用 CONCURRENTLY 避免阻擋 ETL 寫入
-- 注意：CONCURRENTLY 不能在 transaction 中執行，要逐句跑
-- ============================================================

-- 主要查詢路徑：縣市 + 鄉鎮 + 類別 + 日期降序
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tx_browse_main
    ON transactions (county_code, deal_kind, district, deal_date DESC, id);

-- 排除特殊交易 + 住宅過濾常見組合（部分索引）
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tx_browse_residential
    ON transactions (county_code, deal_kind, district, deal_date DESC)
    WHERE is_special_deal = FALSE
      AND unit_price_per_ping IS NOT NULL
      AND building_area_sqm >= 20;

-- 排序鍵的輔助索引
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tx_total_price_desc
    ON transactions (county_code, deal_kind, total_price DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tx_unit_price_desc
    ON transactions (county_code, deal_kind, unit_price_per_ping DESC);

-- 同地段查詢輔助：address 前綴搜尋
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tx_addr_prefix
    ON transactions (county_code, district, address text_pattern_ops);
