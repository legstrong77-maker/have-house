import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

const fmtWan  = (n: any, d = 0) => n == null ? "—" : (Number(n) / 10000).toLocaleString("zh-TW", { maximumFractionDigits: d });
const fmtPing = (sqm: any) => sqm == null ? "—" : (Number(sqm) * 0.3025).toLocaleString("zh-TW", { maximumFractionDigits: 1 });

const buildingShort = (s?: string | null) => {
  if (!s) return "—";
  return s.replace(/\(.*?\)/g, "").trim();
};

const dealKindLabel = (k: string) =>
  ({ sale: "買賣", presale: "預售", rent: "租賃" }[k] ?? k);

export type Tx = {
  id: number;
  county_code: string;
  district: string;
  address?: string | null;
  building_type?: string | null;
  total_floors?: number | null;
  transfer_floor_num?: number | null;
  age_years?: number | null;
  rooms?: number | null;
  halls?: number | null;
  baths?: number | null;
  building_area_sqm?: number | null;
  total_price?: number | null;
  unit_price_per_ping?: number | null;
  deal_date: string;
  deal_kind: string;
  is_special_deal?: boolean;
  region_p25_ping?: number | null;
  price_ratio?: number | null;
};

export function TxTable({
  rows, sort, order, onSort, onRowClick, dense = false,
}: {
  rows: Tx[];
  sort?: string;
  order?: "asc" | "desc";
  onSort?: (col: string) => void;
  onRowClick?: (tx: Tx) => void;
  dense?: boolean;
}) {
  const sortHeader = (col: string, label: string, align: "left" | "right" = "left") => {
    const active = sort === col;
    const arrow = active ? (order === "asc" ? " ▲" : " ▼") : "";
    return (
      <th
        style={{
          textAlign: align,
          cursor: onSort ? "pointer" : "default",
          color: active ? "var(--accent)" : "var(--muted)",
          userSelect: "none",
        }}
        onClick={() => onSort?.(col)}
      >
        {label}{arrow}
      </th>
    );
  };

  if (rows.length === 0) {
    return (
      <div className="empty-hint">
        <div style={{ fontSize: 32, opacity: 0.5 }}>∅</div>
        <div>沒有符合條件的成交紀錄</div>
        <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
          試試放寬日期區間、移除部分篩選條件
        </div>
      </div>
    );
  }

  return (
    <div className="tx-table-wrap">
      <table className={`tx-table ${dense ? "dense" : ""}`}>
        <thead>
          <tr>
            <th>區</th>
            <th style={{ minWidth: 220 }}>地址</th>
            <th>類別</th>
            {sortHeader("total_price", "總價", "right")}
            {sortHeader("unit_price_per_ping", "每坪", "right")}
            <th style={{ textAlign: "right" }}>坪數</th>
            <th style={{ textAlign: "center" }}>格局</th>
            <th style={{ textAlign: "right" }}>樓層</th>
            <th style={{ textAlign: "right" }}>屋齡</th>
            {sortHeader("deal_date", "成交日", "right")}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const cheap = r.price_ratio != null && r.price_ratio < 0.85;
            return (
              <tr
                key={r.id}
                className={r.is_special_deal ? "special" : ""}
                onClick={() => onRowClick?.(r)}
                style={{ cursor: onRowClick ? "pointer" : "default" }}
              >
                <td><span className="badge">{r.district}</span></td>
                <td className="addr">
                  {r.address || <span style={{ color: "var(--muted)" }}>—</span>}
                  {cheap && <span className="tag good" title="低於同區同類別 P25">撿漏</span>}
                  {r.is_special_deal && <span className="tag warn" title="官方註記特殊交易">特</span>}
                </td>
                <td>{buildingShort(r.building_type)}</td>
                <td className="num">{fmtWan(r.total_price)} <span className="unit">萬</span></td>
                <td className={`num ${cheap ? "good" : "accent"}`}>
                  {fmtWan(r.unit_price_per_ping, 1)} <span className="unit">萬/坪</span>
                </td>
                <td className="num">{fmtPing(r.building_area_sqm)}</td>
                <td className="num small">
                  {r.rooms != null ? `${r.rooms}房${r.halls ?? 0}廳${r.baths ?? 0}衛` : "—"}
                </td>
                <td className="num small">
                  {r.transfer_floor_num != null && r.total_floors
                    ? `${r.transfer_floor_num}/${r.total_floors}F`
                    : (r.total_floors ? `—/${r.total_floors}F` : "—")}
                </td>
                <td className="num small">{r.age_years != null ? `${r.age_years.toFixed(1)} 年` : "—"}</td>
                <td className="num small">{r.deal_date}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ============================================================
   Listing card grid (591 風格)
   ============================================================ */
const tier = (wan: number) => {
  if (wan >= 150) return { c: "#7f1d1d", t: "頂級" };
  if (wan >= 100) return { c: "#dc2626", t: "高價" };
  if (wan >=  70) return { c: "#f97316", t: "中高" };
  if (wan >=  50) return { c: "#facc15", t: "中段" };
  if (wan >=  30) return { c: "#22c55e", t: "親民" };
  return                  { c: "#22d3ee", t: "低價" };
};

export function TxCardGrid({
  rows, onSelect, dense = false,
}: { rows: Tx[]; onSelect?: (t: Tx) => void; dense?: boolean }) {
  if (rows.length === 0) {
    return (
      <div className="empty-hint">
        <div style={{ fontSize: 32, opacity: 0.5 }}>∅</div>
        <div>沒有符合條件的成交紀錄</div>
      </div>
    );
  }
  return (
    <div className={`listing-grid ${dense ? "dense" : ""}`}>
      {rows.map((r) => {
        const ping = r.building_area_sqm ? r.building_area_sqm * 0.3025 : null;
        const wanPing = r.unit_price_per_ping ? r.unit_price_per_ping / 10000 : null;
        const total = r.total_price ? r.total_price / 10000 : null;
        const cheap = r.price_ratio != null && r.price_ratio < 0.85;
        const t = tier(wanPing ?? 0);
        return (
          <button key={r.id} className="listing-card" onClick={() => onSelect?.(r)}>
            <div className="lc-head">
              <span className="lc-tag" style={{ background: t.c, color: "#fff" }}>{t.t}</span>
              <span className="lc-tag" style={{ background: "var(--panel-3)" }}>{r.district}</span>
              {cheap && <span className="lc-tag" style={{ background: "#22c55e", color: "#fff" }}>撿漏</span>}
              {r.is_special_deal && <span className="lc-tag" style={{ background: "var(--warn)", color: "#fff" }}>特</span>}
              <span className="lc-date" style={{ marginLeft: "auto" }}>{r.deal_date}</span>
            </div>
            <div className="lc-addr" title={r.address ?? ""}>
              {r.address || "(地址未提供)"}
            </div>
            <div className="lc-stats">
              <span>{buildingShort(r.building_type)}</span>
              <span>{ping?.toFixed(1) ?? "—"} 坪</span>
              <span>{r.rooms != null ? `${r.rooms}房${r.halls ?? 0}廳${r.baths ?? 0}衛` : "—"}</span>
              <span>{r.transfer_floor_num ?? "—"}/{r.total_floors ?? "—"} 樓</span>
              <span>{r.age_years != null ? `${r.age_years.toFixed(0)} 年` : "—"}</span>
            </div>
            <div className="lc-price-row">
              <div className="lc-total"><b>{total?.toFixed(0) ?? "—"}</b><small>萬</small></div>
              <div className="lc-ping" style={{ color: t.c }}>
                <b>{wanPing?.toFixed(1) ?? "—"}</b> 萬/坪
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ============================================================
   Detail panel
   ============================================================ */
export function TxDetailPanel({
  tx, onClose,
}: { tx: Tx | null; onClose: () => void }) {
  const [tab, setTab] = useState<"info" | "neighbors" | "calc">("info");
  useEffect(() => { setTab("info"); }, [tx?.id]);

  if (!tx) return null;
  const totalWan  = tx.total_price ? (tx.total_price / 10000).toFixed(0) : "—";
  const ppingWan  = tx.unit_price_per_ping ? (tx.unit_price_per_ping / 10000).toFixed(2) : "—";
  const ping      = tx.building_area_sqm ? (tx.building_area_sqm * 0.3025).toFixed(1) : "—";

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "var(--muted)", fontSize: 12 }}>
              {dealKindLabel(tx.deal_kind)} · {tx.deal_date}
            </div>
            <h2 style={{ margin: "4px 0 0" }}>{tx.address || "(地址未提供)"}</h2>
            <div className="badge" style={{ marginTop: 8 }}>{tx.district}</div>
          </div>
          <button className="ghost" onClick={onClose}>✕</button>
        </div>

        <div className="drawer-tabs">
          <button className={`tab ${tab==="info" ? "active":""}`}      onClick={() => setTab("info")}>基本資料</button>
          <button className={`tab ${tab==="neighbors" ? "active":""}`} onClick={() => setTab("neighbors")}>同地段歷史</button>
          <button className={`tab ${tab==="calc" ? "active":""}`}      onClick={() => setTab("calc")}>試算</button>
        </div>

        <div className="drawer-body">
          {tab === "info" && (
            <>
              <div className="kpi-row">
                <KPI label="總價"     value={`${totalWan} 萬`}     accent />
                <KPI label="每坪單價" value={`${ppingWan} 萬`}    accent />
                <KPI label="坪數"     value={`${ping} 坪`} />
                <KPI label="屋齡"     value={tx.age_years != null ? `${tx.age_years.toFixed(1)} 年` : "—"} />
              </div>
              <dl className="defs">
                <Row k="建物型態" v={tx.building_type} />
                <Row k="樓層 / 總樓" v={
                  tx.transfer_floor_num != null && tx.total_floors
                    ? `${tx.transfer_floor_num} / ${tx.total_floors}`
                    : (tx.total_floors ? `— / ${tx.total_floors}` : "—")
                } />
                <Row k="格局" v={tx.rooms != null ? `${tx.rooms} 房 / ${tx.halls ?? 0} 廳 / ${tx.baths ?? 0} 衛` : "—"} />
                <Row k="特殊交易" v={tx.is_special_deal ? "是（已從統計排除）" : "否"} />
              </dl>
              <p className="disclaimer">
                資料來源：內政部不動產交易實價登錄。地址為原始揭露之區段化門牌；本站不提供任何形式之購屋建議。
              </p>
            </>
          )}

          {tab === "neighbors" && <NeighborsTab id={tx.id} />}

          {tab === "calc" && <CalcTab tx={tx} />}
        </div>
      </aside>
    </div>
  );
}

function NeighborsTab({ id }: { id: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["neighbors", id],
    queryFn: () => api.txNeighbors(id, 36),
  });

  if (isLoading) return <div className="loading">載入同地段資料中…</div>;
  const rows = data?.results ?? [];
  if (!data?.road_seg) return <div className="empty-hint"><div>無法解析地址路段</div></div>;
  if (rows.length === 0) return (
    <div className="empty-hint">
      <div>同地段（{data.road_seg}）近 3 年無其他成交</div>
    </div>
  );

  return (
    <div>
      <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 10 }}>
        同地段：<b style={{ color: "var(--text)" }}>{data.road_seg}</b> · 近 3 年共 {rows.length} 筆
      </div>
      <table className="tx-table dense">
        <thead>
          <tr><th>地址</th><th style={{textAlign:"right"}}>總價</th><th style={{textAlign:"right"}}>每坪</th><th style={{textAlign:"right"}}>坪數</th><th style={{textAlign:"right"}}>成交日</th></tr>
        </thead>
        <tbody>
          {rows.map((r: any) => (
            <tr key={r.id}>
              <td className="addr">{r.address}</td>
              <td className="num">{(r.total_price/10000).toFixed(0)} 萬</td>
              <td className="num accent">{(r.unit_price_per_ping/10000).toFixed(1)} 萬</td>
              <td className="num small">{(r.building_area_sqm * 0.3025).toFixed(1)} 坪</td>
              <td className="num small">{r.deal_date}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CalcTab({ tx }: { tx: Tx }) {
  const [downPct, setDownPct] = useState(0.20);
  const [rate, setRate]       = useState(0.022);
  const [years, setYears]     = useState(30);

  const totalPrice = tx.total_price ?? 0;
  const loan = totalPrice * (1 - downPct);
  const r = rate / 12;
  const n = years * 12;
  const monthly = r === 0 ? loan / n : loan * (r * Math.pow(1+r, n)) / (Math.pow(1+r, n) - 1);
  const downAmount = totalPrice * downPct;
  const totalInterest = monthly * n - loan;

  const { data: yieldData } = useQuery({
    queryKey: ["yield", tx.id],
    queryFn: () => api.txYield(tx.id),
    enabled: tx.deal_kind === "sale",
  });

  return (
    <div>
      <h4 style={{ margin: "0 0 8px" }}>房貸試算</h4>
      <div className="grid cols-3" style={{ gap: 8 }}>
        <div>
          <label>自備款比例</label>
          <select value={downPct} onChange={(e) => setDownPct(+e.target.value)}>
            <option value={0.10}>10%</option>
            <option value={0.20}>20%</option>
            <option value={0.30}>30%</option>
            <option value={0.40}>40%</option>
          </select>
        </div>
        <div>
          <label>年利率</label>
          <select value={rate} onChange={(e) => setRate(+e.target.value)}>
            <option value={0.0185}>1.85%</option>
            <option value={0.022}>2.2%</option>
            <option value={0.025}>2.5%</option>
            <option value={0.030}>3.0%</option>
            <option value={0.035}>3.5%</option>
          </select>
        </div>
        <div>
          <label>年限</label>
          <select value={years} onChange={(e) => setYears(+e.target.value)}>
            <option value={20}>20 年</option>
            <option value={30}>30 年</option>
            <option value={40}>40 年</option>
          </select>
        </div>
      </div>
      <div className="kpi-row" style={{ marginTop: 12 }}>
        <KPI label="月付" value={`${Math.round(monthly).toLocaleString()} 元`} accent />
        <KPI label="自備款" value={`${(downAmount/10000).toFixed(0)} 萬`} />
        <KPI label="貸款金額" value={`${(loan/10000).toFixed(0)} 萬`} />
        <KPI label="總利息" value={`${(totalInterest/10000).toFixed(0)} 萬`} />
      </div>

      {tx.deal_kind === "sale" && (
        <>
          <h4 style={{ margin: "16px 0 8px" }}>租金投報率（粗估）</h4>
          {!yieldData && <div className="loading">計算中…</div>}
          {yieldData && yieldData.estimate === null && (
            <div className="disclaimer">同區租賃樣本太少（{yieldData.samples ?? 0} 筆），無法估算。</div>
          )}
          {yieldData?.gross_yield != null && (
            <>
              <div className="kpi-row">
                <KPI label="估月租"     value={`${Math.round(yieldData.estimated_monthly_rent).toLocaleString()} 元`} />
                <KPI label="估年租"     value={`${(yieldData.estimated_annual_rent/10000).toFixed(1)} 萬`} />
                <KPI label="毛投報率"   value={`${(yieldData.gross_yield * 100).toFixed(2)} %`} accent />
                <KPI label="樣本"       value={`${yieldData.samples} 筆`} />
              </div>
              <p className="disclaimer">{yieldData.note}</p>
            </>
          )}
        </>
      )}
    </div>
  );
}

function KPI({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`kpi-tile ${accent ? "accent" : ""}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: any }) {
  return (
    <>
      <dt>{k}</dt>
      <dd>{v ?? "—"}</dd>
    </>
  );
}
