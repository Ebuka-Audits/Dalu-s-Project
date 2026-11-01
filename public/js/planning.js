(function () {
  // ---------- Budgets ----------
  async function loadBudgets() {
    const s = await api('/api/summary?month=' + thisMonth());
    const list = $('#budgetList');
    list.replaceChildren();
    $('#budgetEmpty').hidden = s.budgets.length > 0;

    for (const b of s.budgets) {
      const pct = Math.min(100, Math.round((b.spent / b.limit) * 100));
      const level = b.spent > b.limit ? 'over' : b.spent >= b.limit * 0.8 ? 'warn' : '';
      const li = el('li');
      const top = el('div', 'top');
      top.append(el('span', null, b.category), el('span', null, `${naira.format(b.spent)} of ${naira.format(b.limit)}`));
      const bar = el('div', 'bar ' + level);
      bar.setAttribute('role', 'progressbar');
      bar.setAttribute('aria-valuenow', pct);
      bar.setAttribute('aria-valuemin', 0);
      bar.setAttribute('aria-valuemax', 100);
      bar.setAttribute('aria-label', `${b.category} budget used`);
      const fill = el('span');
      fill.style.width = pct + '%';
      bar.append(fill);
      li.append(top, bar);
      if (level) {
        li.append(el('div', 'budget-msg ' + level, level === 'over'
          ? `Over budget by ${naira.format(b.spent - b.limit)}.`
          : `You have used ${pct}% of this budget.`));
      }
      list.append(li);
    }
  }

  $('#budgetForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await api('/api/budgets', 'PUT', { category: $('#budgetCategory').value, limit: $('#budgetLimit').value });
      $('#budgetLimit').value = '';
      await loadBudgets();
    } catch (err) { alert(err.message); }
  });

  // ---------- Savings goals ----------
  function monthsLeft(deadline) {
    const days = (new Date(deadline + 'T00:00:00') - new Date()) / 86400000;
    return days <= 0 ? 0 : Math.max(1, Math.ceil(days / 30.44));
  }

  async function contribute(id, amount) {
    try {
      await api(`/api/goals/${id}/contribute`, 'POST', { amount });
      await loadGoals();
    } catch (err) { alert(err.message); }
  }

  async function loadGoals() {
    const goals = await api('/api/goals');
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

      const actions = el('div', 'row wrap-row');
      const input = el('input');
      input.type = 'number'; input.min = '0.01'; input.step = '0.01';
      input.placeholder = 'Amount (₦)';
      input.setAttribute('aria-label', 'Amount for ' + g.name);
      const add = el('button', 'btn primary small', 'Add');
      const take = el('button', 'btn ghost small', 'Withdraw');
      const del = el('button', 'btn ghost small danger', 'Delete');
      add.type = take.type = del.type = 'button';
      const amt = () => Number(input.value);
      add.addEventListener('click', () => { if (amt() > 0) contribute(g.id, amt()); });
      take.addEventListener('click', () => { if (amt() > 0) contribute(g.id, -amt()); });
      del.addEventListener('click', async () => {
        if (!confirm(`Delete the goal "${g.name}"?`)) return;
        try { await api('/api/goals/' + g.id, 'DELETE'); await loadGoals(); } catch (err) { alert(err.message); }
      });
      actions.append(input, add, take, del);

      li.append(top, bar, el('div', 'budget-msg', status), actions);
      list.append(li);
    }
  }

  $('#goalForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await api('/api/goals', 'POST', {
        name: $('#goalName').value, target: $('#goalTarget').value, deadline: $('#goalDeadline').value,
      });
      e.target.reset();
      note('#goalMsg', '');
      await loadGoals();
    } catch (err) { note('#goalMsg', err.message, true); }
  });

  (async function init() {
    try {
      const cats = await api('/api/categories');
      $('#budgetCategory').replaceChildren(...cats.expense.map(c => new Option(c, c)));
      await Promise.all([loadBudgets(), loadGoals()]);
    } catch (err) { console.error(err); }
  })();
})();