(function () {
  const $ = s => document.querySelector(s);
  const naira = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' });
  const usd = p => new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: Math.abs(p) < 1 ? 6 : 2,
  }).format(p);
  const qty = q => Number(q).toLocaleString('en-US', { maximumFractionDigits: 8 });

  async function call(url, method = 'GET', body) {
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

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function note(sel, text, isErr) {
    const n = $(sel);
    n.textContent = text;
    n.hidden = !text;
    n.className = isErr ? 'alert' : 'empty';
  }

  // ---------- Savings goals ----------
  function monthsLeft(deadline) {
    const days = (new Date(deadline + 'T00:00:00') - new Date()) / 86400000;
    return days <= 0 ? 0 : Math.max(1, Math.ceil(days / 30.44));
  }

  async function contribute(id, amount) {
    try {
      await call(`/api/goals/${id}/contribute`, 'POST', { amount });
      await loadGoals();
    } catch (err) { alert(err.message); }
  }

  async function loadGoals() {
    const goals = await call('/api/goals');
    const list = $('#goalList');
    list.replaceChildren();
    $('#goalEmpty').hidden = goals.length > 0;

    for (const g of goals) {
      const pct = Math.min(100, Math.round((g.saved / g.target) * 100));
      const li = el('li');

      const top = el('div', 'top');
      top.append(el('strong', null, g.name), el('span', null, `${naira.format(g.saved)} of ${naira.format(g.target)}`));

      const bar = el('div', 'bar');
      const fill = el('span');
      fill.style.width = pct + '%';
      bar.append(fill);

      let status = pct >= 100 ? 'Goal reached.' : `${pct}% saved. ${naira.format(g.target - g.saved)} to go.`;
      if (g.deadline && pct < 100) {
        const m = monthsLeft(g.deadline);
        status += m === 0
          ? ' The deadline has passed.'
          : ` Save about ${naira.format((g.target - g.saved) / m)} a month to finish by ${g.deadline}.`;
      }
      const msg = el('div', 'budget-msg', status);

      const actions = el('div', 'row wrap-row');
      const input = el('input');
      input.type = 'number'; input.min = '0.01'; input.step = '0.01';
      input.placeholder = 'Amount (₦)'; input.setAttribute('aria-label', 'Amount for ' + g.name);
      const add = el('button', 'btn primary small', 'Add');
      const take = el('button', 'btn ghost small', 'Withdraw');
      const del = el('button', 'btn ghost small danger', 'Delete');
      add.type = take.type = del.type = 'button';
      const amt = () => Number(input.value);
      add.addEventListener('click', () => { if (amt() > 0) contribute(g.id, amt()); });
      take.addEventListener('click', () => { if (amt() > 0) contribute(g.id, -amt()); });
      del.addEventListener('click', async () => {
        if (!confirm(`Delete the goal "${g.name}"?`)) return;
        try { await call('/api/goals/' + g.id, 'DELETE'); await loadGoals(); } catch (err) { alert(err.message); }
      });
      actions.append(input, add, take, del);

      li.append(top, bar, msg, actions);
      list.append(li);
    }
  }

  $('#goalForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await call('/api/goals', 'POST', {
        name: $('#goalName').value, target: $('#goalTarget').value, deadline: $('#goalDeadline').value,
      });
      e.target.reset();
      note('#goalMsg', '');
      await loadGoals();
    } catch (err) { note('#goalMsg', err.message, true); }
  });

  // ---------- Watchlist ----------
  async function loadWatchlist() {
    const items = await call('/api/watchlist');
    const body = $('#watchBody');
    body.replaceChildren();
    $('#watchEmpty').hidden = items.length > 0;

    for (const w of items) {
      const tr = el('tr');
      const nameCell = el('td');
      const link = el('button', 'linklike', w.label);
      link.type = 'button';
      link.title = 'Show chart';
      link.addEventListener('click', () => window.marketApi && window.marketApi.show(w.kind, w.asset_id, w.label));
      nameCell.append(link);

      const price = el('td', 'num', w.price == null ? 'n/a' : usd(w.price));
      const act = el('td', 'actions');
      const rm = el('button', 'btn ghost small danger', 'Remove');
      rm.type = 'button';
      rm.addEventListener('click', async () => {
        try { await call('/api/watchlist/' + w.id, 'DELETE'); await loadWatchlist(); } catch (err) { alert(err.message); }
      });
      act.append(rm);
      tr.append(nameCell, price, act);
      body.append(tr);
    }
  }

  $('#watchAdd').addEventListener('click', async () => {
    const cur = window.marketApi && window.marketApi.current();
    if (!cur) return note('#watchMsg', 'Choose an asset in Market charts first.', true);
    try {
      await call('/api/watchlist', 'POST', cur);
      note('#watchMsg', '');
      await loadWatchlist();
    } catch (err) { note('#watchMsg', err.message, true); }
  });

  // ---------- Portfolio ----------
  function syncAsset() {
    const cur = window.marketApi && window.marketApi.current();
    $('#pfAsset').value = cur ? cur.label : '';
  }
  $('#pfForm').addEventListener('focusin', syncAsset);

  async function loadPortfolio() {
    const rows = await call('/api/portfolio');
    const body = $('#pfBody');
    body.replaceChildren();
    $('#pfEmpty').hidden = rows.length > 0;
    let cost = 0, value = 0;

    for (const h of rows) {
      const tr = el('tr');
      tr.append(el('td', null, h.label), el('td', 'num', qty(h.quantity)), el('td', 'num', usd(h.buy_price)));

      if (h.price == null) {
        tr.append(el('td', 'num', 'n/a'), el('td', 'num', 'n/a'), el('td', 'num', 'n/a'));
      } else {
        const v = h.quantity * h.price;
        const c = h.quantity * h.buy_price;
        const gain = v - c;
        cost += c; value += v;
        const pct = c ? (gain / c) * 100 : 0;
        tr.append(
          el('td', 'num', usd(h.price)),
          el('td', 'num', usd(v)),
          el('td', 'num ' + (gain >= 0 ? 'pos' : 'neg'),
            `${gain >= 0 ? '+' : '-'}${usd(Math.abs(gain))} (${pct.toFixed(1)}%)`)
        );
      }

      const act = el('td', 'actions');
      const rm = el('button', 'btn ghost small danger', 'Remove');
      rm.type = 'button';
      rm.addEventListener('click', async () => {
        if (!confirm(`Remove ${h.label} from your portfolio?`)) return;
        try { await call('/api/portfolio/' + h.id, 'DELETE'); await loadPortfolio(); } catch (err) { alert(err.message); }
      });
      act.append(rm);
      tr.append(act);
      body.append(tr);
    }

    const gain = value - cost;
    const pct = cost ? (gain / cost) * 100 : 0;
    const sum = $('#pfSummary');
    sum.replaceChildren();
    const items = [
      ['Invested', usd(cost)],
      ['Current value', usd(value)],
      ['Gain or loss', `${gain >= 0 ? '+' : '-'}${usd(Math.abs(gain))}`, gain >= 0 ? 'pos' : 'neg'],
      ['Return', `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`, pct >= 0 ? 'pos' : 'neg'],
    ];
    for (const [label, val, cls] of items) {
      const d = el('div');
      d.append(el('span', 'label', label), el('strong', cls || null, val));
      sum.append(d);
    }
  }

  $('#pfForm').addEventListener('submit', async e => {
    e.preventDefault();
    const cur = window.marketApi && window.marketApi.current();
    if (!cur) return note('#pfMsg', 'Choose an asset in Market charts first.', true);
    try {
      await call('/api/portfolio', 'POST', {
        kind: cur.kind, id: cur.id, label: cur.label,
        quantity: $('#pfQty').value, buy_price: $('#pfPrice').value, buy_date: $('#pfDate').value,
      });
      $('#pfQty').value = ''; $('#pfPrice').value = '';
      note('#pfMsg', '');
      await loadPortfolio();
    } catch (err) { note('#pfMsg', err.message, true); }
  });

  // ---------- PDF link follows the selected month ----------
  $('#pdfLink').addEventListener('click', () => {
    const month = $('#month') && $('#month').value;
    $('#pdfLink').href = '/api/report.pdf' + (month ? '?month=' + encodeURIComponent(month) : '');
  });

  // ---------- Start ----------
  const d = new Date();
  $('#pfDate').value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  syncAsset();
  loadGoals().catch(console.error);
  loadWatchlist().catch(console.error);
  loadPortfolio().catch(console.error);
})();