/** 把陣列匯出成 CSV，並觸發瀏覽器下載。 */
const fmt = (v: any) => {
  if (v == null) return "";
  const s = String(v).replace(/"/g, '""');
  if (/[,"\n]/.test(s)) return `"${s}"`;
  return s;
};

export function downloadCSV(filename: string, rows: any[], columns: { key: string; label: string }[]) {
  if (!rows.length) {
    alert("無資料可匯出");
    return;
  }
  const head = columns.map((c) => fmt(c.label)).join(",");
  const body = rows.map((r) => columns.map((c) => fmt(r[c.key])).join(",")).join("\n");
  // BOM for Excel UTF-8 compatibility
  const blob = new Blob(["﻿" + head + "\n" + body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
