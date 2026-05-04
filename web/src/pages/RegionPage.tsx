import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { api } from "../api";
import { Tx, TxDetailPanel, TxTable } from "../components/TxTable";

const wan = (n: number | null | undefined, d = 1) =>
  n == null ? "—" : (n / 10000).toLocaleString("zh-TW", { maximumFractionDigits: d });

export default function RegionPage() {
  const { data: counties = [] } = useQuery({ queryKey: ["counties"], queryFn: api.counties });
  const [county, setCounty] = useState("a");
  const [district, setDistrict] = useState<string | undefined>();
  const [dealKind, setDealKind] = useState<"sale" | "presale" | "rent">("sale");

  const { data: districts = [] } = useQuery({
    queryKey: ["districts", county],
    queryFn: () => api.districts(county),
    enabled: !!county,
  });

  useEffect(() => { setDistrict(undefined); }, [county]);

  const { data: monthly = [] } = useQuery({
    queryKey: ["monthly", county, district, dealKind],
    queryFn: () => api.districtMonthly({ county, district, deal_kind: dealKind, months: 60 }),
    enabled: !!county,
  });

  const { data: dist } = useQuery({
    queryKey: ["dist", county, district, dealKind],
    queryFn: () => api.distribution({ county, district, deal_kind: dealKind, months: 12 }),
    enabled: !!county,
  });

  const { data: heat = [] } = useQuery({
    queryKey: ["heat", county, dealKind],
    queryFn: () => api.heatmap({ county, deal_kind: dealKind, months: 12 }),
  });

  const { data: momentum = [] } = useQuery({
    queryKey: ["mom", county, dealKind],
    queryFn: () => api.momentum(county, dealKind),
  });

  const { data: recent } = useQuery({
    queryKey: ["recent", county, district, dealKind],
    queryFn: () => api.searchTx({
      county, district, deal_kind: dealKind, exclude_special: true,
      sort: "deal_date", order: "desc", limit: 20,
    }),
    enabled: !!county,
  });

  const [selected, setSelected] = useState<Tx | null>(null);
  const recentRows: Tx[] = recent?.results ?? [];

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <div className="row">
          <div>
            <label>縣市</label>
            <select value={county} onChange={(e) => setCounty(e.target.value)}>
              {counties.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label>鄉鎮市區（可不選）</label>
            <select value={district ?? ""} onChange={(e) => setDistrict(e.target.value || undefined)}>
              <option value="">— 全縣市 —</option>
              {districts.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label>類型</label>
            <select value={dealKind} onChange={(e) => setDealKind(e.target.value as any)}>
              <option value="sale">買賣</option>
              <option value="presale">預售</option>
              <option value="rent">租賃</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>每坪中位數趨勢（近 60 個月）</h3>
          <div style={{ height: 280 }}>
            <ResponsiveContainer>
              <LineChart data={monthly}>
                <CartesianGrid stroke="#30363d" strokeDasharray="3 3" />
                <XAxis dataKey="month" stroke="#8b949e" />
                <YAxis stroke="#8b949e"
                       tickFormatter={(v) => (v / 10000).toFixed(0) + "萬"} />
                <Tooltip
                  contentStyle={{ background: "#161b22", border: "1px solid #30363d" }}
                  formatter={(v: any) => `${wan(v)} 萬/坪`}
                />
                <Legend />
                <Line type="monotone" dataKey="median_unit_price_ping" stroke="#4ade80" name="中位數" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="avg_unit_price_ping"    stroke="#60a5fa" name="平均"   dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {dist?.stats && (
            <div className="row" style={{ marginTop: 8 }}>
              <div className="kpi"><div className="label">P25</div><div className="value">{wan(dist.stats.p25)}</div></div>
              <div className="kpi"><div className="label">中位數</div><div className="value accent">{wan(dist.stats.p50)}</div></div>
              <div className="kpi"><div className="label">P75</div><div className="value">{wan(dist.stats.p75)}</div></div>
              <div className="kpi"><div className="label">樣本數</div><div className="value">{dist.stats.n?.toLocaleString()}</div></div>
            </div>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>各區（{counties.find(c=>c.code===county)?.name}）中位每坪</h3>
          <div style={{ height: 320, overflow: "auto" }}>
            <ResponsiveContainer width="100%" height={Math.max(320, heat.length * 26)}>
              <BarChart data={heat} layout="vertical" margin={{ left: 60 }}>
                <CartesianGrid stroke="#30363d" strokeDasharray="3 3" />
                <XAxis type="number" stroke="#8b949e"
                       tickFormatter={(v) => (v / 10000).toFixed(0) + "萬"} />
                <YAxis type="category" dataKey="district" stroke="#8b949e" width={70} />
                <Tooltip
                  contentStyle={{ background: "#161b22", border: "1px solid #30363d" }}
                  formatter={(v: any) => `${wan(v)} 萬/坪`}
                />
                <Bar dataKey="median_price_ping" fill="#60a5fa" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>近期成交（{district ?? counties.find(c=>c.code===county)?.name}）</h3>
        <p className="disclaimer" style={{ marginTop: -4 }}>
          顯示最新 20 筆，已排除特殊交易。點任一列可看完整資訊。
        </p>
        <TxTable rows={recentRows} dense onRowClick={setSelected} />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>價格動能 — 過去 6 個月 vs. 6~12 個月</h3>
        <div className="tx-table-wrap">
          <table className="tx-table">
            <thead>
              <tr>
                <th>區</th><th style={{ textAlign: "right" }}>近 6 月中位</th>
                <th style={{ textAlign: "right" }}>前 6~12 月中位</th>
                <th style={{ textAlign: "right" }}>變化</th>
                <th style={{ textAlign: "right" }}>樣本(近/前)</th>
              </tr>
            </thead>
            <tbody>
              {momentum.slice(0, 30).map((r: any) => (
                <tr key={r.district}>
                  <td><span className="badge">{r.district}</span></td>
                  <td className="num">{wan(r.p_now)} 萬</td>
                  <td className="num">{wan(r.p_prev)} 萬</td>
                  <td className="num" style={{ color: r.pct_change > 0 ? "#ef4444" : "#4ade80", fontWeight: 700 }}>
                    {r.pct_change == null ? "—" : ((r.pct_change > 0 ? "+" : "") + (r.pct_change * 100).toFixed(1) + "%")}
                  </td>
                  <td className="num small">{r.n_now ?? 0} / {r.n_prev ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="disclaimer">
          動能僅反映成交組合變化，不等於同一物件之漲跌。樣本量過少（&lt; 10）的區建議忽略。
        </p>
      </div>

      <TxDetailPanel tx={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
