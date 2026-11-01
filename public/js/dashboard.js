const naira = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 2 });
const $ = sel => document.querySelector(sel);

const state = { month: thisMonth(), categories: { income: [], expense: [] }, editingId: null, bar: null, pie: null };

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

async function api(url, options = {}) {
  const res = await fetch(url, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...options });
  if (res.status === 401) { location.href = '/login'; throw new Error('Please log in'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
  return data;
}

// ---------- Form helpers ----------
function fillCategorySelect(select, list) {
  select.replaceChildren(...list.map(c => new Option(c, c)));
}
function currentType() {
  return document.querySelector('input[name="type"]:checked').value;
}
function syncFormCategories(selected) {
  const select = $('#txForm').category;
  fillCategorySelect(select, state.categories[currentType()]);
  if (selected) select.value = selected;
}
function resetForm() {
  state.editingId = null;
  $('#txForm').reset();
  $('#txForm').date.value = today();
  syncFormCategories();
  $('#formTitle').textContent = 'Add a transaction';
  $('#saveBtn').textContent = 'Add transaction';
  $('#cancelEdit').hidden = true;
  showFormError('');
}
function showFormError(msg) {
  const el = $('#formError');
  el.textContent = msg;
  el.hidden = !msg;
}

// ---------- Rendering ----------
function renderSummary(s) {
  $('#balance').textContent = naira.format(s.balance);
  $('#income').textContent = naira.format(s.income);
  $('#expense').textContent = naira.format(s.expense);
  renderBar(s.series);
  renderPie(s.byCategory);
  renderBudgets(s.budgets);
}

function renderBar(series) {
  const data = {
    labels: series.map(p => monthLabel(p.month)),
    datasets: [
      { label: 'Income', data: series.map(p => p.income), backgroundColor: '#17744f', borderRadius: 4 },
      { label: 'Spending', data: series.map(p => p.expense), backgroundColor: '#c4432b', borderRadius: 4 },
    ],
  };
  if (state.bar) { state.bar.data = data; state.bar.update(); return; }
  state.bar = new Chart($('#barChart'), {
    type: 'bar', data,
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${naira.format(c.parsed.y)}` } } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => '₦' + Number(v).toLocaleString('en-NG') } } },
    },
  });
}

const PALETTE = ['#12261f', '#17744f', '#f0b429', '#c4432b', '#4f8a8b', '#8a5a44', '#6b7fd7', '#9bb5a6', '#d98e73', '#555b6e'];

function renderPie(rows) {
  $('#pieEmpty').hidden = rows.length > 0;
  $('#pieChart').hidden = rows.length === 0;
  const data = {
    labels: rows.map(r => r.category),
    datasets: [{ data: rows.map(r => r.total), backgroundColor: rows.map((_, i) => PALETTE[i % PALETTE.length]), borderWidth: 2 }],
  };
  if (state.pie) { state.pie.data = data; state.pie.update(); return; }
  state.pie = new Chart($('#pieChart'), {
    type: 'doughnut', data,
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '58%',
      plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => `${c.label}: ${naira.format(c.parsed)}` } } },
    },
  });
}

function renderBudgets(budgets) {
  const list = $('#budgetList');
  list.replaceChildren();
  $('#budgetEmpty').hidden = budgets.length > 0;

  for (const b of budgets) {
    const pct = Math.min(100, Math.round((b.spent / b.limit) * 100));
    const level = b.spent > b.limit ? 'over' : b.spent >= b.limit * 0.8 ? 'warn' : '';

    const li = document.createElement('li');
    const top = document.createElement('div');
    top.className = 'top';
    const name = document.createElement('span'); name.textContent = b.category;
    const amt = document.createElement('span'); amt.textContent = `${naira.format(b.spent)} of ${naira.format(b.limit)}`;
    top.append(name, amt);

    const bar = document.createElement('div');
    bar.className = 'bar ' + level;
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuenow', pct);
    bar.setAttribute('aria-valuemin', 0);
    bar.setAttribute('aria-valuemax', 100);
    bar.setAttribute('aria-label', `${b.category} budget used`);
    const fill = document.createElement('span'); fill.style.width = pct + '%';
    bar.append(fill);

    li.append(top, bar);
    if (level) {
      const msg = document.createElement('div');
      msg.className = 'budget-msg ' + level;
      msg.textContent = level === 'over'
        ? `Over budget by ${naira.format(b.spent - b.limit)}.`
        : `You have used ${pct}% of this budget.`;
      li.append(msg);
    }
    list.append(li);
  }
}

function renderTransactions(rows) {
  const body = $('#txBody');
  body.replaceChildren();
  $('#txEmpty').hidden = rows.length > 0;

  for (const t of rows) {
    const tr = document.createElement('tr');
    const cell = (text, cls) => { const td = document.createElement('td'); td.textContent = text; if (cls) td.className = cls; return td; };

    tr.append(cell(t.date), cell(t.category), cell(t.note || ''));
    tr.append(cell((t.type === 'expense' ? '-' : '+') + naira.format(t.amount), 'num ' + (t.type === 'expense' ? 'neg' : 'pos')));

    const actions = document.createElement('td');
    actions.className = 'actions';
    const edit = document.createElement('button');
    edit.className = 'btn ghost small'; edit.type = 'button'; edit.textContent = 'Edit';
    edit.addEventListener('click', () => startEdit(t));
    const del = document.createElement('button');
    del.className = 'btn ghost small danger'; del.type = 'button'; del.textContent = 'Delete';
    del.addEventListener('click', () => removeTransaction(t));
    actions.append(edit, ' ', del);
    tr.append(actions);
    body.append(tr);
  }
}

// ---------- Data loading ----------
async function loadTransactions() {
  const params = new URLSearchParams({ month: state.month, type: $('#filterType').value, q: $('#search').value });
  renderTransactions(await api('/api/transactions?' + params));
}
async function refresh() {
  const [summary] = await Promise.all([api('/api/summary?month=' + state.month), loadTransactions()]);
  renderSummary(summary);
}

// ---------- Actions ----------
function startEdit(t) {
  state.editingId = t.id;
  const form = $('#txForm');
  form.querySelector(`input[name="type"][value="${t.type}"]`).checked = true;
  syncFormCategories(t.category);
  form.amount.value = t.amount;
  form.date.value = t.date;
  form.note.value = t.note || '';
  $('#formTitle').textContent = 'Edit transaction';
  $('#saveBtn').textContent = 'Save changes';
  $('#cancelEdit').hidden = false;
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function removeTransaction(t) {
  if (!confirm(`Delete ${t.category} transaction of ${naira.format(t.amount)}?`)) return;
  try {
    await api('/api/transactions/' + t.id, { method: 'DELETE' });
    if (state.editingId === t.id) resetForm();
    await refresh();
  } catch (err) { alert(err.message); }
}

$('#txForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  const payload = { type: currentType(), category: f.category.value, amount: f.amount.value, date: f.date.value, note: f.note.value };
  try {
    if (state.editingId) await api('/api/transactions/' + state.editingId, { method: 'PUT', body: JSON.stringify(payload) });
    else await api('/api/transactions', { method: 'POST', body: JSON.stringify(payload) });

    const savedMonth = payload.date.slice(0, 7);
    if (savedMonth !== state.month) { state.month = savedMonth; $('#month').value = savedMonth; }
    resetForm();
    await refresh();
  } catch (err) { showFormError(err.message); }
});

$('#cancelEdit').addEventListener('click', resetForm);
document.querySelectorAll('input[name="type"]').forEach(r => r.addEventListener('change', () => syncFormCategories()));

$('#budgetForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  try {
    await api('/api/budgets', { method: 'PUT', body: JSON.stringify({ category: f.category.value, limit: f.limit.value }) });
    f.limit.value = '';
    await refresh();
  } catch (err) { alert(err.message); }
});

$('#month').addEventListener('change', e => { if (e.target.value) { state.month = e.target.value; refresh(); } });
$('#filterType').addEventListener('change', loadTransactions);
let searchTimer;
$('#search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(loadTransactions, 250); });

// ---------- Start ----------
(async function init() {
  try {
    state.categories = await api('/api/categories');
    fillCategorySelect($('#budgetForm').category, state.categories.expense);
    $('#month').value = state.month;
    resetForm();
    await refresh();
  } catch (err) { console.error(err); }
})();