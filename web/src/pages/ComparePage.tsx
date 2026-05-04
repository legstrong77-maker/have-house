import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";

const wan = (n: number | null | undefined, d = 1) =>
  n == null ? "—" : (n / 10000).toLocaleString("zh-TW", { maximumFractionDigits: d });

type Reg = { county: string; district: string };

export default function ComparePage() {
  const { data: counties = [] } = useQuery({ queryKey: ["counties"], queryFn: api.counties });
  const [regions, setRegions] = useState<Reg[]>([
    { county: "a", district: "" },
    { county: "f", district: "" },
  ]);

  const update = (i: number, patch: Partial<Reg>) =>
    setRegions((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const add = () => setRegions((rs) => [...rs, { county: "a", district: "" }]);
  const remove = (i: number) => setRegions((rs) => rs.filter((_, idx) => idx !== i));

  const ready = regions.every((r) => r.county && r.district);

  const { data: result } = useQuery({
    queryKey: ["compare", regions],
    queryFn: () => api.compareRegions(regions, "sale"),
    enabled: ready,
  });

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>多區比較</h3>
        <p className="disclaimer">同時比較多個鄉鎮市區的近 12 個月買賣統計（中位每坪、平均屋齡、平均坪數）。</p>
        {regions.map((r, i) => (
          <RegionRow
            key={i} idx={i} reg={r}
            counties={counties}
            onChange={(p) => update(i, p)}
            onRemove={regions.length > 1 ? () => remove(i) : undefined}
          />
        ))}
        <button className="ghost" onClick={add}>＋ 加一個區</button>
      </div>

      {result && (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>地區</th><th>近 12 月成交</th><th>中位每坪</th><th>平均每坪</th>
                <th>平均坪數</th><th>平均屋齡</th>
              </tr>
            </thead>
            <tbody>
              {result.map((r: any, i: number) => {
                const co = counties.find((c) => c.code === r.region.county);
                return (
                  <tr key={i}>
                    <td>{co?.name} {r.region.district}</td>
                    <td>{r.stats?.deals_12m ?? "—"}</td>
                    <td>{wan(r.stats?.median_ping)} 萬</td>
                    <td>{wan(r.stats?.avg_ping)} 萬</td>
                    <td>{r.stats?.avg_ping_size?.toFixed(1) ?? "—"} 坪</td>
                    <td>{r.stats?.avg_age?.toFixed(1) ?? "—"} 年</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RegionRow({
  idx, reg, counties, onChange, onRemove,
}: {
  idx: number; reg: Reg;
  counties: { code: string; name: string }[];
  onChange: (p: Partial<Reg>) => void;
  onRemove?: () => void;
}) {
  const { data: districts = [] } = useQuery({
    queryKey: ["districts", reg.county],
    queryFn: () => api.districts(reg.county),
    enabled: !!reg.county,
  });
  return (
    <div className="row" style={{ marginBottom: 8 }}>
      <div>
        <label>區域 {idx + 1} · 縣市</label>
        <select value={reg.county} onChange={(e) => onChange({ county: e.target.value, district: "" })}>
          {counties.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label>鄉鎮市區</label>
        <select value={reg.district} onChange={(e) => onChange({ district: e.target.value })}>
          <option value="">— 請選擇 —</option>
          {districts.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
      <div style={{ flex: 0, alignSelf: "end" }}>
        {onRemove && <button className="ghost" onClick={onRemove}>移除</button>}
      </div>
    </div>
  );
}
