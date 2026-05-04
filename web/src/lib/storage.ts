/** 簡單的 localStorage helper，支援 JSON 結構與預設值。 */

export function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function lsSet<T>(key: string, value: T): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

/** 儲存的搜尋（使用者命名 + 篩選條件 snapshot）。 */
export type SavedSearch = {
  id: string;
  name: string;
  createdAt: number;
  query: Record<string, any>;
  page: "browse" | "region";
};

const KEY = "havehouse:savedSearches:v1";

export function listSearches(): SavedSearch[] {
  return lsGet<SavedSearch[]>(KEY, []);
}
export function saveSearch(item: Omit<SavedSearch, "id" | "createdAt">): SavedSearch {
  const all = listSearches();
  const s: SavedSearch = { ...item, id: crypto.randomUUID(), createdAt: Date.now() };
  all.unshift(s);
  lsSet(KEY, all.slice(0, 30));   // 最多保留 30 個
  return s;
}
export function removeSearch(id: string): void {
  lsSet(KEY, listSearches().filter((s) => s.id !== id));
}

/** Theme (dark / light) */
const THEME_KEY = "havehouse:theme";
export function getTheme(): "dark" | "light" {
  return lsGet<"dark" | "light">(THEME_KEY, "dark");
}
export function setTheme(t: "dark" | "light"): void {
  lsSet(THEME_KEY, t);
  document.documentElement.dataset.theme = t;
}
