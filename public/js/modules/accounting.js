/* ============================================================
   VENUECORE - Accounting Module
   Full double-entry accounting, financial statements, budgets
   ============================================================ */
const AccountingModule = {
  tab: 'overview',
  dateRange: { start: '', end: '' },

  _defaultDates() {
    const now = new Date();
    const end = now.toISOString().slice(0, 10);
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    return { start, end };
  },

  async render(container) {
    if (!this.dateRange.start) {
      const d = this._defaultDates();
      this.dateRange = d;
    }

    container.innerHTML = `
      <div class="animate-fade">
        <div class="flex items-center justify-between mb-md" style="flex-wrap:wrap;gap:12px">
          <div class="module-tabs" id="acct-tabs" style="margin-bottom:0">
            <button class="tab-btn active" data-tab="overview">Overview</button>
            <button class="tab-btn" data-tab="chart">Chart of Accounts</button>
            <button class="tab-btn" data-tab="journal">Journal Entries</button>
            <button class="tab-btn" data-tab="income">Income Statement</button>
            <button class="tab-btn" data-tab="balance">Balance Sheet</button>
            <button class="tab-btn" data-tab="cashflow">Cash Flow</button>
            <button class="tab-btn" data-tab="budgets">Budgets</button>
            <button class="tab-btn" data-tab="periods">Fiscal Periods</button>
          </div>
          <div class="flex items-center gap-sm" id="acct-date-range">
            <input type="date" class="form-input" id="acct-start" value="${this.dateRange.start}" style="width:150px">
            <span class="text-muted">to</span>
            <input type="date" class="form-input" id="acct-end" value="${this.dateRange.end}" style="width:150px">
            <button class="btn btn-sm btn-secondary" id="acct-apply-dates">Apply</button>
          </div>
        </div>
        <div id="acct-content"></div>
      </div>`;

    container.querySelector('#acct-tabs').addEventListener('click', e => {
      if (e.target.classList.contains('tab-btn')) {
        container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.tab = e.target.dataset.tab;
        this._toggleDateRange();
        this.loadTab(container.querySelector('#acct-content'));
      }
    });

    container.querySelector('#acct-apply-dates').addEventListener('click', () => {
      this.dateRange.start = document.getElementById('acct-start').value;
      this.dateRange.end = document.getElementById('acct-end').value;
      this.loadTab(container.querySelector('#acct-content'));
    });

    this._toggleDateRange();
    this.loadTab(container.querySelector('#acct-content'));
  },

  _toggleDateRange() {
    const dr = document.getElementById('acct-date-range');
    if (!dr) return;
    const hide = ['chart', 'periods'].includes(this.tab);
    dr.style.display = hide ? 'none' : 'flex';
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
        case 'cashflow': return await this.renderCashFlow(el);
        case 'budgets': return await this.renderBudgets(el);
        case 'periods': return await this.renderPeriods(el);
      }
    } catch (err) {
      el.innerHTML = `<div class="empty-state"><p>${Utils.escapeHtml(err.message)}</p></div>`;
    }
  },

  // ============================================================
  // OVERVIEW
  // ============================================================
  async renderOverview(el) {
    const [tb, income, bs, cf] = await Promise.all([
      API.trialBalance().catch(() => ({ accounts: [], in_balance: true, total_debits: 0, total_credits: 0 })),
      API.incomeStatement({ start_date: this.dateRange.start, end_date: this.dateRange.end }).catch(() => ({ revenue: { total: 0 }, total_expenses: 0, operating_profit: 0, net_margin: 0, gross_margin: 0, prime_cost_percent: 0 })),
      API.balanceSheet().catch(() => ({ assets: { total: 0 }, liabilities: { total: 0 }, equity: { total: 0 }, in_balance: true })),
      API.cashFlow({ start_date: this.dateRange.start, end_date: this.dateRange.end }).catch(() => ({ total_inflows: 0, total_outflows: 0, net_cash_flow: 0 })),
    ]);

    const profitColor = (income.operating_profit || 0) >= 0 ? 'var(--success)' : 'var(--danger)';
    const marginColor = (income.net_margin || 0) >= 10 ? 'var(--success)' : (income.net_margin || 0) >= 0 ? 'var(--warning)' : 'var(--danger)';
    const primeColor = (income.prime_cost_percent || 0) > 65 ? 'var(--danger)' : (income.prime_cost_percent || 0) > 55 ? 'var(--warning)' : 'var(--success)';

    el.innerHTML = `
      <!-- P&L Summary -->
      <div class="grid grid-4 gap-md mb-md">
        <div class="card" style="border-top:3px solid var(--success)">
          <div class="card-body" style="text-align:center">
            <div class="text-muted text-sm" style="text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Revenue</div>
            <div style="font-size:24px;font-weight:800;color:var(--success)">${Utils.currency(income.revenue?.total || 0)}</div>
          </div>
        </div>
        <div class="card" style="border-top:3px solid var(--danger)">
          <div class="card-body" style="text-align:center">
            <div class="text-muted text-sm" style="text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Expenses</div>
            <div style="font-size:24px;font-weight:800;color:var(--danger)">${Utils.currency(income.total_expenses || 0)}</div>
          </div>
        </div>
        <div class="card" style="border-top:3px solid ${profitColor}">
          <div class="card-body" style="text-align:center">
            <div class="text-muted text-sm" style="text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Net Profit</div>
            <div style="font-size:24px;font-weight:800;color:${profitColor}">${Utils.currency(income.operating_profit || 0)}</div>
          </div>
        </div>
        <div class="card" style="border-top:3px solid ${marginColor}">
          <div class="card-body" style="text-align:center">
            <div class="text-muted text-sm" style="text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Net Margin</div>
            <div style="font-size:24px;font-weight:800;color:${marginColor}">${income.net_margin || 0}%</div>
          </div>
        </div>
      </div>

      <!-- Balance Sheet + Cash Flow Summary -->
      <div class="grid grid-2 gap-md mb-md">
        <div class="card">
          <div class="card-header flex items-center justify-between">
            <h3>Balance Sheet Snapshot</h3>
            <span class="badge badge-${bs.in_balance ? 'success' : 'danger'}">${bs.in_balance ? 'Balanced' : 'OUT OF BALANCE'}</span>
          </div>
          <div class="card-body" style="padding:0">
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;text-align:center;border-bottom:1px solid var(--border-color)">
              <div style="padding:16px;border-right:1px solid var(--border-color)">
                <div class="text-muted text-sm" style="margin-bottom:4px">Assets</div>
                <div style="font-size:18px;font-weight:700;color:#27ae60">${Utils.currency(bs.assets?.total || 0)}</div>
              </div>
              <div style="padding:16px;border-right:1px solid var(--border-color)">
                <div class="text-muted text-sm" style="margin-bottom:4px">Liabilities</div>
                <div style="font-size:18px;font-weight:700;color:#e74c3c">${Utils.currency(bs.liabilities?.total || 0)}</div>
              </div>
              <div style="padding:16px">
                <div class="text-muted text-sm" style="margin-bottom:4px">Equity</div>
                <div style="font-size:18px;font-weight:700;color:#3498db">${Utils.currency(bs.equity?.total || 0)}</div>
              </div>
            </div>
            <div style="padding:12px;text-align:center;font-size:13px;color:var(--text-muted)">
              A = L + E: ${Utils.currency(bs.assets?.total || 0)} = ${Utils.currency((bs.liabilities?.total || 0) + (bs.equity?.total || 0))}
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h3>Cash Flow Summary</h3></div>
          <div class="card-body" style="padding:0">
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;text-align:center;border-bottom:1px solid var(--border-color)">
              <div style="padding:16px;border-right:1px solid var(--border-color)">
                <div class="text-muted text-sm" style="margin-bottom:4px">Inflows</div>
                <div style="font-size:18px;font-weight:700;color:#27ae60">${Utils.currency(cf.total_inflows || 0)}</div>
              </div>
              <div style="padding:16px;border-right:1px solid var(--border-color)">
                <div class="text-muted text-sm" style="margin-bottom:4px">Outflows</div>
                <div style="font-size:18px;font-weight:700;color:#e74c3c">${Utils.currency(cf.total_outflows || 0)}</div>
              </div>
              <div style="padding:16px">
                <div class="text-muted text-sm" style="margin-bottom:4px">Net Cash</div>
                <div style="font-size:18px;font-weight:700;color:${(cf.net_cash_flow || 0) >= 0 ? '#27ae60' : '#e74c3c'}">${Utils.currency(cf.net_cash_flow || 0)}</div>
              </div>
            </div>
            <div style="padding:12px;text-align:center;font-size:13px;color:var(--text-muted)">
              Period: ${this.dateRange.start} to ${this.dateRange.end}
            </div>
          </div>
        </div>
      </div>

      <!-- Trial Balance + Quick Actions -->
      <div class="grid grid-2 gap-md mb-md">
        <div class="card">
          <div class="card-header flex items-center justify-between">
            <h3>Trial Balance</h3>
            <span class="badge badge-${tb.in_balance ? 'success' : 'danger'}">${tb.in_balance ? 'Balanced' : 'OUT OF BALANCE'}</span>
          </div>
          <div class="card-body">
            <div style="display:grid;grid-template-columns:1fr 1fr;text-align:center;gap:16px;margin-bottom:12px">
              <div>
                <div class="text-muted text-sm">Total Debits</div>
                <div style="font-size:20px;font-weight:700">${Utils.currency(tb.total_debits || 0)}</div>
              </div>
              <div>
                <div class="text-muted text-sm">Total Credits</div>
                <div style="font-size:20px;font-weight:700">${Utils.currency(tb.total_credits || 0)}</div>
              </div>
            </div>
            <div class="text-muted text-sm" style="text-align:center">${tb.accounts?.length || 0} accounts with activity</div>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h3>Quick Actions</h3></div>
          <div class="card-body">
            <div class="grid grid-2 gap-sm">
              <button class="btn btn-primary" onclick="AccountingModule.showNewJournalEntry()">New Journal Entry</button>
              <button class="btn btn-secondary" onclick="AccountingModule._autoJournal()">Auto-Journal Sales</button>
              <button class="btn btn-secondary" onclick="AccountingModule._goTab('income')">Income Statement</button>
              <button class="btn btn-secondary" onclick="AccountingModule._goTab('balance')">Balance Sheet</button>
              <button class="btn btn-secondary" onclick="AccountingModule._goTab('cashflow')">Cash Flow</button>
              <button class="btn btn-secondary" onclick="AccountingModule.showAddAccount()">New Account</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Prime Cost -->
      <div class="card">
        <div class="card-header"><h3>Prime Cost Analysis</h3></div>
        <div class="card-body">
          <div class="flex items-center gap-lg" style="margin-bottom:12px">
            <div style="flex:1">
              <div style="font-size:13px;color:var(--text-muted);margin-bottom:2px">COGS + Labor / Revenue</div>
              <div style="font-size:14px;font-weight:600">Gross Margin: ${income.gross_margin || 0}%</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:32px;font-weight:800;color:${primeColor}">${income.prime_cost_percent || 0}%</div>
              <div class="text-sm" style="color:${primeColor}">${(income.prime_cost_percent || 0) <= 55 ? 'Excellent' : (income.prime_cost_percent || 0) <= 65 ? 'Acceptable' : 'Needs Attention'}</div>
            </div>
          </div>
          <div style="height:16px;background:var(--bg-secondary);border-radius:8px;overflow:hidden">
            <div style="height:100%;width:${Math.min(income.prime_cost_percent || 0, 100)}%;background:${primeColor};border-radius:8px;transition:width 0.5s"></div>
          </div>
          <div class="flex justify-between text-sm text-muted" style="margin-top:6px">
            <span>0%</span>
            <span style="color:var(--success)">55% (Bar Target)</span>
            <span style="color:var(--warning)">60% (Restaurant Target)</span>
            <span>100%</span>
          </div>
        </div>
      </div>`;
  },

  _goTab(tab) {
    this.tab = tab;
    const btn = document.querySelector(`[data-tab="${tab}"]`);
    if (btn) {
      document.querySelectorAll('#acct-tabs .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    }
    this._toggleDateRange();
    this.loadTab(document.getElementById('acct-content'));
  },

  async _autoJournal() {
    try {
      const r = await API.autoJournalDailySales();
      UI.toast('Auto Journal', r.message || 'Done', 'success');
    } catch (e) { UI.toast('Error', e.message, 'danger'); }
  },

  // ============================================================
  // CHART OF ACCOUNTS
  // ============================================================
  async renderChart(el) {
    const accounts = await API.chartOfAccounts();
    const groups = {};
    for (const a of accounts) {
      if (!groups[a.account_type]) groups[a.account_type] = [];
      groups[a.account_type].push(a);
    }

    const typeOrder = ['asset', 'liability', 'equity', 'revenue', 'expense'];
    const typeLabels = { asset: 'Assets', liability: 'Liabilities', equity: 'Equity', revenue: 'Revenue', expense: 'Expenses' };
    const typeColors = { asset: '#27ae60', liability: '#e74c3c', equity: '#3498db', revenue: '#2ecc71', expense: '#e67e22' };
    const typeIcons = { asset: '$', liability: 'L', equity: 'E', revenue: 'R', expense: 'X' };

    el.innerHTML = `
      <div class="flex items-center justify-between mb-md">
        <div>
          <h3 style="margin-bottom:2px">${accounts.length} Accounts</h3>
          <span class="text-muted text-sm">${accounts.filter(a => a.active).length} active, ${accounts.filter(a => !a.active).length} inactive</span>
        </div>
        <button class="btn btn-primary" onclick="AccountingModule.showAddAccount()">+ Add Account</button>
      </div>
      ${typeOrder.map(type => {
        const accts = groups[type] || [];
        if (accts.length === 0) return '';
        const subtypes = {};
        for (const a of accts) {
          const st = a.sub_type || 'other';
          if (!subtypes[st]) subtypes[st] = [];
          subtypes[st].push(a);
        }
        return `
          <div class="card mb-md">
            <div class="card-header flex items-center gap-sm" style="border-left:4px solid ${typeColors[type]}">
              <span style="width:28px;height:28px;border-radius:50%;background:${typeColors[type]};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px">${typeIcons[type]}</span>
              <h3>${typeLabels[type]} (${accts.length})</h3>
            </div>
            <div class="card-body" style="padding:0">
              ${Object.entries(subtypes).map(([st, stAccts]) => `
                <div style="border-bottom:1px solid var(--border-color)">
                  <div style="padding:8px 16px;background:var(--bg-secondary);font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted)">${st}</div>
                  ${stAccts.map(a => `
                    <div class="flex items-center justify-between" style="padding:10px 16px;border-bottom:1px solid var(--border-color);opacity:${a.active ? 1 : 0.5}">
                      <div class="flex items-center gap-sm">
                        <code style="background:var(--bg-secondary);padding:2px 8px;border-radius:4px;font-size:13px;font-weight:600">${a.account_number}</code>
                        <span style="font-weight:500">${Utils.escapeHtml(a.name)}</span>
                        ${a.is_system ? '<span class="badge badge-secondary" style="font-size:10px">System</span>' : ''}
                      </div>
                      <div class="flex items-center gap-sm">
                        <span class="text-muted text-sm">${a.normal_balance}</span>
                        <span class="badge badge-${a.active ? 'success' : 'secondary'}" style="font-size:11px">${a.active ? 'Active' : 'Inactive'}</span>
                        ${!a.is_system ? `<button class="btn btn-sm btn-secondary" onclick="AccountingModule.editAccount(${a.id})" style="padding:2px 8px;font-size:11px">Edit</button>` : ''}
                      </div>
                    </div>
                  `).join('')}
                </div>
              `).join('')}
            </div>
          </div>`;
      }).join('')}`;
  },

  async showAddAccount() {
    const html = `
      <div class="grid grid-2 gap-md">
        <div class="form-group">
          <label class="form-label">Account Number</label>
          <input class="form-input" id="acct-num" placeholder="e.g. 1050">
          <small class="text-muted">Assets: 1xxx, Liabilities: 2xxx, Equity: 3xxx, Revenue: 4xxx, Expenses: 5-8xxx</small>
        </div>
        <div class="form-group">
          <label class="form-label">Account Name</label>
          <input class="form-input" id="acct-name" placeholder="e.g. Petty Cash">
        </div>
        <div class="form-group">
          <label class="form-label">Type</label>
          <select class="form-input" id="acct-type">
            <option value="asset">Asset</option>
            <option value="liability">Liability</option>
            <option value="equity">Equity</option>
            <option value="revenue">Revenue</option>
            <option value="expense">Expense</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Sub-Type</label>
          <select class="form-input" id="acct-sub">
            <option value="current">Current</option>
            <option value="fixed">Fixed</option>
            <option value="contra">Contra</option>
            <option value="equity">Equity</option>
            <option value="operating">Operating</option>
            <option value="cogs">Cost of Goods Sold</option>
            <option value="labor">Labor</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Normal Balance</label>
          <select class="form-input" id="acct-bal">
            <option value="debit">Debit</option>
            <option value="credit">Credit</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Description (optional)</label>
          <input class="form-input" id="acct-desc" placeholder="What this account tracks">
        </div>
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

  async editAccount(id) {
    const accounts = await API.chartOfAccounts();
    const acct = accounts.find(a => a.id === id);
    if (!acct) return;

    const html = `
      <div class="grid grid-2 gap-md">
        <div class="form-group">
          <label class="form-label">Account Number</label>
          <input class="form-input" value="${acct.account_number}" disabled>
        </div>
        <div class="form-group">
          <label class="form-label">Account Name</label>
          <input class="form-input" id="edit-acct-name" value="${Utils.escapeHtml(acct.name)}">
        </div>
        <div class="form-group">
          <label class="form-label">Sub-Type</label>
          <input class="form-input" id="edit-acct-sub" value="${acct.sub_type || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <input class="form-input" id="edit-acct-desc" value="${Utils.escapeHtml(acct.description || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select class="form-input" id="edit-acct-active">
            <option value="1" ${acct.active ? 'selected' : ''}>Active</option>
            <option value="0" ${!acct.active ? 'selected' : ''}>Inactive</option>
          </select>
        </div>
      </div>`;
    const modal = await UI.modal('Edit Account', html, { confirmText: 'Save Changes', size: 'lg' });
    if (!modal) return;
    try {
      await API.updateAccount(id, {
        name: modal.querySelector('#edit-acct-name').value,
        sub_type: modal.querySelector('#edit-acct-sub').value,
        description: modal.querySelector('#edit-acct-desc').value,
        active: modal.querySelector('#edit-acct-active').value === '1',
      });
      UI.toast('Success', 'Account updated', 'success');
      this.loadTab(document.getElementById('acct-content'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  // ============================================================
  // JOURNAL ENTRIES
  // ============================================================
  async renderJournal(el) {
    const entries = await API.journalEntries({ limit: 50, start_date: this.dateRange.start, end_date: this.dateRange.end });

    const totalPosted = entries.filter(e => e.status === 'posted').length;
    const totalDraft = entries.filter(e => e.status === 'draft').length;

    el.innerHTML = `
      <div class="flex items-center justify-between mb-md">
        <div>
          <h3 style="margin-bottom:2px">${entries.length} Journal Entries</h3>
          <span class="text-muted text-sm">${totalPosted} posted, ${totalDraft} drafts</span>
        </div>
        <button class="btn btn-primary" onclick="AccountingModule.showNewJournalEntry()">+ New Entry</button>
      </div>
      ${entries.length === 0 ? `
        <div class="card">
          <div class="card-body" style="text-align:center;padding:40px">
            <div style="font-size:48px;margin-bottom:12px;opacity:0.3">JE</div>
            <h3 style="margin-bottom:8px">No Journal Entries</h3>
            <p class="text-muted">Create your first journal entry or use auto-journal to record daily sales.</p>
            <div class="flex items-center justify-center gap-sm" style="margin-top:16px">
              <button class="btn btn-primary" onclick="AccountingModule.showNewJournalEntry()">Create Entry</button>
              <button class="btn btn-secondary" onclick="AccountingModule._autoJournal()">Auto-Journal Sales</button>
            </div>
          </div>
        </div>
      ` : `
        <div class="card">
          <div class="card-body" style="padding:0">
            ${entries.map(entry => `
              <div class="acct-je-row" style="border-bottom:1px solid var(--border-color)">
                <div class="flex items-center justify-between" style="padding:12px 16px;cursor:pointer" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
                  <div class="flex items-center gap-md">
                    <code style="background:var(--bg-secondary);padding:4px 10px;border-radius:4px;font-weight:600;font-size:13px">${entry.entry_number}</code>
                    <div>
                      <div style="font-weight:500">${Utils.escapeHtml(entry.description || 'No description')}</div>
                      <div class="text-sm text-muted">${entry.entry_date} ${entry.source !== 'manual' ? '| ' + entry.source : ''}</div>
                    </div>
                  </div>
                  <div class="flex items-center gap-sm">
                    <span class="text-sm" style="font-weight:600">${entry.lines ? Utils.currency(entry.lines.reduce((s, l) => s + l.debit, 0)) : '$0.00'}</span>
                    <span class="badge badge-${entry.status === 'posted' ? 'success' : entry.status === 'draft' ? 'warning' : 'secondary'}">${entry.status}</span>
                    ${entry.reversed ? '<span class="badge badge-secondary">Reversed</span>' : ''}
                    ${entry.status === 'draft' ? `<button class="btn btn-sm btn-success" onclick="event.stopPropagation();AccountingModule.postEntry(${entry.id})" style="padding:3px 10px">Post</button>` : ''}
                    ${entry.status === 'posted' && !entry.reversed ? `<button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();AccountingModule.reverseEntry(${entry.id})" style="padding:3px 10px">Reverse</button>` : ''}
                  </div>
                </div>
                <div style="display:none;background:var(--bg-secondary);padding:0 16px 12px 16px">
                  <table style="width:100%;border-collapse:collapse;font-size:13px">
                    <thead>
                      <tr style="border-bottom:1px solid var(--border-color)">
                        <th style="text-align:left;padding:8px 6px;font-weight:600">Account</th>
                        <th style="text-align:right;padding:8px 6px;font-weight:600">Debit</th>
                        <th style="text-align:right;padding:8px 6px;font-weight:600">Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${(entry.lines || []).map(l => `
                        <tr style="border-bottom:1px solid var(--border-color)">
                          <td style="padding:6px">${l.account_number} - ${Utils.escapeHtml(l.account_name)}</td>
                          <td style="text-align:right;padding:6px;${l.debit > 0 ? 'font-weight:600' : 'color:var(--text-muted)'}">${l.debit > 0 ? Utils.currency(l.debit) : '-'}</td>
                          <td style="text-align:right;padding:6px;${l.credit > 0 ? 'font-weight:600' : 'color:var(--text-muted)'}">${l.credit > 0 ? Utils.currency(l.credit) : '-'}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `}`;
  },

  async showNewJournalEntry() {
    const accounts = await API.chartOfAccounts({ active: 'true' });
    const optionsHtml = accounts.map(a => `<option value="${a.id}">${a.account_number} - ${Utils.escapeHtml(a.name)}</option>`).join('');

    const html = `
      <div class="grid grid-2 gap-md mb-md">
        <div class="form-group">
          <label class="form-label">Date</label>
          <input class="form-input" type="date" id="je-date" value="${new Date().toISOString().slice(0, 10)}">
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <input class="form-input" id="je-desc" placeholder="What is this entry for?">
        </div>
      </div>
      <div style="margin-bottom:8px">
        <div class="flex items-center gap-sm" style="font-weight:600;font-size:13px;padding:6px 0;border-bottom:2px solid var(--border-color)">
          <div style="flex:3">Account</div>
          <div style="flex:1;text-align:right">Debit</div>
          <div style="flex:1;text-align:right">Credit</div>
          <div style="width:30px"></div>
        </div>
      </div>
      <div id="je-lines">
        ${this._jeLineHtml(optionsHtml)}
        ${this._jeLineHtml(optionsHtml)}
      </div>
      <div class="flex items-center justify-between" style="margin-top:8px">
        <button class="btn btn-sm btn-secondary" id="je-add-line">+ Add Line</button>
        <div class="flex items-center gap-md text-sm">
          <span>Debits: <strong id="je-total-debit">$0.00</strong></span>
          <span>Credits: <strong id="je-total-credit">$0.00</strong></span>
          <span id="je-balance-indicator" class="badge badge-warning">Unbalanced</span>
        </div>
      </div>`;

    const modal = await UI.modal('New Journal Entry', html, { confirmText: 'Create Entry', size: 'lg' });
    if (!modal) return;

    // Wire up add line + live totals
    modal.querySelector('#je-add-line').addEventListener('click', () => {
      modal.querySelector('#je-lines').insertAdjacentHTML('beforeend', this._jeLineHtml(optionsHtml));
      this._updateJeTotals(modal);
    });
    modal.addEventListener('input', () => this._updateJeTotals(modal));
    modal.addEventListener('click', e => {
      if (e.target.classList.contains('je-remove-line')) {
        e.target.closest('.je-line').remove();
        this._updateJeTotals(modal);
      }
    });

    // Wait for confirm
    // The modal already resolved at this point with the modal body
    const lineEls = modal.querySelectorAll('.je-line');
    const lines = [];
    lineEls.forEach(row => {
      const acctId = row.querySelector('select').value;
      const debit = parseFloat(row.querySelectorAll('input[type=number]')[0].value) || 0;
      const credit = parseFloat(row.querySelectorAll('input[type=number]')[1].value) || 0;
      if (debit > 0 || credit > 0) lines.push({ account_id: parseInt(acctId), debit, credit });
    });

    try {
      await API.createJournalEntry({
        entry_date: modal.querySelector('#je-date').value,
        description: modal.querySelector('#je-desc').value,
        lines,
      });
      UI.toast('Success', 'Journal entry created', 'success');
      this.loadTab(document.getElementById('acct-content'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  _jeLineHtml(options) {
    return `
      <div class="je-line flex items-center gap-sm" style="margin-bottom:6px">
        <select class="form-input" style="flex:3">${options}</select>
        <input class="form-input" style="flex:1;text-align:right" placeholder="0.00" type="number" step="0.01" min="0">
        <input class="form-input" style="flex:1;text-align:right" placeholder="0.00" type="number" step="0.01" min="0">
        <button class="je-remove-line btn btn-sm" style="width:30px;padding:4px;color:var(--danger);background:none;border:none;font-size:16px;cursor:pointer">&times;</button>
      </div>`;
  },

  _updateJeTotals(modal) {
    let totalDebit = 0, totalCredit = 0;
    modal.querySelectorAll('.je-line').forEach(row => {
      const inputs = row.querySelectorAll('input[type=number]');
      totalDebit += parseFloat(inputs[0].value) || 0;
      totalCredit += parseFloat(inputs[1].value) || 0;
    });
    const dEl = modal.querySelector('#je-total-debit');
    const cEl = modal.querySelector('#je-total-credit');
    const bEl = modal.querySelector('#je-balance-indicator');
    if (dEl) dEl.textContent = Utils.currency(totalDebit);
    if (cEl) cEl.textContent = Utils.currency(totalCredit);
    if (bEl) {
      const balanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;
      bEl.className = `badge badge-${balanced ? 'success' : 'warning'}`;
      bEl.textContent = balanced ? 'Balanced' : 'Unbalanced';
    }
  },

  async postEntry(id) {
    try {
      await API.postJournalEntry(id);
      UI.toast('Posted', 'Entry posted to General Ledger', 'success');
      this.loadTab(document.getElementById('acct-content'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async reverseEntry(id) {
    if (!await UI.confirm('Reverse Entry', 'This will create a new reversing journal entry with swapped debits/credits. Continue?')) return;
    try {
      await API.reverseJournalEntry(id);
      UI.toast('Reversed', 'Reversing entry created and posted', 'success');
      this.loadTab(document.getElementById('acct-content'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  // ============================================================
  // INCOME STATEMENT
  // ============================================================
  async renderIncome(el) {
    const data = await API.incomeStatement({ start_date: this.dateRange.start, end_date: this.dateRange.end });

    const renderSection = (title, accounts, total, color, icon) => `
      <div style="margin-bottom:20px">
        <div class="flex items-center gap-sm" style="padding:8px 12px;background:var(--bg-secondary);border-radius:6px;margin-bottom:2px">
          <span style="width:24px;height:24px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">${icon}</span>
          <span style="font-weight:700;font-size:14px;text-transform:uppercase;letter-spacing:0.5px">${title}</span>
          <span style="margin-left:auto;font-weight:700;font-size:15px">${Utils.currency(total)}</span>
        </div>
        ${(accounts || []).map(a => `
          <div class="flex justify-between" style="padding:8px 16px 8px 48px;border-bottom:1px solid var(--border-color)">
            <span class="text-sm"><code style="margin-right:8px;opacity:0.6">${a.account_number}</code>${Utils.escapeHtml(a.name)}</span>
            <span style="font-weight:500">${Utils.currency(a.balance)}</span>
          </div>
        `).join('')}
        ${(!accounts || accounts.length === 0) ? '<div class="text-muted text-sm" style="padding:8px 48px">No activity</div>' : ''}
      </div>`;

    el.innerHTML = `
      <div class="card">
        <div class="card-header flex items-center justify-between">
          <div>
            <h3 style="margin-bottom:2px">Income Statement (P&L)</h3>
            <span class="text-muted text-sm">${data.period?.start || this.dateRange.start} to ${data.period?.end || this.dateRange.end}</span>
          </div>
        </div>
        <div class="card-body">
          ${renderSection('Revenue', data.revenue?.accounts, data.revenue?.total || 0, '#27ae60', 'R')}

          ${renderSection('Cost of Goods Sold', data.cost_of_goods?.accounts, data.cost_of_goods?.total || 0, '#e74c3c', 'C')}

          <div class="flex justify-between" style="padding:12px 16px;background:${(data.gross_profit || 0) >= 0 ? 'rgba(39,174,96,0.1)' : 'rgba(231,76,60,0.1)'};border-radius:8px;margin-bottom:20px">
            <span style="font-weight:700;font-size:15px">Gross Profit</span>
            <div style="text-align:right">
              <span style="font-weight:700;font-size:15px">${Utils.currency(data.gross_profit || 0)}</span>
              <span class="text-sm text-muted" style="margin-left:8px">${data.gross_margin || 0}% margin</span>
            </div>
          </div>

          ${renderSection('Labor', data.labor?.accounts, data.labor?.total || 0, '#e67e22', 'L')}

          ${renderSection('Operating Expenses', data.operating_expenses?.accounts, data.operating_expenses?.total || 0, '#9b59b6', 'O')}

          <div style="padding:16px;background:${(data.operating_profit || 0) >= 0 ? '#27ae60' : '#e74c3c'};color:#fff;border-radius:8px;margin-top:8px">
            <div class="flex justify-between items-center">
              <span style="font-size:18px;font-weight:700">Net Profit</span>
              <div style="text-align:right">
                <span style="font-size:22px;font-weight:800">${Utils.currency(data.operating_profit || 0)}</span>
                <div style="font-size:13px;opacity:0.85">${data.net_margin || 0}% net margin</div>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  },

  // ============================================================
  // BALANCE SHEET
  // ============================================================
  async renderBalance(el) {
    const data = await API.balanceSheet(this.dateRange.end);

    const renderSection = (title, accounts, total, color, icon) => `
      <div class="card mb-md">
        <div class="card-header flex items-center gap-sm" style="border-left:4px solid ${color}">
          <span style="width:28px;height:28px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px">${icon}</span>
          <h3>${title}</h3>
          <span style="margin-left:auto;font-size:18px;font-weight:700">${Utils.currency(total)}</span>
        </div>
        <div class="card-body" style="padding:0">
          ${(accounts || []).length === 0 ? '<div class="text-muted text-sm" style="padding:16px;text-align:center">No activity</div>' :
            (accounts || []).map(a => `
              <div class="flex justify-between items-center" style="padding:10px 16px;border-bottom:1px solid var(--border-color)">
                <span><code style="margin-right:8px;opacity:0.6">${a.account_number}</code>${Utils.escapeHtml(a.name)}${a.sub_type ? ` <span class="text-muted text-sm">(${a.sub_type})</span>` : ''}</span>
                <span style="font-weight:600">${Utils.currency(a.balance)}</span>
              </div>
            `).join('')}
        </div>
      </div>`;

    el.innerHTML = `
      <div class="flex items-center justify-between mb-md">
        <div>
          <h3 style="margin-bottom:2px">Balance Sheet</h3>
          <span class="text-muted text-sm">As of ${data.as_of_date || this.dateRange.end}</span>
        </div>
        <span class="badge badge-${data.in_balance ? 'success' : 'danger'}" style="font-size:13px;padding:6px 12px">${data.in_balance ? 'In Balance' : 'OUT OF BALANCE'}</span>
      </div>

      ${renderSection('Assets', data.assets?.accounts, data.assets?.total || 0, '#27ae60', 'A')}
      ${renderSection('Liabilities', data.liabilities?.accounts, data.liabilities?.total || 0, '#e74c3c', 'L')}
      ${renderSection('Equity', data.equity?.accounts, data.equity?.total || 0, '#3498db', 'E')}

      <div class="card">
        <div class="card-body" style="text-align:center;padding:16px">
          <div style="font-size:15px;font-weight:700;margin-bottom:4px">Accounting Equation</div>
          <div style="font-size:18px;font-weight:600">
            <span style="color:#27ae60">${Utils.currency(data.assets?.total || 0)}</span>
            <span class="text-muted"> = </span>
            <span style="color:#e74c3c">${Utils.currency(data.liabilities?.total || 0)}</span>
            <span class="text-muted"> + </span>
            <span style="color:#3498db">${Utils.currency(data.equity?.total || 0)}</span>
          </div>
          <div class="text-muted text-sm" style="margin-top:4px">Assets = Liabilities + Equity</div>
        </div>
      </div>`;
  },

  // ============================================================
  // CASH FLOW
  // ============================================================
  async renderCashFlow(el) {
    const data = await API.cashFlow({ start_date: this.dateRange.start, end_date: this.dateRange.end });

    el.innerHTML = `
      <div class="flex items-center justify-between mb-md">
        <div>
          <h3 style="margin-bottom:2px">Cash Flow Statement</h3>
          <span class="text-muted text-sm">${data.period?.start || this.dateRange.start} to ${data.period?.end || this.dateRange.end}</span>
        </div>
      </div>

      <div class="grid grid-3 gap-md mb-md">
        <div class="card" style="border-top:3px solid #27ae60">
          <div class="card-body" style="text-align:center">
            <div class="text-muted text-sm" style="text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Total Inflows</div>
            <div style="font-size:24px;font-weight:800;color:#27ae60">${Utils.currency(data.total_inflows || 0)}</div>
          </div>
        </div>
        <div class="card" style="border-top:3px solid #e74c3c">
          <div class="card-body" style="text-align:center">
            <div class="text-muted text-sm" style="text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Total Outflows</div>
            <div style="font-size:24px;font-weight:800;color:#e74c3c">${Utils.currency(data.total_outflows || 0)}</div>
          </div>
        </div>
        <div class="card" style="border-top:3px solid ${(data.net_cash_flow || 0) >= 0 ? '#27ae60' : '#e74c3c'}">
          <div class="card-body" style="text-align:center">
            <div class="text-muted text-sm" style="text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Net Cash Flow</div>
            <div style="font-size:24px;font-weight:800;color:${(data.net_cash_flow || 0) >= 0 ? '#27ae60' : '#e74c3c'}">${Utils.currency(data.net_cash_flow || 0)}</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3>Cash Account Activity</h3></div>
        <div class="card-body" style="padding:0">
          ${(data.cash_accounts || []).length === 0 ? `
            <div style="text-align:center;padding:40px">
              <div class="text-muted text-sm">No cash account activity in this period.</div>
              <div class="text-muted text-sm" style="margin-top:8px">Journal entries affecting accounts 1000 (Cash), 1010 (Checking), and 1020 (Savings) will appear here.</div>
            </div>
          ` : `
            <table style="width:100%;border-collapse:collapse">
              <thead>
                <tr style="border-bottom:2px solid var(--border-color)">
                  <th style="text-align:left;padding:12px 16px;font-weight:600">Account</th>
                  <th style="text-align:right;padding:12px 16px;font-weight:600;color:#27ae60">Inflows (Debits)</th>
                  <th style="text-align:right;padding:12px 16px;font-weight:600;color:#e74c3c">Outflows (Credits)</th>
                  <th style="text-align:right;padding:12px 16px;font-weight:600">Net</th>
                </tr>
              </thead>
              <tbody>
                ${data.cash_accounts.map(ca => `
                  <tr style="border-bottom:1px solid var(--border-color)">
                    <td style="padding:10px 16px;font-weight:500">${Utils.escapeHtml(ca.name)}</td>
                    <td style="text-align:right;padding:10px 16px;color:#27ae60">${Utils.currency(ca.inflows || 0)}</td>
                    <td style="text-align:right;padding:10px 16px;color:#e74c3c">${Utils.currency(ca.outflows || 0)}</td>
                    <td style="text-align:right;padding:10px 16px;font-weight:600">${Utils.currency((ca.inflows || 0) - (ca.outflows || 0))}</td>
                  </tr>
                `).join('')}
              </tbody>
              <tfoot>
                <tr style="background:var(--bg-secondary)">
                  <td style="padding:12px 16px;font-weight:700">Total</td>
                  <td style="text-align:right;padding:12px 16px;font-weight:700;color:#27ae60">${Utils.currency(data.total_inflows || 0)}</td>
                  <td style="text-align:right;padding:12px 16px;font-weight:700;color:#e74c3c">${Utils.currency(data.total_outflows || 0)}</td>
                  <td style="text-align:right;padding:12px 16px;font-weight:700">${Utils.currency(data.net_cash_flow || 0)}</td>
                </tr>
              </tfoot>
            </table>
          `}
        </div>
      </div>`;
  },

  // ============================================================
  // BUDGETS
  // ============================================================
  async renderBudgets(el) {
    const [, bva] = await Promise.all([
      API.budgets().catch(() => []),
      API.budgetVsActual({ start_date: this.dateRange.start, end_date: this.dateRange.end }).catch(() => ({ accounts: [] })),
    ]);

    const totalBudget = (bva.accounts || []).reduce((s, a) => s + (a.budget || 0), 0);
    const totalActual = (bva.accounts || []).reduce((s, a) => s + (a.actual || 0), 0);
    const totalVariance = totalActual - totalBudget;

    el.innerHTML = `
      <div class="flex items-center justify-between mb-md">
        <div>
          <h3 style="margin-bottom:2px">Budget vs Actual</h3>
          <span class="text-muted text-sm">${bva.period?.start || this.dateRange.start} to ${bva.period?.end || this.dateRange.end}</span>
        </div>
        <button class="btn btn-primary" onclick="AccountingModule.showAddBudget()">+ Set Budget</button>
      </div>

      ${(bva.accounts || []).length > 0 ? `
        <div class="grid grid-3 gap-md mb-md">
          <div class="card"><div class="card-body" style="text-align:center">
            <div class="text-muted text-sm" style="margin-bottom:4px">Total Budgeted</div>
            <div style="font-size:20px;font-weight:700">${Utils.currency(totalBudget)}</div>
          </div></div>
          <div class="card"><div class="card-body" style="text-align:center">
            <div class="text-muted text-sm" style="margin-bottom:4px">Total Actual</div>
            <div style="font-size:20px;font-weight:700">${Utils.currency(totalActual)}</div>
          </div></div>
          <div class="card"><div class="card-body" style="text-align:center">
            <div class="text-muted text-sm" style="margin-bottom:4px">Total Variance</div>
            <div style="font-size:20px;font-weight:700;color:${totalVariance >= 0 ? 'var(--danger)' : 'var(--success)'}">${Utils.currency(totalVariance)}</div>
          </div></div>
        </div>
      ` : ''}

      <div class="card">
        <div class="card-body" style="padding:0">
          ${(bva.accounts || []).length === 0 ? `
            <div style="text-align:center;padding:40px">
              <div style="font-size:48px;margin-bottom:12px;opacity:0.3">$</div>
              <h3 style="margin-bottom:8px">No Budgets Set</h3>
              <p class="text-muted">Set monthly budgets for your accounts to track spending against targets.</p>
              <button class="btn btn-primary" onclick="AccountingModule.showAddBudget()" style="margin-top:12px">+ Set Budget</button>
            </div>
          ` : `
            <table style="width:100%;border-collapse:collapse">
              <thead>
                <tr style="border-bottom:2px solid var(--border-color)">
                  <th style="text-align:left;padding:12px 16px;font-weight:600">Account</th>
                  <th style="text-align:left;padding:12px 16px;font-weight:600">Type</th>
                  <th style="text-align:right;padding:12px 16px;font-weight:600">Budget</th>
                  <th style="text-align:right;padding:12px 16px;font-weight:600">Actual</th>
                  <th style="text-align:right;padding:12px 16px;font-weight:600">Variance</th>
                  <th style="text-align:left;padding:12px 16px;font-weight:600;width:180px">Progress</th>
                </tr>
              </thead>
              <tbody>
                ${bva.accounts.map(row => {
                  const pct = row.budget > 0 ? Math.round((row.actual / row.budget) * 100) : 0;
                  const isRev = row.account_type === 'revenue';
                  const varColor = row.variance > 0 ? (isRev ? 'var(--success)' : 'var(--danger)') : (isRev ? 'var(--danger)' : 'var(--success)');
                  const barColor = isRev ? (pct >= 100 ? '#27ae60' : pct >= 75 ? '#f39c12' : '#e74c3c') : (pct > 100 ? '#e74c3c' : pct > 85 ? '#f39c12' : '#27ae60');
                  return `
                    <tr style="border-bottom:1px solid var(--border-color)">
                      <td style="padding:10px 16px"><code style="margin-right:6px;opacity:0.6">${row.account_number}</code>${Utils.escapeHtml(row.name)}</td>
                      <td style="padding:10px 16px"><span class="badge badge-secondary" style="font-size:11px;text-transform:capitalize">${row.account_type}</span></td>
                      <td style="text-align:right;padding:10px 16px">${Utils.currency(row.budget)}</td>
                      <td style="text-align:right;padding:10px 16px;font-weight:600">${Utils.currency(row.actual)}</td>
                      <td style="text-align:right;padding:10px 16px;font-weight:600;color:${varColor}">${Utils.currency(row.variance)} (${row.variance_percent}%)</td>
                      <td style="padding:10px 16px">
                        <div style="display:flex;align-items:center;gap:8px">
                          <div style="flex:1;height:8px;background:var(--bg-secondary);border-radius:4px;overflow:hidden">
                            <div style="height:100%;width:${Math.min(pct, 100)}%;background:${barColor};border-radius:4px"></div>
                          </div>
                          <span class="text-sm" style="font-weight:600;min-width:35px">${pct}%</span>
                        </div>
                      </td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          `}
        </div>
      </div>`;
  },

  async showAddBudget() {
    const accounts = await API.chartOfAccounts({ active: 'true' });
    const expenseAccounts = accounts.filter(a => a.account_type === 'expense' || a.account_type === 'revenue');
    const options = expenseAccounts.map(a => `<option value="${a.id}">${a.account_number} - ${Utils.escapeHtml(a.name)} (${a.account_type})</option>`).join('');

    const now = new Date();
    const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });

    const html = `
      <div class="form-group">
        <label class="form-label">Account</label>
        <select class="form-input" id="bud-acct">${options}</select>
      </div>
      <div class="grid grid-2 gap-md">
        <div class="form-group">
          <label class="form-label">Budget Amount ($)</label>
          <input class="form-input" type="number" step="0.01" id="bud-amount" placeholder="0.00">
        </div>
        <div class="form-group">
          <label class="form-label">Budget Name</label>
          <input class="form-input" id="bud-name" placeholder="e.g. ${monthName} Food Cost" value="${monthName} Budget">
        </div>
      </div>`;
    const modal = await UI.modal('Set Budget', html, { confirmText: 'Save Budget' });
    if (!modal) return;
    try {
      await API.createBudget({
        account_id: parseInt(modal.querySelector('#bud-acct').value),
        amount: parseFloat(modal.querySelector('#bud-amount').value),
        name: modal.querySelector('#bud-name').value,
      });
      UI.toast('Success', 'Budget saved', 'success');
      this.loadTab(document.getElementById('acct-content'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  // ============================================================
  // FISCAL PERIODS
  // ============================================================
  async renderPeriods(el) {
    const periods = await API.fiscalPeriods().catch(() => []);

    el.innerHTML = `
      <div class="flex items-center justify-between mb-md">
        <div>
          <h3 style="margin-bottom:2px">Fiscal Periods</h3>
          <span class="text-muted text-sm">Manage accounting periods for month/quarter/year-end close</span>
        </div>
        <button class="btn btn-primary" onclick="AccountingModule.showAddPeriod()">+ New Period</button>
      </div>

      <div class="card">
        <div class="card-body" style="padding:0">
          ${periods.length === 0 ? `
            <div style="text-align:center;padding:40px">
              <div style="font-size:48px;margin-bottom:12px;opacity:0.3">FP</div>
              <h3 style="margin-bottom:8px">No Fiscal Periods</h3>
              <p class="text-muted">Create fiscal periods to organize your accounting by month, quarter, or year.</p>
              <button class="btn btn-primary" onclick="AccountingModule.showAddPeriod()" style="margin-top:12px">+ Create Period</button>
            </div>
          ` : `
            <table style="width:100%;border-collapse:collapse">
              <thead>
                <tr style="border-bottom:2px solid var(--border-color)">
                  <th style="text-align:left;padding:12px 16px;font-weight:600">Period Name</th>
                  <th style="text-align:left;padding:12px 16px;font-weight:600">Type</th>
                  <th style="text-align:left;padding:12px 16px;font-weight:600">Start</th>
                  <th style="text-align:left;padding:12px 16px;font-weight:600">End</th>
                  <th style="text-align:center;padding:12px 16px;font-weight:600">Status</th>
                  <th style="text-align:right;padding:12px 16px;font-weight:600">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${periods.map(p => `
                  <tr style="border-bottom:1px solid var(--border-color)">
                    <td style="padding:10px 16px;font-weight:500">${Utils.escapeHtml(p.name)}</td>
                    <td style="padding:10px 16px"><span class="badge badge-secondary" style="text-transform:capitalize">${p.period_type}</span></td>
                    <td style="padding:10px 16px">${p.start_date}</td>
                    <td style="padding:10px 16px">${p.end_date}</td>
                    <td style="text-align:center;padding:10px 16px">
                      <span class="badge badge-${p.status === 'open' ? 'success' : p.status === 'closed' ? 'secondary' : 'warning'}">${p.status}</span>
                    </td>
                    <td style="text-align:right;padding:10px 16px">
                      ${p.status === 'open' ? `
                        <button class="btn btn-sm btn-secondary" onclick="AccountingModule.closePeriod(${p.id})" style="padding:4px 10px">Close Period</button>
                      ` : `
                        <span class="text-muted text-sm">Closed ${p.closed_at ? p.closed_at.slice(0, 10) : ''}</span>
                      `}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </div>
      </div>`;
  },

  async showAddPeriod() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });

    const html = `
      <div class="form-group">
        <label class="form-label">Period Name</label>
        <input class="form-input" id="fp-name" value="${monthName}" placeholder="e.g. March 2026">
      </div>
      <div class="form-group">
        <label class="form-label">Period Type</label>
        <select class="form-input" id="fp-type">
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
          <option value="annual">Annual</option>
        </select>
      </div>
      <div class="grid grid-2 gap-md">
        <div class="form-group">
          <label class="form-label">Start Date</label>
          <input class="form-input" type="date" id="fp-start" value="${startOfMonth}">
        </div>
        <div class="form-group">
          <label class="form-label">End Date</label>
          <input class="form-input" type="date" id="fp-end" value="${endOfMonth}">
        </div>
      </div>`;
    const modal = await UI.modal('New Fiscal Period', html, { confirmText: 'Create Period' });
    if (!modal) return;
    try {
      await API.createFiscalPeriod({
        name: modal.querySelector('#fp-name').value,
        period_type: modal.querySelector('#fp-type').value,
        start_date: modal.querySelector('#fp-start').value,
        end_date: modal.querySelector('#fp-end').value,
      });
      UI.toast('Success', 'Fiscal period created', 'success');
      this.loadTab(document.getElementById('acct-content'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async closePeriod(id) {
    if (!await UI.confirm('Close Period', 'Closing a fiscal period prevents new journal entries from being posted to it. This action cannot be undone. Continue?')) return;
    try {
      await API.closeFiscalPeriod(id);
      UI.toast('Period Closed', 'Fiscal period has been closed', 'success');
      this.loadTab(document.getElementById('acct-content'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  destroy() {},
};
