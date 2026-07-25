// Talking to the valley.

async function request(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.error || `${res.status} ${res.statusText}`);
  return data;
}

export const api = {
  state: () => request('/api/state'),
  product: (id) => request(`/api/products/${id}`),
  rebuild: (id) => request(`/api/products/${id}/rebuild`, { method: 'POST' }),
  saveMockups: (id, images) =>
    request(`/api/products/${id}/mockups`, { method: 'POST', body: { images } }),
  decideIdeas: (ids, decision, note = '') =>
    request('/api/ideas/decide', { method: 'POST', body: { ids, decision, note } }),
  requestIdeas: (count, theme) =>
    request('/api/ideas/request', { method: 'POST', body: { count, theme } }),
  answer: (id, value) => request(`/api/approvals/${id}/answer`, { method: 'POST', body: { value } }),
  teach: (agent, text) => request('/api/teach', { method: 'POST', body: { agent, text } }),
  forget: (id) => request(`/api/lessons/${id}/forget`, { method: 'POST' }),
  tick: () => request('/api/tick', { method: 'POST' }),
  loop: (on) => request('/api/loop', { method: 'POST', body: { on } }),
  recordSale: (body) => request('/api/sales', { method: 'POST', body }),
  setListingUrl: (id, url) => request(`/api/listings/${id}/url`, { method: 'POST', body: { url } }),
};

/** Live updates. Falls back to polling if the stream dies. */
export function subscribe({ onActivity, onState }) {
  let source;
  const connect = () => {
    source = new EventSource('/api/events');
    source.addEventListener('activity', (e) => onActivity(JSON.parse(e.data)));
    source.addEventListener('state', (e) => onState(JSON.parse(e.data)));
    source.onerror = () => {
      source.close();
      setTimeout(connect, 4000);
    };
  };
  connect();
  return () => source?.close();
}

export default api;
