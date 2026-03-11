/* ============================================================
   VENUECORE - Accounting Module
   Full double-entry accounting, financial statements, budgets
   ============================================================ */
const AccountingModule = {
  tab: 'overview',

  async render(container) {
    container.innerHTML = `
      <div class="animate-fade">
        <div class="module-tabs" id="acct-tabs">
          <button class="tab-btn active" data-tab="overview">Overview</button>
          <button class="tab-btn" data-tab="chart">Chart of Accounts</button>
          <button class="tab-btn" data-tab="journal">Journal Entries</button>
          <button class="tab-btn" data-tab="income">Income Statement</button>
          <button class="tab-btn" data-tab="balance">Balance Sheet</button>
          <button class="tab-btn" data-tab="budgets">Budgets</button>
        </div>
        <div id="acct-content"></div>
      </div>`;

    container.querySelector('#acct-tabs').addEventListener('click', e => {
      if (e.target.classList.contains('tab-btn')) {
        container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.tab = e.target.dataset.tab;
        this.loadTab(container.querySelector('#acct-content'));
      }
    });
    this.loadTab(container.querySelector('#acct-content'));
  },

  async loadTab(el) {
    UI.loading(el);
    try {
      switch (this.tab) {
        case 'overview': return await this.renderOverview(el);
        case 'chart': return await this.renderChart(el);
        case 'journal': return await this.renderJournal(el);
        case 'income': return await this.renderIncome(el);
        case 'balance': return await this.renderBalance(el);
        case 'budgets': return await this.renderBudgets(el);
      }
    } catch (err) { el.innerHTML = `<div class="empty-state"><p>${Utils.escapeHtml(err.message)}</p></div>`; }
  },

  async renderOverview(el) {
    const [tb, income, bs] = await Promise.all([
      API.trialBalance().catch(() => ({ accounts: [], in_balance: true })),
      API.incomeStatement().catch(() => ({ revenue: { total: 0 }, total_expenses: 0, operating_profit: 0, net_margin: 0, prime_cost_percent: 0 })),
      API.balanceSheet().catch(() => ({ assets: { total: 0 }, liabilities: { total: 0 }, equity: { total: 0 }, in_balance: true })),
    ]);

    el.innerHTML = `
      <div class="grid grid-4 gap-md mb-md">
        ${UI.statCard('Revenue', Utils.currency(income.revenue?.total || 0), '$')}
        ${UI.statCard('Expenses', Utils.currency(income.total_expenses || 0), '\u2212')}
        ${UI.statCard('Net Profit', Utils.currency(income.operating_profit || 0), '\u2197')}
        ${UI.statCard('Net Margin', (income.net_margin || 0) + '%', '%')}
      </div>
      <div class="grid grid-3 gap-md mb-md">
        ${UI.statCard('Total Assets', Utils.currency(bs.assets?.total || 0), 'A')}
        ${UI.statCard('Total Liabilities', Utils.currency(bs.liabilities?.total || 0), 'L')}
        ${UI.statCard('Total Equity', Utils.currency(bs.equity?.total || 0), 'E')}
      </div>
      <div class="grid grid-2 gap-md">
        <div class="card">
          <div class="card-header flex items-center justify-between">
            <h3>Trial Balance</h3>
            <span class="badge badge-${tb.in_balance ? 'success' : 'danger'}">${tb.in_balance ? 'Balanced' : 'OUT OF BALANCE'}</span>
          </div>
          <div class="card-body">
            <div class="flex justify-between mb-sm" style="padding:6px;font-weight:700;border-bottom:2px solid var(--border-color)">
              <span>Debits: ${Utils.currency(tb.total_debits || 0)}</span>
              <span>Credits: ${Utils.currency(tb.total_credits || 0)}</span>
            </div>
            <p class="text-muted text-sm" style="padding:12px;text-align:center">${tb.accounts?.length || 0} accounts with activity</p>
          </div>
        </div>
        <div class="card">
          <div class="card-header flex items-center justify-between">
            <h3>Quick Actions</h3>
          </div>
          <div class="card-body">
            <div class="grid grid-2 gap-sm">
              <button class="btn btn-primary" onclick="AccountingModule.tab='journal';AccountingModule.loadTab(document.getElementById('acct-content'))">New Journal Entry</button>
              <button class="btn btn-secondary" onclick="API.autoJournalDailySales().then(r=>UI.toast('Auto Journal',r.message||'Done','success')).catch(e=>UI.toast('Error',e.message,'danger'))">Auto-Journal Today's Sales</button>
              <button class="btn btn-secondary" onclick="AccountingModule.tab='income';document.querySelector('[data-tab=income]').click()">Income Statement</button>
              <button class="btn btn-secondary" onclick="AccountingModule.tab='balance';document.querySelector('[data-tab=balance]').click()">Balance Sheet</button>
            </div>
          </div>
        </div>
      </div>
      <div class="card mt-md">
        <div class="card-header"><h3>Prime Cost Analysis</h3></div>
        <div class="card-body">
          <div class="flex items-center gap-md" style="padding:8px">
            <div style="flex:1"><strong>Prime Cost %</strong> (COGS + Labor / Revenue)</div>
            <div class="font-bold" style="font-size:24px;color:${(income.prime_cost_percent || 0) > 65 ? 'var(--danger)' : 'var(--success)'}">${income.prime_cost_percent || 0}%</div>
          </div>
          <div class="progress-bar" style="height:12px;border-radius:6px">
            <div class="progress-fill" style="width:${Math.min(income.prime_cost_percent || 0, 100)}%;background:${(income.prime_cost_percent || 0) > 65 ? 'var(--danger)' : (income.prime_cost_percent || 0) > 55 ? 'var(--warning)' : 'var(--success)'};border-radius:6px"></div>
          </div>
          <p class="text-muted text-sm mt-sm">Target: &lt;60% for restaurants, &lt;55% for bars</p>
        </div>
      </div>`;
  },

  async renderChart(el) {
    const accounts = await API.chartOfAccounts();
    const groups = {};
    for (const a of accounts) {
      if (!groups[a.account_type]) groups[a.account_type] = [];
      groups[a.account_type].push(a);
    }

    const typeOrder = ['asset', 'liability', 'equity', 'revenue', 'expense'];
    const typeColors = { asset: '#27ae60', liability: '#e74c3c', equity: '#3498db', revenue: '#2ecc71', expense: '#e67e22' };

    el.innerHTML = `
      <div class="flex items-center justify-between mb-md">
        <h3>${accounts.length} Accounts</h3>
        <button class="btn btn-primary btn-sm" onclick="AccountingModule.showAddAccount()">+ Add Account</button>
      </div>
      ${typeOrder.map(type => {
        const accts = groups[type] || [];
        if (accts.length === 0) return '';
        return `
          <div class="card mb-md">
            <div class="card-header" style="border-left:4px solid ${typeColors[type]}">
              <h3 style="text-transform:capitalize">${type}s (${accts.length})</h3>
            </div>
            <div class="card-body" style="padding:0">
              ${UI.table(
                [{ label: '#', key: 'account_number' }, { label: 'Name', key: 'name' }, { label: 'Sub-Type', key: 'sub_type' }, { label: 'Normal', key: 'normal_balance' }, { label: 'Status', key: 'active', render: v => `<span class="badge badge-${v ? 'success' : 'secondary'}">${v ? 'Active' : 'Inactive'}</span>` }],
                accts, { emptyMessage: 'No accounts' }
              )}
            </div>
          </div>`;
      }).join('')}`;
  },

  async showAddAccount() {
    const html = `
      <div class="grid grid-2 gap-sm">
        <div class="form-group"><label class="form-label">Account Number</label><input class="form-input" id="acct-num" placeholder="e.g. 1050"></div>
        <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="acct-name" placeholder="Account name"></div>
        <div class="form-group"><label class="form-label">Type</label><select class="form-input" id="acct-type"><option value="asset">Asset</option><option value="liability">Liability</option><option value="equity">Equity</option><option value="revenue">Revenue</option><option value="expense">Expense</option></select></div>
        <div class="form-group"><label class="form-label">Sub-Type</label><input class="form-input" id="acct-sub" placeholder="e.g. current, fixed, cogs"></div>
        <div class="form-group"><label class="form-label">Normal Balance</label><select class="form-input" id="acct-bal"><option value="debit">Debit</option><option value="credit">Credit</option></select></div>
        <div class="form-group"><label class="form-label">Description</label><input class="form-input" id="acct-desc" placeholder="Optional"></div>
      </div>`;
    const modal = await UI.modal('New Account', html, { confirmText: 'Create Account', size: 'lg' });
    if (!modal) return;
    try {
      await API.createAccount({
        account_number: modal.querySelector('#acct-num').value,
        name: modal.querySelector('#acct-name').value,
        account_type: modal.querySelector('#acct-type').value,
        sub_type: modal.querySelector('#acct-sub').value,
        normal_balance: modal.querySelector('#acct-bal').value,
        description: modal.querySelector('#acct-desc').value,
      });
      UI.toast('Success', 'Account created', 'success');
      this.loadTab(document.getElementById('acct-content'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async renderJournal(el) {
    const entries = await API.journalEntries({ limit: 50 });
    el.innerHTML = `
      <div class="flex items-center justify-between mb-md">
        <h3>${entries.length} Journal Entries</h3>
        <button class="btn btn-primary btn-sm" onclick="AccountingModule.showNewJournalEntry()">+ New Entry</button>
      </div>
      <div class="card">
        <div class="card-body" style="padding:0">
          ${entries.length === 0 ? '<p class="text-muted text-sm" style="padding:20px;text-align:center">No journal entries yet</p>' :
            UI.table(
              [
                { label: 'Entry #', key: 'entry_number' },
                { label: 'Date', key: 'entry_date' },
                { label: 'Description', key: 'description' },
                { label: 'Source', key: 'source' },
                { label: 'Lines', key: row => row.lines?.length || 0, render: v => v },
                { label: 'Status', key: 'status', render: v => `<span class="badge badge-${v === 'posted' ? 'success' : v === 'draft' ? 'warning' : 'secondary'}">${v}</span>` },
                { label: 'Actions', key: row => row, render: (v) => {
                  if (v.status === 'draft') return `<button class="btn btn-sm btn-success" onclick="AccountingModule.postEntry(${v.id})">Post</button>`;
                  if (v.status === 'posted' && !v.reversed) return `<button class="btn btn-sm btn-secondary" onclick="AccountingModule.reverseEntry(${v.id})">Reverse</button>`;
                  return v.reversed ? '<span class="text-muted text-sm">Reversed</span>' : '';
                }}
              ], entries, { emptyMessage: 'No entries' }
            )}
        </div>
      </div>`;
  },

  async showNewJournalEntry() {
    const accounts = await API.chartOfAccounts({ active: 'true' });
    const options = accounts.map(a => `<option value="${a.id}">${a.account_number} - ${Utils.escapeHtml(a.name)}</option>`).join('');
    const html = `
      <div class="form-group"><label class="form-label">Date</label><input class="form-input" type="date" id="je-date" value="${new Date().toISOString().slice(0, 10)}"></div>
      <div class="form-group"><label class="form-label">Description</label><input class="form-input" id="je-desc" placeholder="Entry description"></div>
      <div id="je-lines">
        <div class="flex items-center gap-sm mb-sm">
          <select class="form-input" style="flex:2">${options}</select>
          <input class="form-input" style="flex:1" placeholder="Debit" type="number" step="0.01">
          <input class="form-input" style="flex:1" placeholder="Credit" type="number" step="0.01">
        </div>
        <div class="flex items-center gap-sm mb-sm">
          <select class="form-input" style="flex:2">${options}</select>
          <input class="form-input" style="flex:1" placeholder="Debit" type="number" step="0.01">
          <input class="form-input" style="flex:1" placeholder="Credit" type="number" step="0.01">
        </div>
      </div>
      <button class="btn btn-sm btn-secondary mt-sm" onclick="document.getElementById('je-lines').insertAdjacentHTML('beforeend','<div class=\\'flex items-center gap-sm mb-sm\\'><select class=\\'form-input\\' style=\\'flex:2\\'>${options.replace(/'/g, "\\'")}</select><input class=\\'form-input\\' style=\\'flex:1\\' placeholder=\\'Debit\\' type=\\'number\\' step=\\'0.01\\'><input class=\\'form-input\\' style=\\'flex:1\\' placeholder=\\'Credit\\' type=\\'number\\' step=\\'0.01\\'></div>')">+ Add Line</button>`;

    const modal = await UI.modal('New Journal Entry', html, { confirmText: 'Create Entry', size: 'lg' });
    if (!modal) return;

    const lineEls = modal.querySelectorAll('#je-lines > div');
    const lines = [];
    lineEls.forEach(row => {
      const acctId = row.querySelector('select').value;
      const debit = parseFloat(row.querySelectorAll('input')[0].value) || 0;
      const credit = parseFloat(row.querySelectorAll('input')[1].value) || 0;
      if (debit > 0 || credit > 0) lines.push({ account_id: parseInt(acctId), debit, credit });
    });

    try {
      await API.createJournalEntry({ entry_date: modal.querySelector('#je-date').value, description: modal.querySelector('#je-desc').value, lines });
      UI.toast('Success', 'Journal entry created', 'success');
      this.loadTab(document.getElementById('acct-content'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async postEntry(id) {
    try { await API.postJournalEntry(id); UI.toast('Posted', 'Entry posted to GL', 'success'); this.loadTab(document.getElementById('acct-content')); }
    catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async reverseEntry(id) {
    if (!await UI.confirm('Reverse Entry', 'Create a reversing journal entry?')) return;
    try { await API.reverseJournalEntry(id); UI.toast('Reversed', 'Reversing entry created', 'success'); this.loadTab(document.getElementById('acct-content')); }
    catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async renderIncome(el) {
    const data = await API.incomeStatement();
    const renderSection = (title, accounts, total, color) => `
      <div class="mb-md">
        <div class="font-bold text-sm" style="text-transform:uppercase;letter-spacing:1px;color:${color};margin-bottom:6px">${title}</div>
        ${(accounts || []).map(a => `<div class="flex justify-between" style="padding:4px 8px"><span>${a.account_number} ${Utils.escapeHtml(a.name)}</span><span>${Utils.currency(a.balance)}</span></div>`).join('')}
        <div class="flex justify-between font-bold" style="padding:6px 8px;border-top:1px solid var(--border-color);margin-top:4px"><span>Total ${title}</span><span>${Utils.currency(total)}</span></div>
      </div>`;

    el.innerHTML = `
      <div class="card">
        <div class="card-header"><h3>Income Statement (P&L)</h3><span class="text-muted text-sm">${data.period?.start} to ${data.period?.end}</span></div>
        <div class="card-body">
          ${renderSection('Revenue', data.revenue?.accounts, data.revenue?.total, '#27ae60')}
          ${renderSection('Cost of Goods Sold', data.cost_of_goods?.accounts, data.cost_of_goods?.total, '#e74c3c')}
          <div class="flex justify-between font-bold" style="padding:10px 8px;background:var(--bg-secondary);border-radius:6px;margin-bottom:16px"><span>Gross Profit (${data.gross_margin}%)</span><span>${Utils.currency(data.gross_profit)}</span></div>
          ${renderSection('Labor', data.labor?.accounts, data.labor?.total, '#e67e22')}
          ${renderSection('Operating Expenses', data.operating_expenses?.accounts, data.operating_expenses?.total, '#9b59b6')}
          <div class="flex justify-between font-bold" style="padding:12px 8px;background:${data.operating_profit >= 0 ? '#27ae60' : '#e74c3c'};color:#fff;border-radius:6px;font-size:16px"><span>Net Profit (${data.net_margin}%)</span><span>${Utils.currency(data.operating_profit)}</span></div>
        </div>
      </div>`;
  },

  async renderBalance(el) {
    const data = await API.balanceSheet();
    const renderSection = (title, accounts, total, color) => `
      <div class="card mb-md">
        <div class="card-header" style="border-left:4px solid ${color}"><h3>${title}: ${Utils.currency(total)}</h3></div>
        <div class="card-body" style="padding:0">
          ${(accounts || []).map(a => `<div class="flex justify-between" style="padding:8px 16px;border-bottom:1px solid var(--border-color)"><span>${a.account_number} ${Utils.escapeHtml(a.name)}</span><span class="font-bold">${Utils.currency(a.balance)}</span></div>`).join('')}
          ${accounts?.length === 0 ? '<p class="text-muted text-sm" style="padding:16px;text-align:center">No activity</p>' : ''}
        </div>
      </div>`;

    el.innerHTML = `
      <div class="flex items-center justify-between mb-md">
        <h3>Balance Sheet</h3>
        <span class="badge badge-${data.in_balance ? 'success' : 'danger'}">${data.in_balance ? 'Balanced' : 'OUT OF BALANCE'}</span>
      </div>
      ${renderSection('Assets', data.assets?.accounts, data.assets?.total, '#27ae60')}
      ${renderSection('Liabilities', data.liabilities?.accounts, data.liabilities?.total, '#e74c3c')}
      ${renderSection('Equity', data.equity?.accounts, data.equity?.total, '#3498db')}
      <div class="card"><div class="card-body flex justify-between font-bold" style="font-size:16px"><span>Assets = Liabilities + Equity</span><span>${Utils.currency(data.assets?.total || 0)} = ${Utils.currency((data.liabilities?.total || 0) + (data.equity?.total || 0))}</span></div></div>`;
  },

  async renderBudgets(el) {
    const [budgets, bva] = await Promise.all([API.budgets().catch(() => []), API.budgetVsActual().catch(() => ({ accounts: [] }))]);
    el.innerHTML = `
      <div class="flex items-center justify-between mb-md">
        <h3>Budget vs Actual</h3>
        <button class="btn btn-primary btn-sm" onclick="AccountingModule.showAddBudget()">+ Set Budget</button>
      </div>
      <div class="card">
        <div class="card-body" style="padding:0">
          ${bva.accounts?.length === 0 ? '<p class="text-muted text-sm" style="padding:20px;text-align:center">No budgets set yet. Click "+ Set Budget" to start.</p>' :
            UI.table([
              { label: 'Account', key: row => `${row.account_number} ${row.name}`, render: v => v },
              { label: 'Budget', key: 'budget', render: v => Utils.currency(v), align: 'right' },
              { label: 'Actual', key: 'actual', render: v => Utils.currency(v), align: 'right' },
              { label: 'Variance', key: 'variance', render: (v, row) => `<span style="color:${v > 0 ? (row.account_type === 'revenue' ? 'var(--success)' : 'var(--danger)') : (row.account_type === 'revenue' ? 'var(--danger)' : 'var(--success)')}">${Utils.currency(v)} (${row.variance_percent}%)</span>`, align: 'right' },
            ], bva.accounts)}
        </div>
      </div>`;
  },

  async showAddBudget() {
    const accounts = await API.chartOfAccounts({ active: 'true' });
    const options = accounts.map(a => `<option value="${a.id}">${a.account_number} - ${Utils.escapeHtml(a.name)}</option>`).join('');
    const html = `
      <div class="form-group"><label class="form-label">Account</label><select class="form-input" id="bud-acct">${options}</select></div>
      <div class="form-group"><label class="form-label">Budget Amount</label><input class="form-input" type="number" step="0.01" id="bud-amount" placeholder="Monthly budget"></div>
      <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="bud-name" placeholder="e.g. March Food Cost"></div>`;
    const modal = await UI.modal('Set Budget', html, { confirmText: 'Save Budget' });
    if (!modal) return;
    try {
      await API.createBudget({ account_id: parseInt(modal.querySelector('#bud-acct').value), amount: parseFloat(modal.querySelector('#bud-amount').value), name: modal.querySelector('#bud-name').value });
      UI.toast('Success', 'Budget set', 'success'); this.loadTab(document.getElementById('acct-content'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  destroy() {},
};
