-- 查詢用索引
CREATE INDEX IF NOT EXISTS idx_tx_county_district  ON transactions (county_code, district);
CREATE INDEX IF NOT EXISTS idx_tx_deal_date        ON transactions (deal_date);
CREATE INDEX IF NOT EXISTS idx_tx_kind_date        ON transactions (deal_kind, deal_date);
CREATE INDEX IF NOT EXISTS idx_tx_unit_price       ON transactions (unit_price_per_ping);
CREATE INDEX IF NOT EXISTS idx_tx_building_type    ON transactions (building_type);
CREATE INDEX IF NOT EXISTS idx_tx_geom             ON transactions USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_tx_addr_trgm        ON transactions USING GIN (address_normalized gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_tx_special          ON transactions (is_special_deal);
