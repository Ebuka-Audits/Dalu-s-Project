(function () {
  const $ = s => document.querySelector(s);
  const state = { mode: 'crypto', sel: null, chart: null };

  const fmt = p => new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: p < 1 ? 6 : 2,
  }).format(p);

  function message(text, isError) {
    const el = $('#mkMsg');
    el.textContent = text;
    el.className = isError ? 'alert' : 'empty';
    el.hidden = !text;
  }

  async function get(url) {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (res.status === 401) { location.href = '/login'; throw new Error('Please log in'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
    return data;
  }

  function showResults(list) {
    const box = $('#mkResults');
    box.replaceChildren();
    for (const c of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn ghost small';
      b.textContent = `${c.name} (${c.symbol})`;
      b.addEventListener('click', () => {
        state.sel = { id: c.id, label: `${c.name} (${c.symbol})` };
        box.replaceChildren();
        loadHistory();
      });
      box.append(b);
    }
  }

  function drawStats(rows) {
    const prices = rows.map(r => r.price);
    const first = prices[0], last = prices[prices.length - 1];
    const change = ((last - first) / first) * 100;
    const items = [
      ['Latest', fmt(last)],
      ['Change', (change >= 0 ? '+' : '') + change.toFixed(2) + '%', change >= 0 ? 'pos' : 'neg'],
      ['High', fmt(Math.max(...prices))],
      ['Low', fmt(Math.min(...prices))],
    ];
    const box = $('#mkStats');
    box.replaceChildren();
    for (const [label, value, cls] of items) {
      const d = document.createElement('div');
      const l = document.createElement('span'); l.className = 'label'; l.textContent = label;
      const v = document.createElement('strong'); v.textContent = value; if (cls) v.className = cls;
      d.append(l, v);
      box.append(d);
    }
  }

  function drawChart(rows) {
    const data = {
      labels: rows.map(r => r.date),
      datasets: [{
        label: 'Price (USD)', data: rows.map(r => r.price),
        borderColor: '#17744f', backgroundColor: 'rgba(23,116,79,.12)',
        fill: true, pointRadius: 0, borderWidth: 2, tension: 0.2,
      }],
    };
    if (state.chart) { state.chart.data = data; state.chart.update(); return; }
    state.chart = new Chart($('#mkChart'), {
      type: 'line', data,
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmt(c.parsed.y) } } },
        scales: { x: { ticks: { maxTicksLimit: 6 } }, y: { ticks: { callback: v => fmt(v) } } },
      },
    });
  }

  async function loadHistory() {
    if (!state.sel) return;
    message('Loading chart…');
    $('#mkTitle').textContent = state.sel.label;
    const days = $('#mkRange').value;
    const base = state.mode === 'crypto' ? '/api/market/crypto/' : '/api/market/stock/';
    try {
      const rows = await get(`${base}${encodeURIComponent(state.sel.id)}/history?days=${days}`);
      if (!rows.length) { message('No price data for this range.'); return; }
      drawStats(rows);
      drawChart(rows);
      message('');
    } catch (err) { message(err.message, true); }
  }

  $('#mkMode').addEventListener('change', e => {
    state.mode = e.target.value;
    state.sel = null;
    $('#mkInput').value = '';
    $('#mkInput').placeholder = state.mode === 'crypto' ? 'Search a coin, e.g. bitcoin' : 'Ticker, e.g. AAPL';
    $('#mkResults').replaceChildren();
    message('');
  });

  $('#mkRange').addEventListener('change', loadHistory);

  $('#mkForm').addEventListener('submit', async e => {
    e.preventDefault();
    const q = $('#mkInput').value.trim();
    if (!q) return;
    if (state.mode === 'stock') {
      state.sel = { id: q.toUpperCase(), label: q.toUpperCase() };
      return loadHistory();
    }
    message('Searching…');
    try {
      const list = await get('/api/market/crypto/search?q=' + encodeURIComponent(q));
      showResults(list);
      message(list.length ? 'Pick a coin:' : 'No coins found. Try another name.');
    } catch (err) { message(err.message, true); }
  });

  window.marketApi = {
    current: () => state.sel ? { kind: state.mode, id: state.sel.id, label: state.sel.label } : null,
    show(kind, id, label) {
      state.mode = kind;
      $('#mkMode').value = kind;
      $('#mkInput').placeholder = kind === 'crypto' ? 'Search a coin, e.g. bitcoin' : 'Ticker, e.g. AAPL';
      $('#mkResults').replaceChildren();
      state.sel = { id, label };
      loadHistory();
      $('#mkForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
  };


  // show Bitcoin by default
  state.sel = { id: 'btc-bitcoin', label: 'Bitcoin (BTC)' };
  loadHistory();
})();