(function () {
  const state = { editingId: null };

  // ---------- Tabs ----------
  const tabs = { market: ['#tabMarketBtn', '#tabMarket'], physical: ['#tabPhysicalBtn', '#tabPhysical'] };
  function showTab(name) {
    for (const [key, [btn, panel]] of Object.entries(tabs)) {
      const on = key === name;
      $(btn).setAttribute('aria-selected', String(on));
      $(panel).hidden = !on;
    }
    history.replaceState(null, '', name === 'physical' ? '#physical' : location.pathname);
  }
  $('#tabMarketBtn').addEventListener('click', () => showTab('market'));
  $('#tabPhysicalBtn').addEventListener('click', () => showTab('physical'));
  if (location.hash === '#physical') showTab('physical');

  // ---------- Form ----------
  function resetForm() {
    state.editingId = null;
    $('#asForm').reset();
    $('#asDate').value = today();
    $('#asTitle').textContent = 'Add a physical asset';
    $('#asSave').textContent = 'Add asset';
    $('#asCancel').hidden = true;
    note('#asMsg', '');
  }

  function startEdit(a) {
    state.editingId = a.id;
    $('#asCategory').value = a.category;
    $('#asName').value = a.name;
    $('#asCost').value = a.purchase_value;
    $('#asValue').value = a.current_value;
    $('#asDate').value = a.acquired_date;
    $('#asNote').value = a.note || '';
    $('#asTitle').textContent = 'Edit asset';
    $('#asSave').textContent = 'Save changes';
    $('#asCancel').hidden = false;
    $('#asForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function gainText(gain, cost) {
    const sign = gain >= 0 ? '+' : '-';
    const pct = cost > 0 ? ` (${((gain / cost) * 100).toFixed(1)}%)` : '';
    return `${sign}${naira.format(Math.abs(gain))}${pct}`;
  }

  // ---------- List ----------
  async function load() {
    const data = await api('/api/assets');
    const cat = $('#asCategory');
    if (!cat.options.length) cat.replaceChildren(...data.categories.map(c => new Option(c, c)));

    const body = $('#asBody');
    body.replaceChildren();
    $('#asEmpty').hidden = data.assets.length > 0;
    let cost = 0, value = 0;

    for (const a of data.assets) {
      const gain = a.current_value - a.purchase_value;
      cost += a.purchase_value;
      value += a.current_value;

      const tr = el('tr');
      const nameCell = el('td', null, a.name);
      if (a.note) nameCell.title = a.note;
      tr.append(
        nameCell, el('td', null, a.category), el('td', null, a.acquired_date),
        el('td', 'num', naira.format(a.purchase_value)),
        el('td', 'num', naira.format(a.current_value)),
        el('td', 'num ' + (gain >= 0 ? 'pos' : 'neg'), gainText(gain, a.purchase_value))
      );

      const act = el('td', 'actions');
      const edit = el('button', 'btn ghost small', 'Edit');
      const del = el('button', 'btn ghost small danger', 'Remove');
      edit.type = del.type = 'button';
      edit.addEventListener('click', () => startEdit(a));
      del.addEventListener('click', async () => {
        if (!confirm(`Remove "${a.name}" from your assets?`)) return;
        try {
          await api('/api/assets/' + a.id, 'DELETE');
          if (state.editingId === a.id) resetForm();
          await load();
        } catch (err) { alert(err.message); }
      });
      act.append(edit, ' ', del);
      tr.append(act);
      body.append(tr);
    }

    const gain = value - cost;
    const sum = $('#asSummary');
    sum.replaceChildren();
    const items = [
      ['Total cost', naira.format(cost)],
      ['Current value', naira.format(value)],
      ['Gain or loss', `${gain >= 0 ? '+' : '-'}${naira.format(Math.abs(gain))}`, gain >= 0 ? 'pos' : 'neg'],
      ['Return', cost > 0 ? `${gain >= 0 ? '+' : ''}${((gain / cost) * 100).toFixed(1)}%` : 'n/a', cost > 0 ? (gain >= 0 ? 'pos' : 'neg') : null],
    ];
    for (const [label, val, cls] of items) {
      const d = el('div');
      d.append(el('span', 'label', label), el('strong', cls || null, val));
      sum.append(d);
    }
  }

  $('#asForm').addEventListener('submit', async e => {
    e.preventDefault();
    const payload = {
      category: $('#asCategory').value, name: $('#asName').value,
      purchase_value: $('#asCost').value, current_value: $('#asValue').value,
      acquired_date: $('#asDate').value, note: $('#asNote').value,
    };
    try {
      if (state.editingId) await api('/api/assets/' + state.editingId, 'PUT', payload);
      else await api('/api/assets', 'POST', payload);
      resetForm();
      await load();
    } catch (err) { note('#asMsg', err.message, true); }
  });

  $('#asCancel').addEventListener('click', resetForm);

  $('#asDate').value = today();
  load().catch(console.error);
})();