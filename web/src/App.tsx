import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { getTheme, setTheme } from "./lib/storage";

export default function App() {
  const { data } = useQuery({ queryKey: ["fresh"], queryFn: api.freshness });
  const [theme, setT] = useState<"dark" | "light">(getTheme());
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next); setT(next);
  };

  const NAV = [
    { to: "/",        end: true,  label: "首頁" },
    { to: "/quote",               label: "行情速查" },
    { to: "/map",                 label: "地圖" },
    { to: "/browse",              label: "瀏覽成交" },
    { to: "/deals",               label: "撿漏雷達" },
    { to: "/region",              label: "區域分析" },
    { to: "/compare",             label: "多區比較" },
    { to: "/calc",                label: "購屋試算" },
  ];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">Have-House <small>台灣房價資料站</small></div>
        <button className="ghost mobile-only nav-toggle" onClick={() => setNavOpen((v) => !v)}>☰</button>
        <nav className={`nav ${navOpen ? "open" : ""}`} onClick={() => setNavOpen(false)}>
          {NAV.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end} className={({isActive}) => isActive ? "active" : ""}>
              {it.label}
            </NavLink>
          ))}
        </nav>
        <div className="topbar-right">
          <button className="ghost theme-btn" onClick={toggleTheme} title={`切換到${theme==="dark"?"亮色":"深色"}`}>
            {theme === "dark" ? "☀" : "☾"}
          </button>
          <div className="freshness">
            {data?.last_deal_date
              ? `最新 ${data.last_deal_date} · ETL ${data.last_etl?.season ?? "—"}`
              : "資料載入中…"}
          </div>
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
