-- ============================================================
-- 統計用 Materialized View
-- 每次 ETL 完成時 REFRESH
-- ============================================================

-- 各鄉鎮市區 / 月份 / 建物型態 的成交統計
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_district_monthly AS
SELECT
    county_code,
    district,
    building_type,
    deal_kind,
    date_trunc('month', deal_date)::date    AS month,
    COUNT(*)                                AS deals,
    AVG(unit_price_per_ping)                AS avg_unit_price_ping,
    percentile_cont(0.25) WITHIN GROUP (ORDER BY unit_price_per_ping) AS p25_unit_price_ping,
    percentile_cont(0.50) WITHIN GROUP (ORDER BY unit_price_per_ping) AS median_unit_price_ping,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY unit_price_per_ping) AS p75_unit_price_ping,
    AVG(total_price)                        AS avg_total_price,
    AVG(building_area_sqm)                  AS avg_building_area_sqm,
    AVG(age_years)                          AS avg_age_years
FROM transactions
WHERE is_special_deal = FALSE
  AND unit_price_per_ping IS NOT NULL
  AND unit_price_per_ping BETWEEN 1000 AND 5000000   -- 排除明顯異常
GROUP BY county_code, district, building_type, deal_kind, month;

CREATE INDEX IF NOT EXISTS idx_mv_dm_lookup
    ON mv_district_monthly (county_code, district, deal_kind, month);

-- 各縣市總覽
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_county_summary AS
SELECT
    county_code,
    deal_kind,
    COUNT(*) AS total_deals,
    MAX(deal_date) AS last_deal_date,
    AVG(unit_price_per_ping) AS avg_unit_price_ping,
    percentile_cont(0.50) WITHIN GROUP (ORDER BY unit_price_per_ping) AS median_unit_price_ping
FROM transactions
WHERE is_special_deal = FALSE
  AND unit_price_per_ping IS NOT NULL
  AND unit_price_per_ping BETWEEN 1000 AND 5000000
GROUP BY county_code, deal_kind;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_cs_pk
    ON mv_county_summary (county_code, deal_kind);
