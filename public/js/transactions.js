(function () {
  const state = { month: thisMonth(), categories: { income: [], expense: [] }, editingId: null };
  const typeOf = () => document.querySelector('input[name="type"]:checked').value;

  function syncCategories(selected) {
    const sel = $('#txCategory');
    sel.replaceChildren(...state.categories[typeOf()].map(c => new Option(c, c)));
    if (selected) sel.value = selected;
  }

  function resetForm() {
    state.editingId = null;
    $('#txForm').reset();
    $('#txDate').value = today();
    syncCategories();
    $('#formTitle').textContent = 'Add a transaction';
    $('#saveBtn').textContent = 'Add transaction';
    $('#cancelEdit').hidden = true;
    note('#formError', '');
  }

  function startEdit(t) {
    state.editingId = t.id;
    document.querySelector(`input[name="type"][value="${t.type}"]`).checked = true;
    syncCategories(t.category);
    $('#txAmount').value = t.amount;
    $('#txDate').value = t.date;
    $('#txNote').value = t.note || '';
    $('#formTitle').textContent = 'Edit transaction';
    $('#saveBtn').textContent = 'Save changes';
    $('#cancelEdit').hidden = false;
    $('#txForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function render(rows) {
    const body = $('#txBody');
    body.replaceChildren();
    $('#txEmpty').hidden = rows.length > 0;
    for (const t of rows) {
      const tr = el('tr');
      tr.append(
        el('td', null, t.date), el('td', null, t.category), el('td', null, t.note || ''),
        el('td', 'num ' + (t.type === 'expense' ? 'neg' : 'pos'), (t.type === 'expense' ? '-' : '+') + naira.format(t.amount))
      );
      const act = el('td', 'actions');
      const edit = el('button', 'btn ghost small', 'Edit');
      const del = el('button', 'btn ghost small danger', 'Delete');
      edit.type = del.type = 'button';
      edit.addEventListener('click', () => startEdit(t));
      del.addEventListener('click', async () => {
        if (!confirm(`Delete ${t.category} transaction of ${naira.format(t.amount)}?`)) return;
        try {
          await api('/api/transactions/' + t.id, 'DELETE');
          if (state.editingId === t.id) resetForm();
          await load();
        } catch (err) { alert(err.message); }
      });
      act.append(edit, ' ', del);
      tr.append(act);
      body.append(tr);
    }
  }

  async function load() {
    const params = new URLSearchParams({ month: state.month, type: $('#filterType').value, q: $('#search').value });
    render(await api('/api/transactions?' + params));
  }

  $('#txForm').addEventListener('submit', async e => {
    e.preventDefault();
    const payload = {
      type: typeOf(), category: $('#txCategory').value, amount: $('#txAmount').value,
      date: $('#txDate').value, note: $('#txNote').value,
    };
    try {
      if (state.editingId) await api('/api/transactions/' + state.editingId, 'PUT', payload);
      else await api('/api/transactions', 'POST', payload);
      const saved = payload.date.slice(0, 7);
      if (saved !== state.month) { state.month = saved; $('#month').value = saved; }
      resetForm();
      await load();
    } catch (err) { note('#formError', err.message, true); }
  });

  $('#cancelEdit').addEventListener('click', resetForm);
  document.querySelectorAll('input[name="type"]').forEach(r => r.addEventListener('change', () => syncCategories()));
  $('#month').addEventListener('change', e => { if (e.target.value) { state.month = e.target.value; load(); } });
  $('#filterType').addEventListener('change', load);
  let timer;
  $('#search').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); });

  (async function init() {
    try {
      state.categories = await api('/api/categories');
      $('#month').value = state.month;
      resetForm();
      await load();
    } catch (err) { console.error(err); }
  })();
})();