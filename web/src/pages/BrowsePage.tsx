import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { Tx, TxCardGrid, TxDetailPanel, TxTable } from "../components/TxTable";
import { downloadCSV } from "../lib/csv";
import { listSearches, removeSearch, saveSearch, SavedSearch } from "../lib/storage";

const DEAL_TABS: { v: "sale" | "presale" | "rent"; label: string }[] = [
  { v: "sale",    label: "中古買賣" },
  { v: "presale", label: "預售屋" },
  { v: "rent",    label: "租賃" },
];

const wan = (n: any, d = 1) => n == null ? "—" : (Number(n)/10000).toLocaleString("zh-TW", { maximumFractionDigits: d });

type Filters = {
  dealKind: "sale" | "presale" | "rent";
  county: string;
  district?: string;
  buildingType?: string;
  minPrice: string;
  maxPrice: string;
  minPing: string;
  maxPing: string;
  maxAge: string;
  rooms: string;
  excludeSpecial: boolean;
  residentialOnly: boolean;
  dateFrom: string;
  dateTo: string;
  sort: "deal_date" | "unit_price_per_ping" | "total_price";
  order: "asc" | "desc";
};

const DEFAULT_FILTERS: Filters = {
  dealKind: "sale", county: "a", district: undefined, buildingType: undefined,
  minPrice: "", maxPrice: "", minPing: "", maxPing: "",
  maxAge: "", rooms: "",
  excludeSpecial: true, residentialOnly: true,
  dateFrom: "", dateTo: "",
  sort: "deal_date", order: "desc",
};

