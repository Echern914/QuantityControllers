/* ============================================================
   VENUECORE - Banking & Reconciliation Module
   ============================================================ */
const BankingModule = {
  tab: 'dashboard',

  async render(container) {
    container.innerHTML = `
      <div class="animate-fade">
        <div class="module-tabs" id="bank-tabs">
          <button class="tab-btn active" data-tab="dashboard">Dashboard</button>
          <button class="tab-btn" data-tab="accounts">Accounts</button>
          <button class="tab-btn" data-tab="reconcile">Reconcile</button>
        </div>
        <div id="bank-content"></div>
      </div>`;
    container.querySelector('#bank-tabs').addEventListener('click', e => {
      if (e.target.classList.contains('tab-btn')) {
        container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.tab = e.target.dataset.tab;
        this.loadTab(container.querySelector('#bank-content'));
      }
    });
    this.loadTab(container.querySelector('#bank-content'));
  },

  async loadTab(el) {
    UI.loading(el);
    try {
      switch (this.tab) {
        case 'dashboard': return await this.renderDashboard(el);
        case 'accounts': return await this.renderAccounts(el);
        case 'reconcile': return await this.renderReconcile(el);
      }
    } catch (err) { el.innerHTML = `<div class="empty-state"><p>${Utils.escapeHtml(err.message)}</p></div>`; }
  },

  async renderDashboard(el) {
    const d = await API.bankingDashboard();
    el.innerHTML = `
      <div class="grid grid-3 gap-md mb-md">
        ${UI.statCard('Total Balance', Utils.currency(d.total_balance || 0), '$')}
        ${UI.statCard('Unreconciled', d.unreconciled_transactions || 0, '\u2260')}
        ${UI.statCard('Unmatched', d.unmatched_transactions || 0, '?')}
      </div>
      <div class="card">
        <div class="card-header flex items-center justify-between">
          <h3>Bank Accounts</h3>
          <button class="btn btn-primary btn-sm" onclick="BankingModule.showAddAccount()">+ Add Account</button>
        </div>
        <div class="card-body" style="padding:0">
          ${(d.accounts || []).length === 0 ? '<p class="text-muted text-sm" style="padding:20px;text-align:center">No bank accounts set up yet</p>' :
            UI.table([
              { label: 'Account', key: 'name' },
              { label: 'Bank', key: 'bank_name' },
              { label: 'Type', key: 'account_type' },
              { label: 'Balance', key: 'current_balance', render: v => `<span class="font-bold">${Utils.currency(v)}</span>`, align: 'right' },
              { label: 'Last Reconciled', key: 'last_reconciled_date', render: v => v || 'Never' },
            ], d.accounts)}
        </div>
      </div>`;
  },

  async showAddAccount() {
    const html = `
      <div class="grid grid-2 gap-sm">
        <div class="form-group"><label class="form-label">Account Name</label><input class="form-input" id="ba-name" placeholder="e.g. Main Checking"></div>
        <div class="form-group"><label class="form-label">Bank Name</label><input class="form-input" id="ba-bank" placeholder="e.g. Chase"></div>
        <div class="form-group"><label class="form-label">Last 4 Digits</label><input class="form-input" id="ba-last4" maxlength="4" placeholder="1234"></div>
        <div class="form-group"><label class="form-label">Type</label><select class="form-input" id="ba-type"><option value="checking">Checking</option><option value="savings">Savings</option><option value="credit_card">Credit Card</option></select></div>
        <div class="form-group"><label class="form-label">Current Balance</label><input class="form-input" type="number" step="0.01" id="ba-bal" value="0"></div>
      </div>`;
    const modal = await UI.modal('Add Bank Account', html, { confirmText: 'Add Account' });
    if (!modal) return;
    try {
      await API.createBankAccount({ name: modal.querySelector('#ba-name').value, bank_name: modal.querySelector('#ba-bank').value, account_number_last4: modal.querySelector('#ba-last4').value, account_type: modal.querySelector('#ba-type').value, current_balance: parseFloat(modal.querySelector('#ba-bal').value) || 0 });
      UI.toast('Success', 'Bank account added', 'success');
      this.loadTab(document.getElementById('bank-content'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async renderAccounts(el) {
    const accounts = await API.bankAccounts();
    if (accounts.length === 0) { el.innerHTML = '<div class="empty-state"><h3>No bank accounts</h3><p>Add a bank account from the Dashboard tab.</p></div>'; return; }

    const account = accounts[0];
    const transactions = await API.bankTransactions(account.id).catch(() => []);

    el.innerHTML = `
      <div class="flex items-center justify-between mb-md">
        <div>
          <h3>${Utils.escapeHtml(account.name)}</h3>
          <span class="text-muted text-sm">${Utils.escapeHtml(account.bank_name || '')} - Balance: ${Utils.currency(account.current_balance)}</span>
        </div>
        <button class="btn btn-primary btn-sm" onclick="BankingModule.showAddTransaction(${account.id})">+ Add Transaction</button>
      </div>
      <div class="card"><div class="card-body" style="padding:0;max-height:500px;overflow-y:auto">
        ${transactions.length === 0 ? '<p class="text-muted text-sm" style="padding:20px;text-align:center">No transactions</p>' :
          UI.table([
            { label: 'Date', key: 'transaction_date' },
            { label: 'Description', key: 'description' },
            { label: 'Reference', key: 'reference' },
            { label: 'Amount', key: 'amount', render: v => `<span style="color:${v >= 0 ? 'var(--success)' : 'var(--danger)'};font-weight:700">${v >= 0 ? '+' : ''}${Utils.currency(v)}</span>`, align: 'right' },
            { label: 'Matched', key: 'matched', render: v => v ? '<span class="badge badge-success">Yes</span>' : '<span class="badge badge-secondary">No</span>' },
            { label: 'Reconciled', key: 'reconciled', render: v => v ? '<span class="badge badge-success">Yes</span>' : '<span class="badge badge-secondary">No</span>' },
          ], transactions)}
      </div></div>`;
  },

  async showAddTransaction(accountId) {
    const html = `
      <div class="grid grid-2 gap-sm">
        <div class="form-group"><label class="form-label">Date</label><input class="form-input" type="date" id="bt-date" value="${new Date().toISOString().slice(0, 10)}"></div>
        <div class="form-group"><label class="form-label">Amount (negative for debits)</label><input class="form-input" type="number" step="0.01" id="bt-amount"></div>
        <div class="form-group"><label class="form-label">Description</label><input class="form-input" id="bt-desc"></div>
        <div class="form-group"><label class="form-label">Reference</label><input class="form-input" id="bt-ref" placeholder="Check #, etc"></div>
      </div>`;
    const modal = await UI.modal('Add Transaction', html, { confirmText: 'Add' });
    if (!modal) return;
    try {
      await API.addBankTransaction(accountId, { transaction_date: modal.querySelector('#bt-date').value, amount: parseFloat(modal.querySelector('#bt-amount').value), description: modal.querySelector('#bt-desc').value, reference: modal.querySelector('#bt-ref').value });
      UI.toast('Success', 'Transaction added', 'success');
      this.loadTab(document.getElementById('bank-content'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async renderReconcile(el) {
    const accounts = await API.bankAccounts();
    if (accounts.length === 0) { el.innerHTML = '<div class="empty-state"><p>Add a bank account first</p></div>'; return; }

    el.innerHTML = `
      <div class="card">
        <div class="card-header"><h3>Bank Reconciliation</h3></div>
        <div class="card-body">
          <p class="text-muted mb-md">Select a bank account and enter the statement balance to reconcile.</p>
          <div class="grid grid-3 gap-sm mb-md">
            <div class="form-group"><label class="form-label">Bank Account</label><select class="form-input" id="rec-acct">${accounts.map(a => `<option value="${a.id}">${Utils.escapeHtml(a.name)} (${Utils.currency(a.current_balance)})</option>`).join('')}</select></div>
            <div class="form-group"><label class="form-label">Statement Date</label><input class="form-input" type="date" id="rec-date" value="${new Date().toISOString().slice(0, 10)}"></div>
            <div class="form-group"><label class="form-label">Statement Balance</label><input class="form-input" type="number" step="0.01" id="rec-bal"></div>
          </div>
          <button class="btn btn-primary" onclick="BankingModule.reconcile()">Start Reconciliation</button>
        </div>
      </div>`;
  },

  async reconcile() {
    const accountId = document.getElementById('rec-acct').value;
    const statementDate = document.getElementById('rec-date').value;
    const statementBalance = parseFloat(document.getElementById('rec-bal').value);
    if (!statementBalance && statementBalance !== 0) { UI.toast('Error', 'Enter statement balance', 'danger'); return; }
    try {
      const r = await API.reconcileBank(accountId, { statement_date: statementDate, statement_balance: statementBalance });
      UI.toast(r.status === 'completed' ? 'Reconciled' : 'In Progress', `Difference: ${Utils.currency(r.difference)}`, r.status === 'completed' ? 'success' : 'warning');
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  destroy() {},
};
