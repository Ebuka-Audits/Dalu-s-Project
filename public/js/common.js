const $ = s => document.querySelector(s);
const naira = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 2 });
const usd = p => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: Math.abs(p) < 1 ? 6 : 2,
}).format(p);
const qty = q => Number(q).toLocaleString('en-US', { maximumFractionDigits: 8 });
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function today() {
  const d = new Date();
  return `${thisMonth()}-${String(d.getDate()).padStart(2, '0')}`;
}
function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-NG', { month: 'short' });
}
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function note(sel, text, isErr) {
  const n = $(sel);
  if (!n) return;
  n.textContent = text;
  n.hidden = !text;
  n.className = isErr ? 'alert' : 'empty';
}
async function api(url, method = 'GET', body) {
  const res = await fetch(url, {
    method, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { location.href = '/login'; throw new Error('Please log in'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
  return data;
}

if (window.Chart) {
  Chart.defaults.color = cssVar('--text-2');
  Chart.defaults.borderColor = cssVar('--line');
  Chart.defaults.font.family = '"Bricolage Grotesque", "Segoe UI", system-ui, sans-serif';
  Chart.defaults.elements.arc.borderColor = cssVar('--surface');
}