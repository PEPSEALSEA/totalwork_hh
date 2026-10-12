export const API = "https://totalwork-hh.sealseapep.workers.dev";
const KEY = "hh_session_token";
export const getToken = () => sessionStorage.getItem(KEY);
export const setToken = (token: string) => sessionStorage.setItem(KEY, token);
export const clearToken = () => sessionStorage.removeItem(KEY);
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  if (!token) throw new Error("กรุณาเข้าสู่ระบบ");
  const response = await fetch(`${API}${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...options.headers } });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) clearToken();
    let detail = "";
    try { detail = (await response.json() as { error?: string }).error || ""; } catch { /* no body */ }
    throw new Error(detail || `API error ${response.status}`);
  }
  return response.json() as Promise<T>;
}
