const CACHE = 'kk-planner-cache';
const PIN = 'kk-planner-pin';

const safe = (fn, fallback = null) => {
  try { return fn(); } catch { return fallback; }
};

export async function loadData() {
  try {
    const r = await fetch('/api/data', { cache: 'no-store' });
    if (!r.ok) throw new Error('bad status');
    const data = await r.json();
    return { data, remote: true };
  } catch {
    const cached = safe(() => JSON.parse(localStorage.getItem(CACHE)));
    return { data: cached, remote: false };
  }
}

// Returns { ok, savedAt } | { conflict, current } | { offline }
export async function saveData(state, retried = false) {
  safe(() => localStorage.setItem(CACHE, JSON.stringify(state)));
  try {
    const r = await fetch('/api/data', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-edit-pin': safe(() => localStorage.getItem(PIN), '') || '',
      },
      body: JSON.stringify({ data: state, baseSavedAt: state.savedAt }),
    });
    if (r.status === 401 && !retried) {
      const pin = window.prompt('Enter the edit PIN to save changes:');
      if (pin) {
        safe(() => localStorage.setItem(PIN, pin));
        return saveData(state, true);
      }
    }
    if (r.status === 409) return { conflict: true, current: await r.json() };
    if (!r.ok) throw new Error('bad status');
    const { savedAt } = await r.json();
    return { ok: true, savedAt };
  } catch {
    return { offline: true };
  }
}
