import { useEffect, useMemo, useRef, useState } from "react";
import Map, { Layer, MapRef, Marker, Popup, Source } from "react-map-gl/maplibre";
import { useQuery } from "@tanstack/react-query";
import "maplibre-gl/dist/maplibre-gl.css";

import { api } from "../api";
import { Tx, TxDetailPanel } from "../components/TxTable";
import { getCentroid } from "../lib/districtCentroids";

const fmtWan = (n: number | null | undefined, d = 1) =>
  n == null ? "—" : (Number(n) / 10000).toLocaleString("zh-TW", { maximumFractionDigits: d });

type Bbox = { minLng: number; minLat: number; maxLng: number; maxLat: number };

const DEAL_TABS: { v: "sale" | "presale" | "rent"; label: string }[] = [
  { v: "sale",    label: "中古買賣" },
  { v: "presale", label: "預售屋" },
  { v: "rent",    label: "租賃" },
];

// 縣市中心 (用於初始定位)
const COUNTY_CENTER: Record<string, { lng: number; lat: number; zoom: number }> = {
  a: { lng: 121.5436, lat: 25.0478, zoom: 12 },   // 台北
  f: { lng: 121.4675, lat: 25.0125, zoom: 11 },   // 新北
  h: { lng: 121.3132, lat: 24.9937, zoom: 12 },   // 桃園
  o: { lng: 120.6836, lat: 24.1369, zoom: 12 },   // 台中
  t: { lng: 121.7714, lat: 25.1276, zoom: 13 },   // 基隆
  i: { lng: 120.9685, lat: 24.8014, zoom: 12 },   // 新竹市
  j: { lng: 121.0177, lat: 24.7036, zoom: 11 },   // 新竹縣
  d: { lng: 120.2025, lat: 22.9908, zoom: 11 },   // 台南
  e: { lng: 120.3015, lat: 22.6273, zoom: 11 },   // 高雄
};

// 顏色階梯（萬/坪）
const colorByPing = (wanPerPing: number) => {
  if (wanPerPing >= 150) return "#7f1d1d";
  if (wanPerPing >= 100) return "#dc2626";
  if (wanPerPing >=  70) return "#f97316";
  if (wanPerPing >=  50) return "#facc15";
  if (wanPerPing >=  30) return "#86efac";
  return "#22d3ee";
};

const tier = (wan: number) => {
  if (wan >= 150) return "頂級";
  if (wan >= 100) return "高價";
  if (wan >=  70) return "中高";
  if (wan >=  50) return "中段";
  if (wan >=  30) return "親民";
  return "低價";
};

