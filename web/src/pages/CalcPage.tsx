import { useState } from "react";
import { api } from "../api";

const wan = (n: number, d = 0) => (n / 10000).toLocaleString("zh-TW", { maximumFractionDigits: d });

export default function CalcPage() {
  return (
    <div className="grid cols-2" style={{ gap: 16 }}>
      <Mortgage />
      <Affordability />
      <Stress />
      <RentVsBuy />
    </div>
  );
}

function Mortgage() {
  const [form, setForm] = useState({
    total_price: 15_000_000, down_payment_pct: 0.2,
    annual_rate: 0.022, term_years: 30, grace_years: 0,
  });
  const [resp, setResp] = useState<any>(null);
  const submit = async () => setResp(await api.mortgage(form));
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>房貸試算</h3>
      <div className="row">
        <div><label>總價（元）</label><input type="number" value={form.total_price}
          onChange={(e) => setForm({ ...form, total_price: +e.target.value })} /></div>
        <div><label>自備款比例</label><input type="number" step="0.05" value={form.down_payment_pct}
          onChange={(e) => setForm({ ...form, down_payment_pct: +e.target.value })} /></div>
        <div><label>年利率</label><input type="number" step="0.001" value={form.annual_rate}
          onChange={(e) => setForm({ ...form, annual_rate: +e.target.value })} /></div>
        <div><label>年限</label><input type="number" value={form.term_years}
          onChange={(e) => setForm({ ...form, term_years: +e.target.value })} /></div>
        <div><label>寬限期（年）</label><input type="number" value={form.grace_years}
          onChange={(e) => setForm({ ...form, grace_years: +e.target.value })} /></div>
      </div>
      <button onClick={submit} style={{ marginTop: 12 }}>試算</button>
      {resp && (
        <div className="grid cols-2" style={{ marginTop: 12 }}>
          <div className="kpi"><div className="label">貸款金額</div><div className="value">{wan(resp.loan_amount, 0)} 萬</div></div>
          <div className="kpi"><div className="label">寬限期月繳息</div><div className="value">{Math.round(resp.monthly_interest_during_grace).toLocaleString()} 元</div></div>
          <div className="kpi"><div className="label">寬限期後月付</div><div className="value">{Math.round(resp.monthly_payment_after_grace).toLocaleString()} 元</div></div>
          <div className="kpi"><div className="label">總利息</div><div className="value">{wan(resp.total_interest, 0)} 萬</div></div>
        </div>
      )}
    </div>
  );
}

function Affordability() {
  const [form, setForm] = useState({
    monthly_income: 120_000, monthly_obligations: 5_000,
    savings: 3_000_000, annual_rate: 0.022,
    term_years: 30, dti_ratio: 0.40,
  });
  const [resp, setResp] = useState<any>(null);
  const submit = async () => setResp(await api.affordability(form));
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>可負擔房價試算</h3>
      <div className="row">
        <div><label>家戶月收入</label><input type="number" value={form.monthly_income}
          onChange={(e) => setForm({ ...form, monthly_income: +e.target.value })} /></div>
        <div><label>現有月支出</label><input type="number" value={form.monthly_obligations}
          onChange={(e) => setForm({ ...form, monthly_obligations: +e.target.value })} /></div>
        <div><label>自備款</label><input type="number" value={form.savings}
          onChange={(e) => setForm({ ...form, savings: +e.target.value })} /></div>
        <div><label>年利率</label><input type="number" step="0.001" value={form.annual_rate}
          onChange={(e) => setForm({ ...form, annual_rate: +e.target.value })} /></div>
        <div><label>年限</label><input type="number" value={form.term_years}
          onChange={(e) => setForm({ ...form, term_years: +e.target.value })} /></div>
        <div><label>DTI 上限</label><input type="number" step="0.05" value={form.dti_ratio}
          onChange={(e) => setForm({ ...form, dti_ratio: +e.target.value })} /></div>
      </div>
      <button onClick={submit} style={{ marginTop: 12 }}>試算</button>
      {resp && (
        <>
          <div className="grid cols-2" style={{ marginTop: 12 }}>
            <div className="kpi"><div className="label">可負擔月付</div><div className="value">{Math.round(resp.affordable_monthly_payment).toLocaleString()} 元</div></div>
            <div className="kpi"><div className="label">最高貸款</div><div className="value">{wan(resp.max_loan_amount, 0)} 萬</div></div>
            <div className="kpi"><div className="label">最高總價（含自備）</div><div className="value">{wan(resp.max_property_price, 0)} 萬</div></div>
          </div>
          <ul className="disclaimer" style={{ marginTop: 8 }}>
            {resp.notes.map((n: string, i: number) => <li key={i}>{n}</li>)}
          </ul>
        </>
      )}
    </div>
  );
}

