(function () {
  const state = { month: thisMonth(), bar: null, pie: null };
  const PALETTE = ['#17744f', '#f0b429', '#c4432b', '#4f8a8b', '#6b7fd7', '#d98e73', '#9bb5a6', '#8a5a44', '#b48ead', '#7a869a'];

  function renderBar(series) {
    const data = {
      labels: series.map(p => monthLabel(p.month)),
      datasets: [
        { label: 'Income', data: series.map(p => p.income), backgroundColor: cssVar('--income'), borderRadius: 4 },
        { label: 'Spending', data: series.map(p => p.expense), backgroundColor: cssVar('--expense'), borderRadius: 4 },
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

  function renderRecent(rows) {
    const body = $('#recentBody');
    body.replaceChildren();
    $('#recentEmpty').hidden = rows.length > 0;
    for (const t of rows.slice(0, 5)) {
      const tr = el('tr');
      tr.append(
        el('td', null, t.date), el('td', null, t.category), el('td', null, t.note || ''),
        el('td', 'num ' + (t.type === 'expense' ? 'neg' : 'pos'), (t.type === 'expense' ? '-' : '+') + naira.format(t.amount))
      );
      body.append(tr);
    }
  }

  async function refresh() {
    const [s, rows] = await Promise.all([
      api('/api/summary?month=' + state.month),
      api('/api/transactions?month=' + state.month),
    ]);
    $('#balance').textContent = naira.format(s.balance);
    $('#income').textContent = naira.format(s.income);
    $('#expense').textContent = naira.format(s.expense);
    renderBar(s.series);
    renderPie(s.byCategory);
    renderRecent(rows);
  }

    async function loadNetWorth() {
    const n = await api('/api/networth');
    const parts = [
      ['Cash balance', n.cash, cssVar('--income')],
      ['Physical assets', n.assets, cssVar('--gold')],
      ['Market investments', n.investments, '#6b7fd7'],
    ];

    const stats = $('#nwStats');
    stats.replaceChildren();
    for (const [label, v, color] of parts) {
      const d = el('div');
      d.style.borderLeft = `4px solid ${color}`;
      d.style.paddingLeft = '.6rem';
      d.append(el('span', 'label', label), el('strong', null, v == null ? 'Rate needed' : naira.format(v)));
      stats.append(d);
    }
    const total = el('div');
    total.append(el('span', 'label', 'Net worth'), el('strong', n.total >= 0 ? 'pos' : 'neg', naira.format(n.total)));
    stats.append(total);

    const bar = $('#nwBar');
    bar.replaceChildren();
    const positive = parts.filter(p => p[1] > 0);
    const sum = positive.reduce((s, p) => s + p[1], 0);
    for (const [label, v, color] of positive) {
      const seg = el('span');
      seg.style.width = (v / sum * 100) + '%';
      seg.style.background = color;
      seg.title = `${label}: ${Math.round(v / sum * 100)}%`;
      bar.append(seg);
    }
    bar.hidden = sum <= 0;

    const notes = [];
    if (n.needsRate) notes.push('Your market investments are in US dollars. Set a naira rate in Settings to include them.');
    if (n.unpriced > 0) notes.push(`${n.unpriced} holding${n.unpriced > 1 ? 's have' : ' has'} no price right now and ${n.unpriced > 1 ? 'are' : 'is'} left out.`);
    if (n.rate && n.holdings > 0) notes.push(`Investments converted at ₦${n.rate.toLocaleString('en-NG')} per US$1.`);
    if (n.monthlyIncome > 0) notes.push(`Your assets earn ${naira.format(n.monthlyIncome)} a month.`);
    note('#nwMsg', notes.join(' '));
  }

  $('#month').addEventListener('change', e => {
    if (e.target.value) { state.month = e.target.value; refresh().catch(console.error); }
  });
  $('#pdfLink').addEventListener('click', () => {
    $('#pdfLink').href = '/api/report.pdf?month=' + encodeURIComponent(state.month);
  });

  $('#month').value = state.month;
  refresh().catch(console.error);
  loadNetWorth().catch(console.error);
})();