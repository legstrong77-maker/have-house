import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import App from "./App";
import HomePage from "./pages/HomePage";
import BrowsePage from "./pages/BrowsePage";
import DealsPage from "./pages/DealsPage";
import QuotePage from "./pages/QuotePage";
import "./styles.css";

// 地圖 + 區域頁 lazy load —— 主程式不再帶 maplibre / recharts (~1MB)
const MapPage     = lazy(() => import("./pages/MapPage"));
const RegionPage  = lazy(() => import("./pages/RegionPage"));
const ComparePage = lazy(() => import("./pages/ComparePage"));
const CalcPage    = lazy(() => import("./pages/CalcPage"));

const Fallback = () => (
  <div style={{ padding: 60, textAlign: "center", color: "var(--muted)" }}>載入中…</div>
);

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000,           // 多數查詢 5 分鐘內不重抓
      gcTime:    30 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />}>
            <Route index element={<HomePage />} />
            <Route path="quote" element={<QuotePage />} />
            <Route path="browse" element={<BrowsePage />} />
            <Route path="deals" element={<DealsPage />} />
            <Route path="map"     element={<Suspense fallback={<Fallback />}><MapPage /></Suspense>} />
            <Route path="region"  element={<Suspense fallback={<Fallback />}><RegionPage /></Suspense>} />
            <Route path="compare" element={<Suspense fallback={<Fallback />}><ComparePage /></Suspense>} />
            <Route path="calc"    element={<Suspense fallback={<Fallback />}><CalcPage /></Suspense>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
