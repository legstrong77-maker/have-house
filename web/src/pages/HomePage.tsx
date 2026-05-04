import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Tx, TxCardGrid, TxDetailPanel } from "../components/TxTable";

const wan = (n: any, d = 1) =>
  n == null ? "—" : (Number(n) / 10000).toLocaleString("zh-TW", { maximumFractionDigits: d });

export default function HomePage() {
  const [selected, setSelected] = useState<Tx | null>(null);
  const [hotCounty, setHotCounty] = useState("a");
  const [loadHeavy, setLoadHeavy] = useState(false);   // 預設不載重量查詢

  const { data: counties = [] } = useQuery({
    queryKey: ["county-summary"],
    queryFn: () => api.countySummary("sale"),
  });

  // 「最新成交 6 筆」改用單一縣市 (有 index 走得很快)
  const { data: latestTx } = useQuery({
    queryKey: ["latest-tx-home", hotCounty],
    queryFn: () => api.searchTx({
      county: hotCounty,
      deal_kind: "sale", exclude_special: true,
      sort: "deal_date", order: "desc", limit: 6,
    }),
    enabled: counties.length > 0,
  });

  // 撿漏 / 動能：只有用戶點「載入」按鈕才查
  const { data: deals = [] } = useQuery({
    queryKey: ["home-deals"],
    queryFn: () => api.underpriced({ months: 6, threshold: 0.85, limit: 6 }),
    enabled: loadHeavy,
  });

  const { data: momentum = [] } = useQuery({
    queryKey: ["home-momentum", hotCounty],
    queryFn: () => api.momentum(hotCounty, "sale"),
    enabled: loadHeavy,
  });

  const { data: freshness } = useQuery({ queryKey: ["fresh-home"], queryFn: api.freshness });
  const totalDeals = counties.reduce((s: number, c: any) => s + (c.total_deals ?? 0), 0);

  const top3 = counties.slice(0, 3);

  return (
    <div className="home">
      {/* Hero */}
      <section className="hero card">
        <div className="hero-body">
          <h1>給仲介用的房價工具站</h1>
          <p>
            內政部實價登錄 · 每旬同步 · 互動地圖 · 行情速查 · 撿漏雷達 · 區域動能 · 購屋試算。
            一切資料客觀呈現，幫你跟客戶講清楚。
          </p>
          <div className="hero-cta">
            <Link to="/quote"  className="btn-primary">📊 行情速查</Link>
            <Link to="/map"    className="btn-primary" style={{ background: "linear-gradient(180deg,#dc2626,#991b1b)", boxShadow: "0 4px 16px rgba(220,38,38,.4)" }}>🗺 互動地圖</Link>
            <Link to="/deals"  className="btn-secondary">🎯 撿漏雷達</Link>
            <Link to="/region" className="btn-secondary">📈 區域分析</Link>
          </div>
          {freshness?.last_deal_date && (
            <div className="hero-meta">
              已收錄 <b>{totalDeals.toLocaleString()}</b> 筆買賣 · 最新成交日 <b>{freshness.last_deal_date}</b> · ETL {freshness.last_etl?.season ?? "—"}
            </div>
          )}
        </div>
        <div className="hero-art">
          <div className="hero-stats">
            {top3.map((c: any) => (
              <div key={c.county_code} className="hero-stat-card">
                <div className="hs-name">{c.county_name}</div>
                <div className="hs-price">{wan(c.median_unit_price_ping, 0)} <small>萬/坪</small></div>
                <div className="hs-bar">
                  <div className="hs-bar-fill" style={{
                    width: `${Math.min(100, (c.median_unit_price_ping / 2_000_000) * 100)}%`,
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 各縣市排行 */}
      <section className="card">
        <div className="section-head">
          <h2>各縣市買賣中位數</h2>
          <Link to="/region" style={{ fontSize: 13 }}>看區域分析 →</Link>
        </div>
        <div className="county-grid">
          {counties.map((c: any) => (
            <Link
              key={c.county_code}
              to={`/quote`}
              className="county-tile"
              title={`點擊到行情速查 ${c.county_name}`}
            >
              <div className="county-name">{c.county_name}</div>
              <div className="county-price">{wan(c.median_unit_price_ping, 1)} <span>萬/坪</span></div>
              <div className="county-meta">{(c.total_deals ?? 0).toLocaleString()} 筆 · 最新 {c.last_deal_date}</div>
              <div className="county-bar">
                <div className="county-bar-fill" style={{
                  width: `${Math.min(100, (c.median_unit_price_ping / 2_000_000) * 100)}%`,
                }} />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 最新成交 */}
      <section className="card">
        <div className="section-head">
          <h2>近期成交</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select value={hotCounty} onChange={(e) => setHotCounty(e.target.value)}
                    style={{ width: "auto", maxWidth: 140 }}>
              {counties.map((c: any) => <option key={c.county_code} value={c.county_code}>{c.county_name}</option>)}
            </select>
            <Link to="/browse" style={{ fontSize: 13 }}>看更多 →</Link>
          </div>
        </div>
        <TxCardGrid rows={(latestTx?.results as Tx[]) ?? []} onSelect={setSelected} dense />
      </section>

      {/* 重量查詢 — 預設不載入，需點擊 */}
      {!loadHeavy ? (
        <section className="card" style={{ textAlign: "center", padding: 32 }}>
          <h2 style={{ marginTop: 0 }}>🔥 動能 + 🎯 撿漏雷達</h2>
          <p style={{ color: "var(--muted)", marginBottom: 16 }}>
            這兩塊查詢較耗時 (~5–30 秒)。點下方按鈕載入。
          </p>
          <button onClick={() => setLoadHeavy(true)} style={{ width: "auto", padding: "10px 24px" }}>
            ▶ 載入動能 + 撿漏
          </button>
        </section>
      ) : (
        <>
          <section className="card">
            <div className="section-head">
              <h2>🔥 漲跌動能 — 近 6 月 vs. 前 6~12 月</h2>
              <select value={hotCounty} onChange={(e) => setHotCounty(e.target.value)}
                      style={{ width: "auto", maxWidth: 180 }}>
                {counties.map((c: any) => <option key={c.county_code} value={c.county_code}>{c.county_name}</option>)}
              </select>
            </div>
            {momentum.length === 0 ? (
              <div className="loading">動能查詢中…（首次約 5 秒）</div>
            ) : (
              <div className="momentum-row">
                <div className="momentum-col">
                  <div className="momentum-h">📈 漲幅前 5</div>
                  {momentum.filter((m: any) => m.pct_change != null && m.n_now >= 10)
                    .sort((a: any, b: any) => b.pct_change - a.pct_change).slice(0, 5).map((m: any) => (
                    <div key={m.district} className="momentum-row-item">
                      <span className="badge">{m.district}</span>
                      <span className="mr-mid">{wan(m.p_now)} 萬</span>
                      <span className="mr-pct up">+{(m.pct_change * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
                <div className="momentum-col">
                  <div className="momentum-h">📉 跌幅前 5</div>
                  {momentum.filter((m: any) => m.pct_change != null && m.n_now >= 10)
                    .sort((a: any, b: any) => a.pct_change - b.pct_change).slice(0, 5).map((m: any) => (
                    <div key={m.district} className="momentum-row-item">
                      <span className="badge">{m.district}</span>
                      <span className="mr-mid">{wan(m.p_now)} 萬</span>
                      <span className="mr-pct down">{(m.pct_change * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="card">
            <div className="section-head">
              <h2>🎯 本週撿漏雷達</h2>
              <Link to="/deals" style={{ fontSize: 13 }}>更多 →</Link>
            </div>
            {deals.length === 0 ? (
              <div className="loading">撿漏掃描中…（首次約 30 秒）</div>
            ) : (
              <TxCardGrid rows={deals as Tx[]} onSelect={setSelected} dense />
            )}
          </section>
        </>
      )}

      {/* 功能入口 */}
      <section className="card">
        <h2>仲介工具一覽</h2>
        <div className="features-grid">
          <FeatureCard to="/quote"   icon="📊" title="行情速查"   desc="輸入區段坪數 → 馬上看出價區間" />
          <FeatureCard to="/browse"  icon="📋" title="瀏覽成交"   desc="條件篩選排序 + 卡片/表格切換" />
          <FeatureCard to="/deals"   icon="🎯" title="撿漏雷達"   desc="低於同區 P25 的成交 → 找便宜物件" />
          <FeatureCard to="/region"  icon="📈" title="區域分析"   desc="趨勢圖、各區排名、動能" />
          <FeatureCard to="/map"     icon="🗺"  title="互動地圖"   desc="熱區 + 成交點 + 落針查周邊" />
          <FeatureCard to="/compare" icon="⚖"  title="多區比較"   desc="同時比較多個鄉鎮市區" />
          <FeatureCard to="/calc"    icon="🧮" title="購屋試算"   desc="房貸、可負擔、升息壓測、租或買" />
        </div>
        <div className="notice" style={{ marginTop: 12 }}>
          本站不提供建議出價，僅呈現相似物件之客觀統計區間。實際決策請諮詢仲介或估價師。
        </div>
      </section>

      <TxDetailPanel tx={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function FeatureCard({ to, icon, title, desc }: { to: string; icon: string; title: string; desc: string }) {
  return (
    <Link to={to} className="feature-card">
      <div className="feature-icon">{icon}</div>
      <div className="feature-title">{title}</div>
      <div className="feature-desc">{desc}</div>
    </Link>
  );
}