export default function MapPage() {
  const mapRef = useRef<MapRef>(null);
  const [bbox, setBbox] = useState<Bbox | null>(null);
  const [zoom, setZoom] = useState(12);
  const [dealKind, setDealKind] = useState<"sale" | "presale" | "rent">("sale");
  const [months, setMonths] = useState(12);
  const [county, setCounty] = useState("a");
  const [district, setDistrict] = useState<string | undefined>();
  const [maxPing, setMaxPing] = useState<string>("");
  const [maxAge, setMaxAge] = useState<string>("");
  const [selectedTx, setSelectedTx] = useState<Tx | null>(null);
  const [hoverPoint, setHoverPoint] = useState<any | null>(null);
  const [pin, setPin] = useState<{ lng: number; lat: number } | null>(null);
  const [radius, setRadius] = useState(500);

  const { data: counties = [] } = useQuery({ queryKey: ["counties"], queryFn: api.counties });
  const { data: districts = [] } = useQuery({
    queryKey: ["districts-map", county],
    queryFn: () => api.districts(county),
    enabled: !!county,
  });

  // 縣市切換時重新定位
  useEffect(() => {
    setDistrict(undefined);
    const c = COUNTY_CENTER[county] ?? COUNTY_CENTER.a;
    mapRef.current?.getMap().flyTo({ center: [c.lng, c.lat], zoom: c.zoom, speed: 1.4 });
  }, [county]);

  // 地圖移動 → 計算 bbox
  const onMoveEnd = () => {
    const m = mapRef.current?.getMap();
    if (!m) return;
    const b = m.getBounds();
    setZoom(m.getZoom());
    setBbox({
      minLng: b.getWest(), minLat: b.getSouth(),
      maxLng: b.getEast(), maxLat: b.getNorth(),
    });
  };

  // 各區彙總 (縮小時當作熱區圓) — 走 heatmap (任何區都有)，座標從硬編 fallback
  const { data: heatRows = [] } = useQuery({
    queryKey: ["heatmap-map", county, dealKind, months],
    queryFn: () => api.heatmap({ county, deal_kind: dealKind, months }),
    enabled: !!county,
  });
  // 把 heatmap 結果跟 centroid 合併；無 centroid 的區先丟掉 (極少數偏鄉)
  const districtAgg = useMemo(() => {
    return heatRows.map((r: any) => {
      const c = getCentroid(county, r.district);
      return c ? {
        district: r.district,
        deals: r.deals,
        median_unit_price_ping: r.median_price_ping,
        lng: c[0],
        lat: c[1],
      } : null;
    }).filter((x: any) => x != null);
  }, [heatRows, county]);

  // 點資料 (放大時用)
  const showPoints = zoom >= 13;
  const { data: pointsData } = useQuery({
    queryKey: ["bbox", bbox, dealKind, months, district, maxPing, maxAge],
    queryFn: () => bbox ? api.bbox({
      ...bbox, deal_kind: dealKind, months, limit: 2000,
    }) : Promise.resolve({ points: [] }),
    enabled: !!bbox && showPoints,
  });
  const allPoints: any[] = pointsData?.points ?? [];
  const points = useMemo(() => {
    return allPoints.filter((p) => {
      if (district && p.district !== district) return false;
      if (maxPing && p.unit_price_per_ping && p.unit_price_per_ping/10000 > Number(maxPing)) return false;
      return true;
    });
  }, [allPoints, district, maxPing]);

  // 周邊 nearby (drop pin 模式)
  const { data: nearby = [] } = useQuery({
    queryKey: ["nearby", pin, radius, dealKind, months],
    queryFn: () => pin ? api.nearby({
      lat: pin.lat, lng: pin.lng, radius_m: radius,
      deal_kind: dealKind, months, limit: 50,
    }) : Promise.resolve([]),
    enabled: !!pin,
  });

  // GeoJSON for cluster source
  const pointsGeojson = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: points.filter(p => p.lat && p.lng).map((p) => ({
      type: "Feature" as const,
      properties: {
        id: p.id,
        ping: (p.unit_price_per_ping ?? 0) / 10000,
        total: (p.total_price ?? 0) / 10000,
        addr: p.address ?? "",
      },
      geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
    })),
  }), [points]);

  // 地圖底圖樣式 — 用 carto positron (淺色) 看資料更清楚
  const style = useMemo(() => ({
    version: 8,
    sources: {
      basemap: {
        type: "raster",
        tiles: [
          "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
          "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
          "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors © CARTO",
      },
    },
    layers: [{ id: "basemap", type: "raster", source: "basemap" }],
  }) as any, []);

  const onMapClick = (e: any) => {
    if (!e.lngLat) return;
    if (e.originalEvent?.shiftKey) {
      setPin({ lng: e.lngLat.lng, lat: e.lngLat.lat });
    }
  };

  const districtBadgeRadius = (deals: number) => {
    // 12 ~ 32 px
    if (deals > 1500) return 32;
    if (deals > 800)  return 28;
    if (deals > 400)  return 24;
    if (deals > 150)  return 20;
    if (deals > 50)   return 16;
    return 14;
  };

  const visibleDistrictAgg = districtAgg.filter((d: any) => d.lng != null && d.lat != null);

  // 排序: 全部 / 撿漏 / 大坪 / 新成屋
  const [pointSort, setPointSort] = useState<"recent" | "cheap" | "exp" | "big">("recent");
  const sortedPoints = useMemo(() => {
    const arr = [...points];
    if (pointSort === "cheap")
      arr.sort((a, b) => (a.unit_price_per_ping ?? 9e9) - (b.unit_price_per_ping ?? 9e9));
    else if (pointSort === "exp")
      arr.sort((a, b) => (b.unit_price_per_ping ?? 0) - (a.unit_price_per_ping ?? 0));
    else if (pointSort === "big")
      arr.sort((a, b) => (b.total_price ?? 0) - (a.total_price ?? 0));
    else
      arr.sort((a, b) => (b.deal_date ?? "").localeCompare(a.deal_date ?? ""));
    return arr;
  }, [points, pointSort]);

  return (
    <div className="map-page">
      {/* 上方控制列 */}
      <div className="card map-controls">
        <div className="map-tabs">
          {DEAL_TABS.map((t) => (
            <button key={t.v}
              className={`tab ${dealKind === t.v ? "active" : ""}`}
              onClick={() => setDealKind(t.v)}>{t.label}</button>
          ))}
        </div>

        <div className="map-filters">
          <div>
            <label>縣市</label>
            <select value={county} onChange={(e) => setCounty(e.target.value)}>
              {counties.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label>鄉鎮市區</label>
            <select value={district ?? ""} onChange={(e) => setDistrict(e.target.value || undefined)}>
              <option value="">— 全縣市 —</option>
              {districts.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label>區間</label>
            <select value={months} onChange={(e) => setMonths(Number(e.target.value))}>
              <option value={6}>近 6 月</option>
              <option value={12}>近 12 月</option>
              <option value={24}>近 24 月</option>
              <option value={36}>近 36 月</option>
            </select>
          </div>
          <div>
            <label>單價上限 (萬/坪)</label>
            <input type="number" placeholder="不限" value={maxPing}
                   onChange={(e) => setMaxPing(e.target.value)} />
          </div>
        </div>

        <div className="legend-bar">
          <span className="legend-title">每坪</span>
          {[
            ["#22d3ee", "≤30"],
            ["#86efac", "30–50"],
            ["#facc15", "50–70"],
            ["#f97316", "70–100"],
            ["#dc2626", "100–150"],
            ["#7f1d1d", ">150"],
          ].map(([c, l]) => (
            <span key={l as string} className="legend-chip">
              <i style={{ background: c as string }} />{l} 萬
            </span>
          ))}
        </div>
      </div>

      {/* 地圖 + 側欄 */}
      <div className="map-grid">
        <div className="card map-shell" style={{ padding: 0 }}>
          <div className="map-hint">
            縮放 zoom &lt; 13 看 <b>各區行情</b>；放大看 <b>個別成交點</b>。
            按住 <kbd>Shift</kbd>+點擊 → 落針查 <b>周邊行情</b>。
          </div>

          <Map
            ref={mapRef}
            initialViewState={{ longitude: 121.5436, latitude: 25.0478, zoom: 12 }}
            mapStyle={style}
            onLoad={onMoveEnd}
            onMoveEnd={onMoveEnd}
            onClick={onMapClick}
            attributionControl
          >
            {/* 縮小時：每區彙總圓 */}
            {!showPoints && visibleDistrictAgg.map((d: any) => {
              const wan = (d.median_unit_price_ping ?? 0) / 10000;
              const c = colorByPing(wan);
              const r = districtBadgeRadius(d.deals);
              return (
                <Marker key={d.district} longitude={d.lng} latitude={d.lat} anchor="center">
                  <button
                    className="dist-bubble"
                    onClick={() => setDistrict(d.district)}
                    style={{
                      background: c,
                      width: r * 2, height: r * 2,
                      boxShadow: `0 0 0 4px ${c}33, 0 4px 14px rgba(0,0,0,.25)`,
                    }}
                    title={`${d.district}　中位 ${wan.toFixed(1)} 萬/坪　${d.deals} 筆`}
                  >
                    <div className="dist-name">{d.district}</div>
                    <div className="dist-price">{wan.toFixed(0)}</div>
                  </button>
                </Marker>
              );
            })}

            {/* 放大時：點 + cluster heatmap */}
            {showPoints && (
              <>
                <Source
                  id="pts"
                  type="geojson"
                  data={pointsGeojson as any}
                  cluster
                  clusterRadius={45}
                  clusterMaxZoom={14}
                >
                  <Layer
                    id="heat"
                    type="heatmap"
                    maxzoom={14}
                    paint={{
                      "heatmap-weight": ["interpolate", ["linear"], ["get", "ping"], 0, 0.1, 250, 1],
                      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 11, 0.6, 15, 1.2],
                      "heatmap-radius":   ["interpolate", ["linear"], ["zoom"], 11, 14, 15, 30],
                      "heatmap-opacity":  ["interpolate", ["linear"], ["zoom"], 12, 0.7, 14, 0.25],
                      "heatmap-color": [
                        "interpolate", ["linear"], ["heatmap-density"],
                        0.0, "rgba(0,0,0,0)",
                        0.2, "#22d3ee",
                        0.4, "#86efac",
                        0.6, "#facc15",
                        0.8, "#f97316",
                        1.0, "#dc2626",
                      ],
                    } as any}
                  />
                  <Layer
                    id="clusters"
                    type="circle"
                    filter={["has", "point_count"]}
                    paint={{
                      "circle-color": [
                        "step", ["get", "point_count"],
                        "#60a5fa", 25, "#3b82f6", 75, "#1d4ed8",
                      ],
                      "circle-radius": [
                        "step", ["get", "point_count"],
                        16, 25, 22, 75, 28,
                      ],
                      "circle-stroke-color": "#fff",
                      "circle-stroke-width": 2,
                    } as any}
                  />
                  <Layer
                    id="cluster-count"
                    type="symbol"
                    filter={["has", "point_count"]}
                    layout={{
                      "text-field": ["get", "point_count_abbreviated"],
                      "text-size": 12,
                    } as any}
                    paint={{ "text-color": "#fff" } as any}
                  />
                </Source>

                {sortedPoints.slice(0, 400).map((p: any) => {
                  const wan = (p.unit_price_per_ping ?? 0) / 10000;
                  const c = colorByPing(wan);
                  return (
                    <Marker
                      key={p.id}
                      longitude={p.lng}
                      latitude={p.lat}
                      anchor="center"
                    >
                      <button
                        onClick={(e) => { e.stopPropagation(); setHoverPoint(p); }}
                        className="map-point"
                        style={{ background: c }}
                        title={`${wan.toFixed(1)} 萬/坪`}
                      />
                    </Marker>
                  );
                })}
              </>
            )}

            {/* 落針 */}
            {pin && (
              <>
                <Marker longitude={pin.lng} latitude={pin.lat} anchor="bottom">
                  <div className="pin-marker" title="點此清除" onClick={() => setPin(null)}>📍</div>
                </Marker>
              </>
            )}

            {hoverPoint && (
              <Popup
                longitude={hoverPoint.lng} latitude={hoverPoint.lat}
                anchor="top" closeOnClick={false}
                onClose={() => setHoverPoint(null)}
              >
                <div className="map-popup-card">
                  <div className="mp-row">
                    <span className="mp-tag" style={{ background: colorByPing((hoverPoint.unit_price_per_ping ?? 0)/10000) }}>
                      {tier((hoverPoint.unit_price_per_ping ?? 0)/10000)}
                    </span>
                    <span className="mp-date">{hoverPoint.deal_date}</span>
                  </div>
                  <div className="mp-addr">{hoverPoint.address || "(未提供地址)"}</div>
                  <div className="mp-price">
                    <b>{fmtWan(hoverPoint.unit_price_per_ping, 1)}</b> 萬/坪
                    <span className="mp-total">總價 {fmtWan(hoverPoint.total_price, 0)} 萬</span>
                  </div>
                  <div className="mp-meta">
                    {hoverPoint.building_type?.replace(/\(.*?\)/g, "") || "—"} · {hoverPoint.district}
                  </div>
                  <button
                    className="btn-link"
                    onClick={() => { setSelectedTx(hoverPoint); setHoverPoint(null); }}
                  >查看完整資訊 →</button>
                </div>
              </Popup>
            )}
          </Map>
        </div>

        {/* 側欄 */}
        <aside className="map-side card">
          {pin ? (
            <NearbyPanel
              pin={pin} radius={radius} setRadius={setRadius}
              rows={nearby} onClose={() => setPin(null)}
              onSelect={setSelectedTx}
            />
          ) : showPoints ? (
            <PointsPanel
              points={sortedPoints} sort={pointSort} setSort={setPointSort}
              onSelect={setSelectedTx}
            />
          ) : (
            <DistrictPanel
              county={counties.find(c => c.code === county)?.name ?? ""}
              districts={districtAgg}
              onPickDistrict={(d) => {
                setDistrict(d.district);
                if (d.lng && d.lat) {
                  mapRef.current?.getMap().flyTo({ center: [d.lng, d.lat], zoom: 14, speed: 1.5 });
                }
              }}
            />
          )}
        </aside>
      </div>

      <TxDetailPanel tx={selectedTx} onClose={() => setSelectedTx(null)} />
    </div>
  );
}

/* ============== 側欄: 縮小時看的「縣市排行」 ============== */
function DistrictPanel({
  county, districts, onPickDistrict,
}: {
  county: string;
  districts: any[];
  onPickDistrict: (d: any) => void;
}) {
  const sorted = [...districts].sort(
    (a, b) => (b.median_unit_price_ping ?? 0) - (a.median_unit_price_ping ?? 0),
  );
  return (
    <>
      <div className="side-head">
        <div className="side-title">{county} · 各區行情</div>
        <div className="side-sub">中位 (萬/坪) · 點擊跳到該區</div>
      </div>
      <div className="dist-list">
        {sorted.map((d: any, i: number) => {
          const wan = (d.median_unit_price_ping ?? 0) / 10000;
          return (
            <button key={d.district} className="dist-row" onClick={() => onPickDistrict(d)}>
              <div className="dist-rank">#{i + 1}</div>
              <div className="dist-info">
                <div className="dist-row-name">{d.district}</div>
                <div className="dist-row-meta">{(d.deals ?? 0).toLocaleString()} 筆成交</div>
              </div>
              <div className="dist-row-price">
                <b style={{ color: colorByPing(wan) }}>{wan.toFixed(1)}</b>
                <small>萬/坪</small>
              </div>
            </button>
          );
        })}
        {sorted.length === 0 && (
          <div className="empty-hint" style={{ padding: 24 }}>
            <div>該縣市近期無資料</div>
          </div>
        )}
      </div>
    </>
  );
}

/* ============== 側欄: 放大時看到的「成交清單」 ============== */
function PointsPanel({
  points, sort, setSort, onSelect,
}: {
  points: any[];
  sort: string;
  setSort: (s: any) => void;
  onSelect: (p: any) => void;
}) {
  return (
    <>
      <div className="side-head">
        <div className="side-title">畫面內成交 · {points.length.toLocaleString()} 筆</div>
        <div className="sort-tabs">
          {[
            ["recent", "最新"],
            ["cheap",  "最低"],
            ["exp",    "最高"],
            ["big",    "總價↑"],
          ].map(([v, l]) => (
            <button key={v} className={`pill ${sort===v?"active":""}`} onClick={() => setSort(v)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="dist-list">
        {points.slice(0, 80).map((p: any) => {
          const wan = (p.unit_price_per_ping ?? 0) / 10000;
          return (
            <button key={p.id} className="dist-row pt-row" onClick={() => onSelect(p)}>
              <div className="pt-color" style={{ background: colorByPing(wan) }} />
              <div className="dist-info">
                <div className="dist-row-name">{p.address || p.district}</div>
                <div className="dist-row-meta">
                  {(p.building_type ?? "").replace(/\(.*?\)/g, "")}
                  {p.deal_date ? " · " + p.deal_date : ""}
                </div>
              </div>
              <div className="dist-row-price">
                <b>{wan.toFixed(1)}</b>
                <small>{((p.total_price ?? 0)/10000).toFixed(0)} 萬</small>
              </div>
            </button>
          );
        })}
        {points.length === 0 && (
          <div className="empty-hint" style={{ padding: 24 }}>
            <div>畫面內無成交點</div>
            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>
              拖曳或縮放地圖
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/* ============== 側欄: 落針後的「周邊行情」 ============== */
function NearbyPanel({
  pin, radius, setRadius, rows, onClose, onSelect,
}: {
  pin: { lng: number; lat: number };
  radius: number;
  setRadius: (n: number) => void;
  rows: any[];
  onClose: () => void;
  onSelect: (p: any) => void;
}) {
  const prices = rows.map(r => (r.unit_price_per_ping ?? 0)/10000).filter(n => n > 0).sort((a,b)=>a-b);
  const median = prices.length ? prices[Math.floor(prices.length/2)] : 0;
  const p25 = prices.length ? prices[Math.floor(prices.length*0.25)] : 0;
  const p75 = prices.length ? prices[Math.floor(prices.length*0.75)] : 0;
  return (
    <>
      <div className="side-head">
        <div className="side-title">📍 落針周邊行情</div>
        <div className="side-sub">
          {pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}
          <button className="ghost" style={{ width: "auto", padding: "2px 8px", marginLeft: 8 }} onClick={onClose}>✕</button>
        </div>
        <div className="row" style={{ gap: 6, marginTop: 6 }}>
          {[300, 500, 800, 1500].map(r => (
            <button key={r}
              className={`pill ${radius===r?"active":""}`}
              onClick={() => setRadius(r)}>{r}m</button>
          ))}
        </div>
      </div>

      {prices.length > 0 && (
        <div className="kpi-row" style={{ marginTop: 12 }}>
          <div className="kpi-tile accent">
            <div className="label">中位</div>
            <div className="value">{median.toFixed(1)}</div>
          </div>
          <div className="kpi-tile">
            <div className="label">P25–P75</div>
            <div className="value" style={{ fontSize: 14 }}>{p25.toFixed(1)}~{p75.toFixed(1)}</div>
          </div>
        </div>
      )}

      <div className="dist-list">
        {rows.map((r: any) => {
          const wan = (r.unit_price_per_ping ?? 0) / 10000;
          return (
            <button key={r.id} className="dist-row pt-row" onClick={() => onSelect(r)}>
              <div className="pt-color" style={{ background: colorByPing(wan) }} />
              <div className="dist-info">
                <div className="dist-row-name">{r.address}</div>
                <div className="dist-row-meta">
                  {Math.round(r.dist_m)}m · {r.deal_date}
                </div>
              </div>
              <div className="dist-row-price">
                <b>{wan.toFixed(1)}</b>
                <small>{((r.total_price ?? 0)/10000).toFixed(0)} 萬</small>
              </div>
            </button>
          );
        })}
        {rows.length === 0 && (
          <div className="empty-hint" style={{ padding: 24 }}>
            <div>{radius}m 內無近期成交</div>
            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>
              試試放大半徑
            </div>
          </div>
        )}
      </div>
    </>
  );
}
