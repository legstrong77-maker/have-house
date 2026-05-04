import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { Tx, TxDetailPanel, TxTable } from "../components/TxTable";

export default function DealsPage() {
  const { data: counties = [] } = useQuery({ queryKey: ["counties"], queryFn: api.counties });
  const [county, setCounty] = useState<string>("");
  const [district, setDistrict] = useState<string>("");
  const [threshold, setThreshold] = useState(0.85);
  const [months, setMonths] = useState(6);
  const [selected, setSelected] = useState<Tx | null>(null);

  const { data: districts = [] } = useQuery({
    queryKey: ["districts", county],
    queryFn: () => api.districts(county),
    enabled: !!county,
  });
  useEffect(() => { setDistrict(""); }, [county]);

  const { data = [], isFetching } = useQuery({
    queryKey: ["underpriced", county, district, threshold, months],
    queryFn: () => api.underpriced({
      county: county || undefined,
      district: district || undefined,
      threshold, months, limit: 100,
    }),
  });

  const rows = (data as any[]).map((r) => ({ ...r, price_ratio: r.price_ratio })) as Tx[];

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>撿漏雷達</h2>
        <p style={{ color: "var(--muted)", marginTop: -4 }}>
          挑出近期成交中，單價明顯低於同區同類別 P25 的物件。對找便宜屋特別有用，但別忘了：
          <b style={{ color: "var(--warn)" }}> 偏低不一定是好物件，可能是凶宅、海砂屋、產權瑕疵或其他特殊原因</b>。
        </p>
        <div className="row" style={{ marginTop: 12 }}>
          <div>
            <label>縣市</label>
            <select value={county} onChange={(e) => setCounty(e.target.value)}>
              <option value="">— 全台 —</option>
              {counties.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label>鄉鎮市區</label>
            <select value={district} onChange={(e) => setDistrict(e.target.value)} disabled={!county}>
              <option value="">— 全縣市 —</option>
              {districts.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label>低於 P25 的幾倍</label>
            <select value={threshold} onChange={(e) => setThreshold(+e.target.value)}>
              <option value={0.95}>95%</option>
              <option value={0.90}>90%</option>
              <option value={0.85}>85%（預設）</option>
              <option value={0.80}>80%（嚴格）</option>
              <option value={0.70}>70%（極嚴）</option>
            </select>
          </div>
          <div>
            <label>近 N 個月</label>
            <select value={months} onChange={(e) => setMonths(+e.target.value)}>
              <option value={3}>3 個月</option>
              <option value={6}>6 個月</option>
              <option value={12}>12 個月</option>
              <option value={24}>24 個月</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {isFetching ? (
          <div className="loading" style={{ padding: 40 }}>掃描中…</div>
        ) : (
          <TxTable rows={rows} onRowClick={setSelected} />
        )}
      </div>

      <TxDetailPanel tx={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
