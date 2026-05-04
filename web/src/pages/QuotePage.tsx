import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import { api } from "../api";
import { Tx, TxDetailPanel } from "../components/TxTable";

const wan = (n: any, d = 1) =>
  n == null ? "—" : (Number(n) / 10000).toLocaleString("zh-TW", { maximumFractionDigits: d });

/**
 * 行情速查 — 給房仲快速估出某區某類別、某坪數區間的「合理出價」
 * 用法：
 *   1. 選縣市 / 區 / 類別
 *   2. (可選) 輸入坪數、屋齡、樓層 → 自動篩近 12 個月相似物件
 *   3. 顯示：合理價格區間、近 60 個月趨勢、底下列出 30 筆最近成交
 */
export default function QuotePage() {
  const { data: counties = [] } = useQuery({ queryKey: ["counties"], queryFn: api.counties });
  const { data: btypes = [] } = useQuery({ queryKey: ["btypes"], queryFn: api.buildingTypes });

  const [county, setCounty] = useState("a");
  const [district, setDistrict] = useState<string | undefined>();
  const [bt, setBt] = useState<string | undefined>();
  const [pingMid, setPingMid] = useState<string>("30");
  const [pingTol, setPingTol] = useState<string>("10");   // ± N 坪
  const [maxAge, setMaxAge] = useState<string>("");
  const [rooms, setRooms] = useState<string>("");
  const [selected, setSelected] = useState<Tx | null>(null);

  const { data: districts = [] } = useQuery({
    queryKey: ["districts-q", county],
    queryFn: () => api.districts(county),
    enabled: !!county,
  });
  useEffect(() => { setDistrict(undefined); }, [county]);

  const minPing = pingMid && pingTol ? Math.max(0, Number(pingMid) - Number(pingTol)) : "";
  const maxPing = pingMid && pingTol ? Number(pingMid) + Number(pingTol) : "";

  // 直方圖
  const { data: dist } = useQuery({
    queryKey: ["q-dist", county, district, bt],
    queryFn: () => api.distribution({ county, district, deal_kind: "sale", months: 12 }),
    enabled: !!county,
  });

  // 60 個月趨勢
  const { data: monthly = [] } = useQuery({
    queryKey: ["q-mon", county, district],
    queryFn: () => api.districtMonthly({ county, district, deal_kind: "sale", months: 60 }),
    enabled: !!county,
  });

  // 條件成交
  const { data: txData } = useQuery({
    queryKey: ["q-tx", county, district, bt, pingMid, pingTol, maxAge, rooms],
    queryFn: () => api.searchTx({
      county, district, deal_kind: "sale",
      building_type: bt,
      min_ping: minPing || undefined,
      max_ping: maxPing || undefined,
      max_age:  maxAge || undefined,
      rooms:    rooms || undefined,
      exclude_special: true, residential_only: true,
      sort: "deal_date", order: "desc", limit: 30,
    }),
  });
  const rows: Tx[] = txData?.results ?? [];

  // 從 txData 裡計算更精準的單價區間
  const samplePrices = rows
    .map(r => (r.unit_price_per_ping ?? 0) / 10000)
    .filter(p => p > 0)
    .sort((a, b) => a - b);
  const sampleStats = (() => {
    const n = samplePrices.length;
    if (n === 0) return null;
    const at = (q: number) => samplePrices[Math.min(n-1, Math.floor(n*q))];
    return {
      n,
      p25:  at(0.25),
      p50:  at(0.50),
      p75:  at(0.75),
      mean: samplePrices.reduce((s,x)=>s+x,0)/n,
      lo:   samplePrices[0],
      hi:   samplePrices[n-1],
    };
  })();

  // 預估該物件總價 = 中位 × 坪數中心
  const expectedTotal = sampleStats && pingMid
    ? sampleStats.p50 * Number(pingMid)
    : null;

  // 直方圖資料整理
  const histo = useMemo(() => {
    if (!dist?.bins) return [];
    return dist.bins.map((b: any) => ({
      label: `${(b.lo/10000).toFixed(0)}~${(b.hi/10000).toFixed(0)}`,
      mid: (b.lo + b.hi) / 2 / 10000,
      n: b.n,
    })).filter((b: any) => b.mid <= 300); // 截掉極端
  }, [dist]);

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <div className="section-head">
          <h2 style={{ margin: 0 }}>📊 行情速查 — 給仲介的快速估價</h2>
          <span style={{ color: "var(--muted)", fontSize: 13 }}>
            選定區段 + 坪數區間，立刻看合理區間
          </span>
        </div>

        <div className="quote-form">
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
            <label>建物型態</label>
            <select value={bt ?? ""} onChange={(e) => setBt(e.target.value || undefined)}>
              <option value="">— 全部 —</option>
              {btypes.map((b: any) => (
                <option key={b.name} value={b.name}>{b.name.replace(/\(.*?\)/g, "")}</option>
              ))}
            </select>
          </div>
          <div>
            <label>坪數 (中心)</label>
            <input type="number" value={pingMid} onChange={(e) => setPingMid(e.target.value)} placeholder="30" />
          </div>
          <div>
            <label>± 坪數</label>
            <input type="number" value={pingTol} onChange={(e) => setPingTol(e.target.value)} placeholder="10" />
          </div>
          <div>
            <label>屋齡 ≤</label>
            <input type="number" value={maxAge} onChange={(e) => setMaxAge(e.target.value)} placeholder="不限" />
          </div>
          <div>
            <label>幾房</label>
            <input type="number" value={rooms} onChange={(e) => setRooms(e.target.value)} placeholder="不限" />
          </div>
        </div>
      </div>

      {/* 估價結果區塊 */}
      <div className="quote-result-grid">
        <div className="card quote-headline">
          <div className="qh-label">合理單價區間 <small>近 12 月 · 篩選後</small></div>
          {sampleStats ? (
            <>
              <div className="qh-range">
                <span>{sampleStats.p25.toFixed(1)}</span>
                <em>~</em>
                <span className="hot">{sampleStats.p75.toFixed(1)}</span>
                <small>萬/坪</small>
              </div>
              <div className="qh-mid">
                中位 <b>{sampleStats.p50.toFixed(1)}</b> · 平均 <b>{sampleStats.mean.toFixed(1)}</b> · 樣本 {sampleStats.n} 筆
              </div>
              {expectedTotal && (
                <div className="qh-total">
                  <small>{pingMid} 坪預估總價</small>
                  <div className="qh-total-num">
                    <b>{(expectedTotal * 0.9).toFixed(0)}</b>~<b>{(expectedTotal * 1.1).toFixed(0)}</b>
                    <small>萬</small>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="empty-hint" style={{ padding: 32 }}>
              <div>篩選條件下無近期成交</div>
              <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>放寬坪數區間或屋齡</div>
            </div>
          )}
        </div>

        <div className="card">
          <h4 style={{ marginTop: 0 }}>價格分布 (近 12 月 · {district ?? "全縣市"})</h4>
          <div style={{ height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={histo}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="mid" stroke="var(--muted)" tick={{ fontSize: 11 }}
                       tickFormatter={(v) => `${v.toFixed(0)}萬`} />
                <YAxis stroke="var(--muted)" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}
                  formatter={(v: any) => [`${v} 筆`, "成交"]}
                  labelFormatter={(v: any) => `${(v ?? 0).toFixed(0)} 萬/坪`}
                />
                {sampleStats && (
                  <ReferenceLine x={sampleStats.p50} stroke="#dc2626" strokeWidth={2}
                                 label={{ value: "中位", fill: "#dc2626", fontSize: 11 }} />
                )}
                <Bar dataKey="n" radius={[4, 4, 0, 0]}>
                  {histo.map((b: any, i: number) => {
                    const inRange = sampleStats && b.mid >= sampleStats.p25 && b.mid <= sampleStats.p75;
                    return <Cell key={i} fill={inRange ? "#4ade80" : "#60a5fa"} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h4 style={{ marginTop: 0 }}>近 60 個月走勢</h4>
          <div style={{ height: 200 }}>
            <ResponsiveContainer>
              <LineChart data={monthly}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="month" stroke="var(--muted)" tick={{ fontSize: 10 }} />
                <YAxis stroke="var(--muted)" tick={{ fontSize: 11 }}
                       tickFormatter={(v) => (v / 10000).toFixed(0) + "萬"} />
                <Tooltip
                  contentStyle={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}
                  formatter={(v: any) => `${wan(v)} 萬/坪`}
                />
                <Line type="monotone" dataKey="median_unit_price_ping"
                      stroke="#4ade80" strokeWidth={2} dot={false} name="中位" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 相似成交清單 */}
      <div className="card" style={{ padding: 0 }}>
        <div className="section-head" style={{ padding: "16px 20px 0" }}>
          <h3 style={{ margin: 0 }}>🏠 篩選後最近 30 筆相似成交</h3>
          <span style={{ color: "var(--muted)", fontSize: 12 }}>點擊任一張卡片可看完整資訊</span>
        </div>
        <div className="listing-grid">
          {rows.map((r) => {
            const ping = r.building_area_sqm ? r.building_area_sqm * 0.3025 : null;
            const wanPing = r.unit_price_per_ping ? r.unit_price_per_ping/10000 : null;
            const total = r.total_price ? r.total_price/10000 : null;
            return (
              <button key={r.id} className="listing-card" onClick={() => setSelected(r)}>
                <div className="lc-head">
                  <span className="lc-tag">{r.district}</span>
                  <span className="lc-date">{r.deal_date}</span>
                </div>
                <div className="lc-addr" title={r.address ?? ""}>{r.address || "(地址未提供)"}</div>
                <div className="lc-stats">
                  <span><b>{r.rooms ?? "—"}</b>房{r.halls ?? 0}廳{r.baths ?? 0}衛</span>
                  <span>{ping?.toFixed(1) ?? "—"} 坪</span>
                  <span>{r.transfer_floor_num ?? "—"}/{r.total_floors ?? "—"} 樓</span>
                  <span>{r.age_years != null ? r.age_years.toFixed(0)+" 年" : "—"}</span>
                </div>
                <div className="lc-price-row">
                  <div className="lc-total"><b>{total?.toFixed(0) ?? "—"}</b><small>萬</small></div>
                  <div className="lc-ping" style={{ color: wanPing ? "#dc2626" : "var(--muted)" }}>
                    <b>{wanPing?.toFixed(1) ?? "—"}</b> 萬/坪
                  </div>
                </div>
              </button>
            );
          })}
          {rows.length === 0 && (
            <div className="empty-hint" style={{ gridColumn: "1/-1" }}>
              <div>篩選條件下沒有相似成交</div>
            </div>
          )}
        </div>
      </div>

      <TxDetailPanel tx={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
