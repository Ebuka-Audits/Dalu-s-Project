(function () {
  const state = { mode: 'crypto', sel: null, chart: null };

  function setMessage(text, isErr) { note('#mkMsg', text, isErr); }

  function showResults(list) {
    const box = $('#mkResults');
    box.replaceChildren();
    for (const c of list) {
      const b = el('button', 'btn ghost small', `${c.name} (${c.symbol})`);
      b.type = 'button';
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
      ['Latest', usd(last)],
      ['Change', (change >= 0 ? '+' : '') + change.toFixed(2) + '%', change >= 0 ? 'pos' : 'neg'],
      ['High', usd(Math.max(...prices))],
      ['Low', usd(Math.min(...prices))],
    ];
    const box = $('#mkStats');
    box.replaceChildren();
    for (const [label, value, cls] of items) {
      const d = el('div');
      d.append(el('span', 'label', label), el('strong', cls || null, value));
      box.append(d);
    }
  }

  function drawChart(rows) {
    const color = cssVar('--income');
    const data = {
      labels: rows.map(r => r.date),
      datasets: [{
        label: 'Price (USD)', data: rows.map(r => r.price),
        borderColor: color, backgroundColor: color + '22',
        fill: true, pointRadius: 0, borderWidth: 2, tension: 0.2,
      }],
    };
    if (state.chart) { state.chart.data = data; state.chart.update(); return; }
    state.chart = new Chart($('#mkChart'), {
      type: 'line', data,
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => usd(c.parsed.y) } } },
        scales: { x: { ticks: { maxTicksLimit: 6 } }, y: { ticks: { callback: v => usd(v) } } },
      },
    });
  }

  async function loadHistory() {
    if (!state.sel) return;
    setMessage('Loading chart…');
    $('#mkTitle').textContent = state.sel.label;
    const base = state.mode === 'crypto' ? '/api/market/crypto/' : '/api/market/stock/';
    try {
      const rows = await api(`${base}${encodeURIComponent(state.sel.id)}/history?days=${$('#mkRange').value}`);
      if (!rows.length) { setMessage('No price data for this range.'); return; }
      drawStats(rows);
      drawChart(rows);
      setMessage('');
    } catch (err) { setMessage(err.message, true); }
  }

  function showAsset(kind, id, label) {
    state.mode = kind;
    $('#mkMode').value = kind;
    $('#mkInput').placeholder = kind === 'crypto' ? 'Search a coin, e.g. bitcoin' : 'Ticker, e.g. AAPL';
    $('#mkResults').replaceChildren();
    state.sel = { id, label };
    loadHistory();
    $('#mkForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  $('#mkMode').addEventListener('change', e => {
    state.mode = e.target.value;
    state.sel = null;
    $('#mkInput').value = '';
    $('#mkInput').placeholder = state.mode === 'crypto' ? 'Search a coin, e.g. bitcoin' : 'Ticker, e.g. AAPL';
    $('#mkResults').replaceChildren();
    setMessage('');
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
    setMessage('Searching…');
    try {
      const list = await api('/api/market/crypto/search?q=' + encodeURIComponent(q));
      showResults(list);
      setMessage(list.length ? 'Pick a coin:' : 'No coins found. Try another name.');
    } catch (err) { setMessage(err.message, true); }
  });

  // ---------- Watchlist ----------
  async function loadWatchlist() {
    const items = await api('/api/watchlist');
    const body = $('#watchBody');
    body.replaceChildren();
    $('#watchEmpty').hidden = items.length > 0;
    for (const w of items) {
      const tr = el('tr');
      const nameCell = el('td');
      const link = el('button', 'linklike', w.label);
      link.type = 'button';
      link.title = 'Show chart';
      link.addEventListener('click', () => showAsset(w.kind, w.asset_id, w.label));
      nameCell.append(link);
      const act = el('td', 'actions');
      const rm = el('button', 'btn ghost small danger', 'Remove');
      rm.type = 'button';
      rm.addEventListener('click', async () => {
        try { await api('/api/watchlist/' + w.id, 'DELETE'); await loadWatchlist(); } catch (err) { alert(err.message); }
      });
      act.append(rm);
      tr.append(nameCell, el('td', 'num', w.price == null ? 'n/a' : usd(w.price)), act);
      body.append(tr);
    }
  }

  $('#watchAdd').addEventListener('click', async () => {
    if (!state.sel) return note('#watchMsg', 'Show a chart first, then add it.', true);
    try {
      await api('/api/watchlist', 'POST', { kind: state.mode, id: state.sel.id, label: state.sel.label });
      note('#watchMsg', '');
      await loadWatchlist();
    } catch (err) { note('#watchMsg', err.message, true); }
  });

  // Bitcoin by default
  state.sel = { id: 'btc-bitcoin', label: 'Bitcoin (BTC)' };
  loadHistory();
  loadWatchlist().catch(console.error);
})();