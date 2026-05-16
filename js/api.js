import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

// =============================================
// API HELPERS
// =============================================
export const api = (path, opts = {}) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
  headers: {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': opts.prefer || 'return=representation',
    ...opts.headers
  },
  ...opts
}).then(r => {
  if (!r.ok) return r.json().then(e => Promise.reject(e));
  if (r.status === 204) return null;
  return r.json();
});

export const get  = (table, query = '') => api(`${table}?${query}`);
export const post = (table, body)       => api(table, { method: 'POST', body: JSON.stringify(body) });
export const patch = (table, query, body) => api(`${table}?${query}`, { method: 'PATCH', body: JSON.stringify(body) });
export const del  = (table, query)      => api(`${table}?${query}`, { method: 'DELETE', prefer: 'return=minimal' });
