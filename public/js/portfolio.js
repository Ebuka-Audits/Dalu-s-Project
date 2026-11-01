(function () {
  const sel = { kind: 'crypto', id: null, label: '' };

  function setSelected(kind, id, label) {
    sel.kind = kind; sel.id = id; sel.label = label;
    $('#pfAsset').value = label;
  }

  $('#pfKind').addEventListener('change', e => {
    sel.id = null;
    $('#pfAsset').value = '';
    $('#pfResults').replaceChildren();
    $('#pfQuery').value = '';
    $('#pfQuery').placeholder = e.target.value === 'crypto' ? 'Coin name, e.g. bitcoin' : 'Ticker, e.g. AAPL';
    sel.kind = e.target.value;
  });

  $('#pfFindForm').addEventListener('submit', async e => {
    e.preventDefault();
    const q = $('#pfQuery').value.trim();
    const kind = $('#pfKind').value;
    if (kind === 'stock') {
      setSelected('stock', q.toUpperCase(), q.toUpperCase());
      return note('#pfMsg', '');
    }
    try {
      const list = await api('/api/market/crypto/search?q=' + encodeURIComponent(q));
      const box = $('#pfResults');
      box.replaceChildren();
      if (!list.length) return note('#pfMsg', 'No coins found. Try another name.', true);
      note('#pfMsg', '');
      for (const c of list) {
        const b = el('button', 'btn ghost small', `${c.name} (${c.symbol})`);
        b.type = 'button';
        b.addEventListener('click', () => { setSelected('crypto', c.id, `${c.name} (${c.symbol})`); box.replaceChildren(); });
        box.append(b);
      }
    } catch (err) { note('#pfMsg', err.message, true); }
  });

  async function load() {
    const rows = await api('/api/portfolio');
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
        try { await api('/api/portfolio/' + h.id, 'DELETE'); await load(); } catch (err) { alert(err.message); }
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
    if (!sel.id) return note('#pfMsg', 'Find and select an asset first.', true);
    try {
      await api('/api/portfolio', 'POST', {
        kind: sel.kind, id: sel.id, label: sel.label,
        quantity: $('#pfQty').value, buy_price: $('#pfPrice').value, buy_date: $('#pfDate').value,
      });
      $('#pfQty').value = ''; $('#pfPrice').value = '';
      note('#pfMsg', '');
      await load();
    } catch (err) { note('#pfMsg', err.message, true); }
  });

  $('#pfDate').value = today();
  load().catch(console.error);
})();