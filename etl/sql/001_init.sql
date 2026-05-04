-- ============================================================
-- Have-House schema
-- 資料來源：內政部不動產交易實價查詢服務網 Open Data
-- ============================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 縣市對照
CREATE TABLE IF NOT EXISTS county (
    code   CHAR(1) PRIMARY KEY,         -- a, b, c ...
    name   TEXT NOT NULL UNIQUE         -- 臺北市, 臺中市, ...
);

-- 主交易表（買賣 / 預售 / 租賃 共用）
CREATE TABLE IF NOT EXISTS transactions (
    id                 BIGSERIAL PRIMARY KEY,
    serial_no          TEXT NOT NULL,                  -- 編號
    deal_kind          TEXT NOT NULL,                  -- 'sale' | 'presale' | 'rent'
    county_code        CHAR(1) NOT NULL REFERENCES county(code),
    district           TEXT NOT NULL,                  -- 鄉鎮市區
    address            TEXT,                           -- 土地位置建物門牌
    address_normalized TEXT,                           -- 標準化地址（去區間、補零）
    land_area_sqm      NUMERIC(14,2),                  -- 土地移轉總面積
    building_area_sqm  NUMERIC(14,2),                  -- 建物移轉總面積
    parking_area_sqm   NUMERIC(14,2),                  -- 車位移轉總面積
    transfer_floor     TEXT,                           -- 移轉層次（中文：地下二層,一層,...）
    transfer_floor_num INTEGER,                        -- 解析過的樓層數
    total_floors       INTEGER,                        -- 總樓層數
    building_type      TEXT,                           -- 建物型態（公寓/華廈/住宅大樓/透天厝...）
    main_use           TEXT,                           -- 主要用途
    main_material      TEXT,                           -- 主要建材
    build_completion   DATE,                           -- 建築完成年月
    age_years          NUMERIC(5,1),                   -- 屋齡（成交年 - 完工年）
    rooms              SMALLINT,                       -- 房
    halls              SMALLINT,                       -- 廳
    baths              SMALLINT,                       -- 衛
    has_partition      BOOLEAN,                        -- 隔間
    has_management     BOOLEAN,                        -- 有無管理組織
    deal_date          DATE NOT NULL,                  -- 交易年月日
    total_price         BIGINT,                        -- 總價元
    unit_price_per_sqm  NUMERIC(14,2),                 -- 單價元/平方公尺
    unit_price_per_ping NUMERIC(14,2),                 -- 單價元/坪 (= unit_price_per_sqm * 3.305785)
    parking_kind        TEXT,                          -- 車位類別
    parking_price       BIGINT,                        -- 車位總價元
    note                TEXT,                          -- 備註（含特殊交易說明）
    is_special_deal     BOOLEAN DEFAULT FALSE,         -- 是否親友、債務等特殊關係
    geom                geometry(Point, 4326),         -- WGS84 經緯度
    geocode_source      TEXT,                          -- 'official' | 'nominatim' | 'cached' | NULL
    raw_row             JSONB,                         -- 原始 CSV 一列（保留 audit）
    source_file         TEXT,                          -- 來源 ZIP 檔
    source_season       TEXT,                          -- 例：113S4
    inserted_at         TIMESTAMPTZ DEFAULT now(),
    UNIQUE (serial_no, deal_kind)
);

-- 地理快取（地址 → 經緯度）
CREATE TABLE IF NOT EXISTS geocode_cache (
    address_normalized TEXT PRIMARY KEY,
    lat                DOUBLE PRECISION NOT NULL,
    lng                DOUBLE PRECISION NOT NULL,
    source             TEXT NOT NULL,                  -- 'nominatim' | 'manual' | ...
    accuracy           TEXT,                           -- 'rooftop' | 'street' | 'district'
    cached_at          TIMESTAMPTZ DEFAULT now()
);

-- ETL 執行紀錄（用來判斷哪一旬的資料已抓過）
CREATE TABLE IF NOT EXISTS etl_runs (
    id           BIGSERIAL PRIMARY KEY,
    season       TEXT NOT NULL,            -- 113S4
    period_kind  TEXT NOT NULL,            -- 'season' | '10day'
    period_id    TEXT,                     -- 旬報用：YYYY-MM-{1,2,3}
    started_at   TIMESTAMPTZ DEFAULT now(),
    finished_at  TIMESTAMPTZ,
    rows_loaded  INTEGER,
    status       TEXT NOT NULL,            -- 'running' | 'success' | 'failed'
    error_text   TEXT
);