function Stress() {
  const [form, setForm] = useState({
    total_price: 15_000_000, down_payment_pct: 0.2,
    base_rate: 0.022, term_years: 30, bumps: [0.005, 0.01, 0.015, 0.02],
  });
  const [resp, setResp] = useState<any>(null);
  const submit = async () => setResp(await api.stress(form));
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>升息壓力測試</h3>
      <div className="row">
        <div><label>總價</label><input type="number" value={form.total_price}
          onChange={(e) => setForm({ ...form, total_price: +e.target.value })} /></div>
        <div><label>自備款比例</label><input type="number" step="0.05" value={form.down_payment_pct}
          onChange={(e) => setForm({ ...form, down_payment_pct: +e.target.value })} /></div>
        <div><label>當前年利率</label><input type="number" step="0.001" value={form.base_rate}
          onChange={(e) => setForm({ ...form, base_rate: +e.target.value })} /></div>
        <div><label>年限</label><input type="number" value={form.term_years}
          onChange={(e) => setForm({ ...form, term_years: +e.target.value })} /></div>
      </div>
      <button onClick={submit} style={{ marginTop: 12 }}>試算</button>
      {resp && (
        <table className="table" style={{ marginTop: 12 }}>
          <thead><tr><th>情境年利率</th><th>月付</th><th>較現在多</th><th>%</th></tr></thead>
          <tbody>
            <tr><td>當前 {(form.base_rate * 100).toFixed(2)}%</td>
                <td>{Math.round(resp.base_monthly).toLocaleString()}</td>
                <td>—</td><td>—</td></tr>
            {resp.scenarios.map((s: any) => (
              <tr key={s.rate}>
                <td>{(s.rate * 100).toFixed(2)}%</td>
                <td>{Math.round(s.monthly).toLocaleString()}</td>
                <td>+{Math.round(s.delta_monthly).toLocaleString()}</td>
                <td>+{(s.delta_pct * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function RentVsBuy() {
  const [form, setForm] = useState({
    total_price: 15_000_000, down_payment_pct: 0.2,
    annual_rate: 0.022, term_years: 30,
    monthly_rent: 25_000, appreciation_per_year: 0.02,
    invest_alt_return: 0.04, horizon_years: 10,
  });
  const [resp, setResp] = useState<any>(null);
  const submit = async () => setResp(await api.rentVsBuy(form));
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>租 vs 買 試算</h3>
      <div className="row">
        <div><label>總價</label><input type="number" value={form.total_price}
          onChange={(e) => setForm({ ...form, total_price: +e.target.value })} /></div>
        <div><label>同地段月租</label><input type="number" value={form.monthly_rent}
          onChange={(e) => setForm({ ...form, monthly_rent: +e.target.value })} /></div>
        <div><label>年漲幅假設</label><input type="number" step="0.005" value={form.appreciation_per_year}
          onChange={(e) => setForm({ ...form, appreciation_per_year: +e.target.value })} /></div>
        <div><label>自備款投資報酬</label><input type="number" step="0.005" value={form.invest_alt_return}
          onChange={(e) => setForm({ ...form, invest_alt_return: +e.target.value })} /></div>
        <div><label>規劃年限</label><input type="number" value={form.horizon_years}
          onChange={(e) => setForm({ ...form, horizon_years: +e.target.value })} /></div>
      </div>
      <button onClick={submit} style={{ marginTop: 12 }}>試算</button>
      {resp && (
        <>
          <div className="grid cols-2" style={{ marginTop: 12 }}>
            <div className="kpi"><div className="label">買的淨成本</div><div className="value">{wan(resp.buy_net_cost, 0)} 萬</div></div>
            <div className="kpi"><div className="label">租的淨成本</div><div className="value">{wan(resp.rent_net_cost, 0)} 萬</div></div>
            <div className="kpi"><div className="label">回本年</div><div className="value">{resp.breakeven_year ?? "—"}</div></div>
          </div>
          <p className="disclaimer">{resp.note}</p>
        </>
      )}
    </div>
  );
}
