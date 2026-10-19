// Network and cache helpers.

export async function getJSON(url, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || 15000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(res.status + ' ' + url);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// localStorage, wrapped so a full or blocked store never breaks the app.
export const cache = {
  get(key) {
    try { return JSON.parse(localStorage.getItem('tvhome:' + key)); } catch (e) { return null; }
  },
  set(key, value) {
    try { localStorage.setItem('tvhome:' + key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  }
};