export default function BrowsePage() {
  const { data: counties = [] } = useQuery({ queryKey: ["counties"], queryFn: api.counties });
  const [f, setF] = useState<Filters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(0);
  const [showFilter, setShowFilter] = useState(false);   // mobile drawer
  const [savedList, setSavedList] = useState<SavedSearch[]>(() => listSearches());
  const limit = 30;

  const update = (patch: Partial<Filters>) => setF((cur) => ({ ...cur, ...patch }));

  const { data: districts = [] } = useQuery({
    queryKey: ["districts", f.county],
    queryFn: () => api.districts(f.county),
    enabled: !!f.county,
  });
  const { data: buildingTypes = [] } = useQuery({
    queryKey: ["building-types"],
    queryFn: api.buildingTypes,
  });

  // 任何篩選條件改變 → 跳回第 1 頁
  useEffect(() => { setPage(0); }, [
    f.dealKind, f.county, f.district, f.buildingType,
    f.minPrice, f.maxPrice, f.minPing, f.maxPing, f.maxAge, f.rooms,
    f.excludeSpecial, f.residentialOnly,
    f.dateFrom, f.dateTo, f.sort, f.order,
  ]);

  const query = useMemo(() => {
    const q: Record<string, any> = {
      county: f.county, deal_kind: f.dealKind,
      exclude_special: f.excludeSpecial,
      residential_only: f.residentialOnly,
      sort: f.sort, order: f.order,
      limit, offset: page * limit,
    };
    if (f.district)     q.district = f.district;
    if (f.buildingType) q.building_type = f.buildingType;
    if (f.minPrice)     q.min_price = Number(f.minPrice) * 10000;
    if (f.maxPrice)     q.max_price = Number(f.maxPrice) * 10000;
    if (f.minPing)      q.min_ping = Number(f.minPing);
    if (f.maxPing)      q.max_ping = Number(f.maxPing);
    if (f.maxAge)       q.max_age = Number(f.maxAge);
    if (f.rooms)        q.rooms = Number(f.rooms);
    if (f.dateFrom)     q.date_from = f.dateFrom;
    if (f.dateTo)       q.date_to = f.dateTo;
    return q;
  }, [f, page]);

  // 翻頁時只重抓「列」(快)，篩選改變才重抓 count (慢)
  const filterKey = useMemo(() => {
    const { offset: _o, limit: _l, ...rest } = query as any;
    return rest;
  }, [query]);

  const { data, isFetching } = useQuery({
    queryKey: ["browse", query],
    queryFn: () => api.searchTx(query),
    placeholderData: keepPreviousData,
  });

  const { data: countData } = useQuery({
    queryKey: ["browse-count", filterKey],
    queryFn: () => api.countTx(filterKey),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const { data: stats } = useQuery({
    queryKey: ["browse-stats", f.county, f.district, f.dealKind],
    queryFn: () => api.distribution({ county: f.county, district: f.district, deal_kind: f.dealKind, months: 12 }),
    enabled: !!f.county,
    staleTime: 60_000,
  });

  const [selected, setSelected] = useState<Tx | null>(null);
  const [view, setView] = useState<"table" | "card">(() =>
    (localStorage.getItem("hh.browse.view") as any) ?? "card");
  useEffect(() => { localStorage.setItem("hh.browse.view", view); }, [view]);
  const rows: Tx[] = data?.results ?? [];
  const total: number = countData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const hasMore = rows.length === limit && page + 1 < totalPages;

  const onSort = (col: string) => {
    if (f.sort === col) update({ order: f.order === "asc" ? "desc" : "asc" });
    else update({ sort: col as any, order: "desc" });
  };

  const onSave = () => {
    const name = prompt("給這個搜尋一個名字：",
      `${counties.find(c=>c.code===f.county)?.name ?? ""}${f.district ?? ""} ${f.dealKind}`);
    if (!name) return;
    saveSearch({ name, query: f, page: "browse" });
    setSavedList(listSearches());
  };
  const onLoad = (s: SavedSearch) => { setF({ ...DEFAULT_FILTERS, ...s.query }); setPage(0); };
  const onRemove = (id: string) => { removeSearch(id); setSavedList(listSearches()); };

  const onExport = () => {
    downloadCSV(`have-house_${f.county}_${f.district ?? "all"}_${new Date().toISOString().slice(0,10)}.csv`,
      rows.map((r) => ({
        district: r.district,
        address: r.address ?? "",
        building_type: r.building_type ?? "",
        total_price_wan: r.total_price ? Math.round(r.total_price/10000) : "",
        unit_price_per_ping_wan: r.unit_price_per_ping ? +(r.unit_price_per_ping/10000).toFixed(2) : "",
        ping: r.building_area_sqm ? +(r.building_area_sqm * 0.3025).toFixed(1) : "",
        rooms: r.rooms ?? "",
        halls: r.halls ?? "",
        baths: r.baths ?? "",
        floor: r.transfer_floor_num ?? "",
        total_floors: r.total_floors ?? "",
        age_years: r.age_years ?? "",
        deal_date: r.deal_date,
      })),
      [
        { key: "district",                label: "鄉鎮市區" },
        { key: "address",                 label: "地址" },
        { key: "building_type",           label: "建物型態" },
        { key: "total_price_wan",         label: "總價(萬)" },
        { key: "unit_price_per_ping_wan", label: "單價(萬/坪)" },
        { key: "ping",                    label: "坪數" },
        { key: "rooms",                   label: "房" },
        { key: "halls",                   label: "廳" },
        { key: "baths",                   label: "衛" },
        { key: "floor",                   label: "樓層" },
        { key: "total_floors",            label: "總樓" },
        { key: "age_years",               label: "屋齡" },
        { key: "deal_date",               label: "成交日" },
      ]);
  };

  return (
    <div className="browse-shell">
      {/* 行動版浮動篩選按鈕 */}
      <button className="filter-fab" onClick={() => setShowFilter(true)}>篩選 ☰</button>

      {/* 左側篩選 */}
      <aside className={`filters card ${showFilter ? "drawer-open" : ""}`}>
        <div className="filters-head">
          <h3>篩選條件</h3>
          <button className="ghost mobile-only" onClick={() => setShowFilter(false)}>✕</button>
        </div>

        <div className="tabs">
          {DEAL_TABS.map((t) => (
            <button key={t.v} className={`tab ${f.dealKind === t.v ? "active" : ""}`}
                    onClick={() => update({ dealKind: t.v })}>{t.label}</button>
          ))}
        </div>

        <label>縣市</label>
        <select value={f.county} onChange={(e) => update({ county: e.target.value, district: undefined })}>
          {counties.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>

        <label>鄉鎮市區</label>
        <select value={f.district ?? ""} onChange={(e) => update({ district: e.target.value || undefined })}>
          <option value="">— 全縣市 —</option>
          {districts.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>

        <label>建物型態</label>
        <select value={f.buildingType ?? ""} onChange={(e) => update({ buildingType: e.target.value || undefined })}>
          <option value="">— 全部 —</option>
          {buildingTypes.map((b: any) => (
            <option key={b.name} value={b.name}>{b.name.replace(/\(.*?\)/g, "")} · {b.count.toLocaleString()}</option>
          ))}
        </select>

        <div className="grid cols-2" style={{ gap: 8 }}>
          <div><label>總價（萬，最低）</label>
            <input type="number" value={f.minPrice} onChange={(e) => update({ minPrice: e.target.value })} placeholder="800" /></div>
          <div><label>總價（萬，最高）</label>
            <input type="number" value={f.maxPrice} onChange={(e) => update({ maxPrice: e.target.value })} placeholder="2500" /></div>
        </div>
        <div className="grid cols-2" style={{ gap: 8 }}>
          <div><label>坪數 ≥</label>
            <input type="number" value={f.minPing} onChange={(e) => update({ minPing: e.target.value })} placeholder="20" /></div>
          <div><label>坪數 ≤</label>
            <input type="number" value={f.maxPing} onChange={(e) => update({ maxPing: e.target.value })} placeholder="50" /></div>
        </div>
        <div className="grid cols-2" style={{ gap: 8 }}>
          <div><label>屋齡 ≤</label>
            <input type="number" value={f.maxAge} onChange={(e) => update({ maxAge: e.target.value })} placeholder="15" /></div>
          <div><label>幾房</label>
            <input type="number" value={f.rooms} onChange={(e) => update({ rooms: e.target.value })} placeholder="3" /></div>
        </div>
        <div className="grid cols-2" style={{ gap: 8 }}>
          <div><label>成交日 從</label>
            <input type="date" value={f.dateFrom} onChange={(e) => update({ dateFrom: e.target.value })} /></div>
          <div><label>到</label>
            <input type="date" value={f.dateTo} onChange={(e) => update({ dateTo: e.target.value })} /></div>
        </div>

        <label className="check-row">
          <input type="checkbox" checked={f.excludeSpecial} onChange={(e) => update({ excludeSpecial: e.target.checked })} />
          排除特殊交易（親友／員工／瑕疵等）
        </label>
        <label className="check-row">
          <input type="checkbox" checked={f.residentialOnly} onChange={(e) => update({ residentialOnly: e.target.checked })} />
          只看住宅（排除土地、車位、辦公等）
        </label>

        <div className="row" style={{ marginTop: 12, gap: 6 }}>
          <button className="ghost" onClick={() => setF(DEFAULT_FILTERS)}>清除</button>
          <button className="ghost" onClick={onSave}>★ 儲存搜尋</button>
        </div>

        {savedList.length > 0 && (
          <div className="saved-list">
            <div className="label" style={{ marginTop: 12 }}>已儲存的搜尋</div>
            {savedList.map((s) => (
              <div className="saved-item" key={s.id}>
                <button className="saved-load" onClick={() => onLoad(s)}>{s.name}</button>
                <button className="saved-del"  onClick={() => onRemove(s.id)} title="刪除">✕</button>
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* 右側結果 */}
      <section className="results">
        <div className="card" style={{ padding: "14px 18px" }}>
          <div className="row" style={{ alignItems: "center", gap: 16 }}>
            <div className="kpi"><div className="label">符合條件</div><div className="value">{total.toLocaleString()}</div></div>
            <div className="kpi"><div className="label">中位每坪 (12個月)</div><div className="value accent">{wan(stats?.stats?.p50)} 萬</div></div>
            <div className="kpi"><div className="label">P25 / P75</div><div className="value">{wan(stats?.stats?.p25)} ~ {wan(stats?.stats?.p75)} 萬</div></div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
              {isFetching && <span style={{ color: "var(--muted)", fontSize: 12 }}>載入中…</span>}
              <div className="seg">
                <button className={`seg-btn ${view==="card"?"active":""}`}  onClick={() => setView("card")}>▦ 卡片</button>
                <button className={`seg-btn ${view==="table"?"active":""}`} onClick={() => setView("table")}>☰ 表格</button>
              </div>
              <button className="ghost" onClick={onExport} disabled={!rows.length}>⤓ CSV</button>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: view === "card" ? 16 : 0, overflow: "hidden" }}>
          {view === "card"
            ? <TxCardGrid rows={rows} onSelect={setSelected} />
            : <TxTable rows={rows} sort={f.sort} order={f.order} onSort={onSort} onRowClick={setSelected} />
          }
        </div>

        <div className="row pagination" style={{ justifyContent: "center", gap: 8 }}>
          <button className="ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>← 上一頁</button>
          <div className="pageinfo">第 {page + 1} / {totalPages.toLocaleString()} 頁 · 共 {total.toLocaleString()} 筆</div>
          <button className="ghost" disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>下一頁 →</button>
        </div>
      </section>

      <TxDetailPanel tx={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
