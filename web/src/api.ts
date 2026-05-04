const BASE = (import.meta as any).env?.VITE_API_BASE ?? "/api";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

export const api = {
  counties:        () => req<{code:string;name:string}[]>("/meta/counties"),
  districts:       (county: string) =>
                     req<string[]>(`/meta/districts?county=${county}`),
  freshness:       () => req<any>("/meta/data-freshness"),
  buildingTypes:   () => req<{name:string;count:number}[]>("/meta/building-types"),

  countySummary:   (deal_kind: string = "sale") =>
                     req<any[]>(`/stats/county-summary?deal_kind=${deal_kind}`),
  districtMonthly: (q: Record<string,string|number|undefined>) => {
                     const sp = new URLSearchParams();
                     Object.entries(q).forEach(([k,v]) => v != null && sp.set(k, String(v)));
                     return req<any[]>(`/stats/district-monthly?${sp.toString()}`);
                   },
  distribution:    (q: Record<string,string|number|undefined>) => {
                     const sp = new URLSearchParams();
                     Object.entries(q).forEach(([k,v]) => v != null && sp.set(k, String(v)));
                     return req<any>(`/stats/distribution?${sp.toString()}`);
                   },
  heatmap:         (q: Record<string,string|number|undefined>) => {
                     const sp = new URLSearchParams();
                     Object.entries(q).forEach(([k,v]) => v != null && sp.set(k, String(v)));
                     return req<any[]>(`/stats/heatmap?${sp.toString()}`);
                   },
  momentum:        (county: string, deal_kind = "sale") =>
                     req<any[]>(`/stats/momentum?county=${county}&deal_kind=${deal_kind}`),

  searchTx:        (q: Record<string,string|number|boolean|undefined>) => {
                     const sp = new URLSearchParams();
                     Object.entries(q).forEach(([k,v]) => v != null && sp.set(k, String(v)));
                     return req<any>(`/transactions?${sp.toString()}`);
                   },
  countTx:         (q: Record<string,string|number|boolean|undefined>) => {
                     const sp = new URLSearchParams();
                     Object.entries(q).forEach(([k,v]) => v != null && sp.set(k, String(v)));
                     return req<{total:number}>(`/transactions/count?${sp.toString()}`);
                   },
  txDetail:        (id: number) => req<any>(`/transactions/${id}`),
  txNeighbors:     (id: number, months = 36) =>
                     req<any>(`/transactions/${id}/neighbors?months=${months}`),
  txYield:         (id: number) => req<any>(`/transactions/${id}/yield-estimate`),
  underpriced:     (q: Record<string, any>) => {
                     const sp = new URLSearchParams();
                     Object.entries(q).forEach(([k,v]) => v != null && sp.set(k, String(v)));
                     return req<any[]>(`/stats/underpriced?${sp.toString()}`);
                   },

  bbox:            (b: {minLng:number;minLat:number;maxLng:number;maxLat:number;
                       deal_kind?:string;months?:number;limit?:number}) => {
                     const sp = new URLSearchParams();
                     Object.entries(b).forEach(([k,v]) => v != null && sp.set(k, String(v)));
                     return req<any>(`/geo/points?${sp.toString()}`);
                   },
  districtSummary: (q: {county:string; deal_kind?:string; months?:number}) => {
                     const sp = new URLSearchParams();
                     Object.entries(q).forEach(([k,v]) => v != null && sp.set(k, String(v)));
                     return req<any[]>(`/geo/district-summary?${sp.toString()}`);
                   },
  nearby:          (q: any) => {
                     const sp = new URLSearchParams();
                     Object.entries(q).forEach(([k,v]) => v != null && sp.set(k, String(v)));
                     return req<any[]>(`/geo/nearby?${sp.toString()}`);
                   },

  similar:         (q: Record<string, any>) => {
                     const sp = new URLSearchParams();
                     Object.entries(q).forEach(([k,v]) => v != null && sp.set(k, String(v)));
                     return req<any>(`/compare/similar?${sp.toString()}`);
                   },
  compareRegions:  (regions: {county:string;district:string}[], deal_kind = "sale") =>
                     req<any[]>("/compare/regions", { method: "POST",
                       body: JSON.stringify({regions, deal_kind})}),

  mortgage:        (body: any) => req<any>("/calc/mortgage", { method: "POST", body: JSON.stringify(body)}),
  affordability:   (body: any) => req<any>("/calc/affordability", { method: "POST", body: JSON.stringify(body)}),
  stress:          (body: any) => req<any>("/calc/stress-test", { method: "POST", body: JSON.stringify(body)}),
  rentVsBuy:       (body: any) => req<any>("/calc/rent-vs-buy", { method: "POST", body: JSON.stringify(body)}),
};
