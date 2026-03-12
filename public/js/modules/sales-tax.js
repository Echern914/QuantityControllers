/* ============================================================
   VENUECORE - Sales Tax Management Module
   State-aware tax tracking, reporting & filing management
   ============================================================ */
const SalesTaxModule = {
  tab: 'dashboard',
  config: null,
  states: [],

  async render(container) {
    container.innerHTML = `
      <div class="animate-fade">
        <div class="module-tabs" id="tax-tabs">
          <button class="tab-btn active" data-tab="dashboard">Dashboard</button>
          <button class="tab-btn" data-tab="collected">Tax Collected</button>
          <button class="tab-btn" data-tab="filings">Filings</button>
          <button class="tab-btn" data-tab="config">Configuration</button>
          <button class="tab-btn" data-tab="reports">Reports</button>
        </div>
        <div id="tax-content"></div>
      </div>`;
    container.querySelector('#tax-tabs').addEventListener('click', e => {
      if (e.target.classList.contains('tab-btn')) {
        container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.tab = e.target.dataset.tab;
        this.loadTab(container.querySelector('#tax-content'));
      }
    });
    this.loadTab(container.querySelector('#tax-content'));
  },

  async loadTab(el) {
    UI.loading(el);
    try {
      switch (this.tab) {
        case 'dashboard': return await this.renderDashboard(el);
        case 'collected': return await this.renderCollected(el);
        case 'filings': return await this.renderFilings(el);
        case 'config': return await this.renderConfig(el);
        case 'reports': return await this.renderReports(el);
      }
    } catch (err) {
      el.innerHTML = `<div class="empty-state"><p>${Utils.escapeHtml(err.message)}</p></div>`;
    }
  },

  // ---- DASHBOARD ----
  async renderDashboard(el) {
    const data = await API.get('/api/sales-tax/dashboard');

    if (!data.config) {
      el.innerHTML = `
        <div class="empty-state" style="padding:60px 20px">
          <div style="font-size:48px;margin-bottom:16px">🏛️</div>
          <h2 style="margin:0 0 8px">Set Up Sales Tax</h2>
          <p style="color:var(--text-secondary);margin:0 0 24px;max-width:400px">Select your state to automatically apply the correct tax rates, rules, and filing deadlines for your business.</p>
          <button class="btn-primary" onclick="document.querySelector('[data-tab=config]').click()">Configure State Tax</button>
        </div>`;
      return;
    }

    const c = data.config;
    const nextDeadline = this.getNextDeadline(data.deadlines);

    el.innerHTML = `
      <div class="tax-dashboard">
        <!-- State Badge -->
        <div class="tax-state-badge">
          <div class="tax-state-flag">${c.state_code}</div>
          <div>
            <div class="tax-state-name">${Utils.escapeHtml(c.state_name)}</div>
            <div class="tax-state-rate">Combined Rate: ${(c.combined_rate * 100).toFixed(2)}%</div>
          </div>
          ${nextDeadline ? `<div class="tax-deadline-badge ${this.deadlineUrgency(nextDeadline)}">
            <div class="tax-deadline-label">Next Filing Due</div>
            <div class="tax-deadline-date">${this.formatDate(nextDeadline)}</div>
          </div>` : ''}
        </div>

        <!-- Summary Cards -->
        <div class="tax-summary-grid">
          <div class="tax-card">
            <div class="tax-card-label">Today</div>
            <div class="tax-card-value">${Utils.money(data.today.tax)}</div>
            <div class="tax-card-sub">${data.today.transactions} transactions &middot; ${Utils.money(data.today.sales)} sales</div>
          </div>
          <div class="tax-card">
            <div class="tax-card-label">This Month</div>
            <div class="tax-card-value">${Utils.money(data.month.tax)}</div>
            <div class="tax-card-sub">${data.month.transactions} transactions &middot; ${Utils.money(data.month.sales)} sales</div>
          </div>
          <div class="tax-card">
            <div class="tax-card-label">This Quarter</div>
            <div class="tax-card-value">${Utils.money(data.quarter.tax)}</div>
            <div class="tax-card-sub">${data.quarter.transactions} transactions &middot; ${Utils.money(data.quarter.sales)} sales</div>
          </div>
          <div class="tax-card accent">
            <div class="tax-card-label">Year to Date</div>
            <div class="tax-card-value">${Utils.money(data.year.tax)}</div>
            <div class="tax-card-sub">${data.year.transactions} transactions &middot; ${Utils.money(data.year.sales)} sales</div>
          </div>
        </div>

        <!-- Rate Breakdown -->
        <div class="tax-section-grid">
          <div class="tax-section">
            <h3 class="tax-section-title">Rate Breakdown</h3>
            <div class="tax-rate-bars">
              <div class="tax-rate-row">
                <span>State (${c.state_code})</span>
                <div class="tax-rate-bar-track">
                  <div class="tax-rate-bar" style="width:${(c.state_rate / c.combined_rate * 100)}%;background:#6366f1"></div>
                </div>
                <span class="tax-rate-pct">${(c.state_rate * 100).toFixed(2)}%</span>
              </div>
              ${c.county_rate > 0 ? `<div class="tax-rate-row">
                <span>County${c.county_name ? ` (${Utils.escapeHtml(c.county_name)})` : ''}</span>
                <div class="tax-rate-bar-track">
                  <div class="tax-rate-bar" style="width:${(c.county_rate / c.combined_rate * 100)}%;background:#f59e0b"></div>
                </div>
                <span class="tax-rate-pct">${(c.county_rate * 100).toFixed(2)}%</span>
              </div>` : ''}
              ${c.city_rate > 0 ? `<div class="tax-rate-row">
                <span>City${c.city_name ? ` (${Utils.escapeHtml(c.city_name)})` : ''}</span>
                <div class="tax-rate-bar-track">
                  <div class="tax-rate-bar" style="width:${(c.city_rate / c.combined_rate * 100)}%;background:#06b6d4"></div>
                </div>
                <span class="tax-rate-pct">${(c.city_rate * 100).toFixed(2)}%</span>
              </div>` : ''}
              ${c.special_district_rate > 0 ? `<div class="tax-rate-row">
                <span>Special District</span>
                <div class="tax-rate-bar-track">
                  <div class="tax-rate-bar" style="width:${(c.special_district_rate / c.combined_rate * 100)}%;background:#10b981"></div>
                </div>
                <span class="tax-rate-pct">${(c.special_district_rate * 100).toFixed(2)}%</span>
              </div>` : ''}
            </div>
          </div>

          <div class="tax-section">
            <h3 class="tax-section-title">Tax by Category (This Month)</h3>
            <div class="tax-category-list">
              ${this.categoryRow('Food & Meals', data.categoryBreakdown.food_tax, data.month.tax)}
              ${this.categoryRow('Beverages', data.categoryBreakdown.beverage_tax, data.month.tax)}
              ${this.categoryRow('Alcohol', data.categoryBreakdown.alcohol_tax, data.month.tax)}
              ${this.categoryRow('Other', data.categoryBreakdown.other_tax, data.month.tax)}
            </div>
          </div>
        </div>

        <!-- Monthly Trend -->
        ${data.trend.length > 0 ? `
        <div class="tax-section">
          <h3 class="tax-section-title">Monthly Tax Trend</h3>
          <div class="tax-trend-chart">
            ${data.trend.map(t => {
              const maxTax = Math.max(...data.trend.map(x => x.tax));
              const pct = maxTax > 0 ? (t.tax / maxTax * 100) : 0;
              return `<div class="tax-trend-bar-wrap">
                <div class="tax-trend-amount">${Utils.money(t.tax)}</div>
                <div class="tax-trend-bar" style="height:${Math.max(pct, 4)}%"></div>
                <div class="tax-trend-label">${t.month.slice(5)}</div>
              </div>`;
            }).join('')}
          </div>
        </div>` : ''}

        <!-- Recent Filings -->
        ${data.recentFilings.length > 0 ? `
        <div class="tax-section">
          <h3 class="tax-section-title">Recent Filings</h3>
          <table class="data-table">
            <thead><tr><th>Period</th><th>Status</th><th>Tax Due</th><th>Due Date</th></tr></thead>
            <tbody>
              ${data.recentFilings.map(f => `
                <tr>
                  <td>${f.period_start} to ${f.period_end}</td>
                  <td><span class="status-badge status-${f.status}">${f.status}</span></td>
                  <td>${Utils.money(f.total_tax_due)}</td>
                  <td>${f.due_date || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>` : ''}
      </div>`;
  },

  categoryRow(label, amount, total) {
    const pct = total > 0 ? (amount / total * 100) : 0;
    return `<div class="tax-cat-row">
      <span class="tax-cat-label">${label}</span>
      <div class="tax-cat-bar-track">
        <div class="tax-cat-bar" style="width:${pct}%"></div>
      </div>
      <span class="tax-cat-amount">${Utils.money(amount)}</span>
    </div>`;
  },

  // ---- TAX COLLECTED ----
  async renderCollected(el) {
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const today = now.toISOString().slice(0, 10);

    el.innerHTML = `
      <div class="tax-collected">
        <div class="tax-filter-bar">
          <div class="filter-group">
            <label>Period:</label>
            <select id="tax-period-select">
              <option value="month" selected>This Month</option>
              <option value="week">This Week</option>
              <option value="quarter">This Quarter</option>
              <option value="year">This Year</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>
          <div class="filter-group" id="custom-date-range" style="display:none">
            <input type="date" id="tax-start" value="${monthStart}" />
            <span>to</span>
            <input type="date" id="tax-end" value="${today}" />
            <button class="btn-sm" onclick="SalesTaxModule.loadCollectedData()">Apply</button>
          </div>
        </div>
        <div id="tax-collected-content"></div>
      </div>`;

    el.querySelector('#tax-period-select').addEventListener('change', (e) => {
      const customRange = el.querySelector('#custom-date-range');
      customRange.style.display = e.target.value === 'custom' ? 'flex' : 'none';
      if (e.target.value !== 'custom') this.loadCollectedData();
    });

    this.loadCollectedData();
  },

  async loadCollectedData() {
    const period = document.getElementById('tax-period-select').value;
    const contentEl = document.getElementById('tax-collected-content');
    UI.loading(contentEl);

    let params = `period=${period}`;
    if (period === 'custom') {
      const start = document.getElementById('tax-start').value;
      const end = document.getElementById('tax-end').value;
      params = `start=${start}&end=${end}`;
    }

    const data = await API.get(`/api/sales-tax/collected?${params}`);
    const s = data.summary;

    contentEl.innerHTML = `
      <div class="tax-summary-grid" style="margin-bottom:20px">
        <div class="tax-card compact">
          <div class="tax-card-label">Gross Sales</div>
          <div class="tax-card-value">${Utils.money(s.total_sales)}</div>
        </div>
        <div class="tax-card compact">
          <div class="tax-card-label">Total Tax Collected</div>
          <div class="tax-card-value">${Utils.money(s.total_tax_collected)}</div>
        </div>
        <div class="tax-card compact">
          <div class="tax-card-label">State Portion</div>
          <div class="tax-card-value">${Utils.money(s.total_state_portion)}</div>
        </div>
        <div class="tax-card compact">
          <div class="tax-card-label">Local Portions</div>
          <div class="tax-card-value">${Utils.money(s.total_county_portion + s.total_city_portion + s.total_special_portion)}</div>
        </div>
      </div>

      <!-- Daily Breakdown Chart -->
      ${data.daily.length > 0 ? `
      <div class="tax-section">
        <h3 class="tax-section-title">Daily Tax Collected</h3>
        <div class="tax-daily-chart">
          ${data.daily.map(d => {
            const maxTax = Math.max(...data.daily.map(x => x.tax));
            const pct = maxTax > 0 ? (d.tax / maxTax * 100) : 0;
            return `<div class="tax-daily-bar-wrap" title="${d.sale_date}: ${Utils.money(d.tax)} tax on ${Utils.money(d.sales)} sales">
              <div class="tax-daily-bar" style="height:${Math.max(pct, 3)}%"></div>
              <div class="tax-daily-label">${d.sale_date.slice(5)}</div>
            </div>`;
          }).join('')}
        </div>
      </div>` : ''}

      <!-- Transaction Table -->
      <div class="tax-section">
        <h3 class="tax-section-title">Transactions (${s.transaction_count})</h3>
        ${data.records.length > 0 ? `
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Order</th>
                <th>Subtotal</th>
                <th>Food Tax</th>
                <th>Bev Tax</th>
                <th>Alcohol Tax</th>
                <th>Total Tax</th>
                <th>Rate</th>
              </tr>
            </thead>
            <tbody>
              ${data.records.slice(0, 100).map(r => `
                <tr>
                  <td>${r.sale_date}</td>
                  <td>${Utils.escapeHtml(r.order_number || '-')}</td>
                  <td>${Utils.money(r.subtotal)}</td>
                  <td>${Utils.money(r.food_tax)}</td>
                  <td>${Utils.money(r.beverage_tax)}</td>
                  <td>${Utils.money(r.alcohol_tax)}</td>
                  <td><strong>${Utils.money(r.total_tax)}</strong></td>
                  <td>${(r.tax_rate * 100).toFixed(2)}%</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ${data.records.length > 100 ? `<p style="color:var(--text-secondary);text-align:center;margin-top:8px">Showing first 100 of ${data.records.length} records</p>` : ''}
        ` : '<div class="empty-state"><p>No tax transactions found for this period.</p></div>'}
      </div>`;
  },

  // ---- FILINGS ----
  async renderFilings(el) {
    const filings = await API.get('/api/sales-tax/filings');
    const configResp = await API.get('/api/sales-tax/config');
    const hasConfig = configResp.config.length > 0;

    el.innerHTML = `
      <div class="tax-filings">
        <div class="section-header">
          <h3>Tax Filings & Returns</h3>
          ${hasConfig ? `<button class="btn-primary" onclick="SalesTaxModule.showGenerateFiling()">Generate Filing</button>` : ''}
        </div>

        ${filings.length > 0 ? `
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th>Period</th>
                <th>State</th>
                <th>Gross Sales</th>
                <th>Taxable Sales</th>
                <th>Tax Due</th>
                <th>Due Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${filings.map(f => `
                <tr>
                  <td>${f.period_start} to ${f.period_end}</td>
                  <td>${f.state_code}</td>
                  <td>${Utils.money(f.total_gross_sales)}</td>
                  <td>${Utils.money(f.total_taxable_sales)}</td>
                  <td><strong>${Utils.money(f.total_tax_due)}</strong></td>
                  <td>${f.due_date || '-'}</td>
                  <td><span class="status-badge status-${f.status}">${f.status}</span></td>
                  <td>
                    ${f.status === 'pending' ? `<button class="btn-xs" onclick="SalesTaxModule.markFiled(${f.id})">Mark Filed</button>` : ''}
                    ${f.status === 'filed' ? `<button class="btn-xs" onclick="SalesTaxModule.markPaid(${f.id})">Mark Paid</button>` : ''}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ` : `
        <div class="empty-state" style="padding:40px">
          <p>No filings yet. Generate a filing from your collected tax data to get started.</p>
        </div>
        `}
      </div>`;
  },

  async showGenerateFiling() {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const start = lastMonth.toISOString().slice(0, 10);
    const end = lastMonthEnd.toISOString().slice(0, 10);

    const html = `
      <div style="padding:8px 0">
        <p style="margin:0 0 16px;color:var(--text-secondary)">Generate a tax filing for a specific period. This will aggregate all tax collected during that time.</p>
        <div class="form-row">
          <div class="form-group"><label>Period Start</label><input type="date" id="filing-start" value="${start}" /></div>
          <div class="form-group"><label>Period End</label><input type="date" id="filing-end" value="${end}" /></div>
        </div>
      </div>`;

    UI.modal('Generate Tax Filing', html, [
      { text: 'Cancel', action: 'close' },
      { text: 'Generate', class: 'btn-primary', action: async () => {
        const period_start = document.getElementById('filing-start').value;
        const period_end = document.getElementById('filing-end').value;
        await API.post('/api/sales-tax/filings', { period_start, period_end });
        UI.closeModal();
        UI.toast('Filing generated');
        this.renderFilings(document.getElementById('tax-content'));
      }}
    ]);
  },

  async markFiled(id) {
    const today = new Date().toISOString().slice(0, 10);
    const html = `
      <div style="padding:8px 0">
        <div class="form-group"><label>Filed Date</label><input type="date" id="filed-date" value="${today}" /></div>
        <div class="form-group"><label>Confirmation Number</label><input type="text" id="filed-conf" placeholder="Optional" /></div>
        <div class="form-group"><label>Notes</label><textarea id="filed-notes" rows="2" placeholder="Optional notes"></textarea></div>
      </div>`;
    UI.modal('Mark as Filed', html, [
      { text: 'Cancel', action: 'close' },
      { text: 'Mark Filed', class: 'btn-primary', action: async () => {
        await API.patch(`/api/sales-tax/filings/${id}`, {
          status: 'filed',
          filed_date: document.getElementById('filed-date').value,
          confirmation_number: document.getElementById('filed-conf').value || null,
          notes: document.getElementById('filed-notes').value || null,
        });
        UI.closeModal();
        UI.toast('Filing marked as filed');
        this.renderFilings(document.getElementById('tax-content'));
      }}
    ]);
  },

  async markPaid(id) {
    await API.patch(`/api/sales-tax/filings/${id}`, { status: 'paid' });
    UI.toast('Filing marked as paid');
    this.renderFilings(document.getElementById('tax-content'));
  },

  // ---- CONFIGURATION ----
  async renderConfig(el) {
    const [configResp, states] = await Promise.all([
      API.get('/api/sales-tax/config'),
      API.get('/api/sales-tax/states'),
    ]);
    this.states = states;
    const activeConfig = configResp.config.find(c => c.active);

    el.innerHTML = `
      <div class="tax-config">
        <div class="tax-section">
          <h3 class="tax-section-title">Select Your State</h3>
          <p style="color:var(--text-secondary);margin:0 0 16px">Choose your state to automatically apply the correct sales tax rates and rules for your restaurant.</p>

          <div class="tax-state-selector">
            <select id="tax-state-select" class="tax-state-dropdown">
              <option value="">-- Select a State --</option>
              ${states.map(s => `<option value="${s.state_code}" ${activeConfig?.state_code === s.state_code ? 'selected' : ''}>${s.state_name} (${s.state_code}) - ${(s.base_sales_tax_rate * 100).toFixed(2)}% state rate</option>`).join('')}
            </select>
          </div>

          <div id="state-details"></div>
        </div>

        ${activeConfig ? `
        <div class="tax-section">
          <h3 class="tax-section-title">Local Tax Rates</h3>
          <p style="color:var(--text-secondary);margin:0 0 16px">Add your county, city, or special district rates if applicable.</p>
          <div class="form-row">
            <div class="form-group">
              <label>County Name</label>
              <input type="text" id="cfg-county" value="${activeConfig.county_name || ''}" placeholder="e.g. Cook County" />
            </div>
            <div class="form-group">
              <label>County Rate (%)</label>
              <input type="number" id="cfg-county-rate" value="${(activeConfig.county_rate * 100).toFixed(2)}" step="0.01" min="0" max="15" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>City Name</label>
              <input type="text" id="cfg-city" value="${activeConfig.city_name || ''}" placeholder="e.g. Chicago" />
            </div>
            <div class="form-group">
              <label>City Rate (%)</label>
              <input type="number" id="cfg-city-rate" value="${(activeConfig.city_rate * 100).toFixed(2)}" step="0.01" min="0" max="15" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Special District Rate (%)</label>
              <input type="number" id="cfg-special-rate" value="${(activeConfig.special_district_rate * 100).toFixed(2)}" step="0.01" min="0" max="10" />
            </div>
            <div class="form-group">
              <label>Filing Frequency</label>
              <select id="cfg-frequency">
                <option value="monthly" ${activeConfig.filing_frequency === 'monthly' ? 'selected' : ''}>Monthly</option>
                <option value="quarterly" ${activeConfig.filing_frequency === 'quarterly' ? 'selected' : ''}>Quarterly</option>
                <option value="annually" ${activeConfig.filing_frequency === 'annually' ? 'selected' : ''}>Annually</option>
              </select>
            </div>
          </div>
          <button class="btn-primary" onclick="SalesTaxModule.saveLocalRates(${activeConfig.id})">Save Local Rates</button>
        </div>

        <div class="tax-section">
          <h3 class="tax-section-title">Active Tax Rules</h3>
          <div class="tax-rules-list">
            ${configResp.rules.map(r => `
              <div class="tax-rule-card ${r.exempt ? 'exempt' : r.special_rate ? 'special' : ''}">
                <div class="tax-rule-type">${r.rule_type}</div>
                <div class="tax-rule-desc">${Utils.escapeHtml(r.description)}</div>
                ${r.notes ? `<div class="tax-rule-notes">${Utils.escapeHtml(r.notes)}</div>` : ''}
              </div>
            `).join('')}
          </div>
        </div>` : ''}
      </div>`;

    // State select handler
    el.querySelector('#tax-state-select').addEventListener('change', (e) => {
      this.showStateDetails(e.target.value);
    });

    if (activeConfig) {
      this.showStateDetails(activeConfig.state_code);
    }
  },

  showStateDetails(stateCode) {
    const detailEl = document.getElementById('state-details');
    if (!stateCode) { detailEl.innerHTML = ''; return; }

    const s = this.states.find(st => st.state_code === stateCode);
    if (!s) return;

    detailEl.innerHTML = `
      <div class="tax-state-detail-card">
        <div class="tax-state-detail-header">
          <div class="tax-state-detail-code">${s.state_code}</div>
          <div>
            <div class="tax-state-detail-name">${s.state_name}</div>
            <div class="tax-state-detail-rate">Base State Rate: ${(s.base_sales_tax_rate * 100).toFixed(2)}%</div>
          </div>
          <button class="btn-primary" onclick="SalesTaxModule.applyState('${s.state_code}')">Apply This State</button>
        </div>
        <div class="tax-state-detail-info">
          <div class="tax-info-row"><span>Average Combined Rate:</span><strong>${(s.avg_combined_rate * 100).toFixed(2)}%</strong></div>
          <div class="tax-info-row"><span>Max Local Add-on:</span><strong>${(s.max_local_rate * 100).toFixed(2)}%</strong></div>
          <div class="tax-info-row"><span>Prepared Food Taxed:</span><strong>${s.prepared_food_taxed ? 'Yes' : 'No'}</strong></div>
          <div class="tax-info-row"><span>Groceries Taxed:</span><strong>${s.grocery_taxed ? 'Yes' : 'No'}</strong></div>
          ${s.food_reduced_rate ? `<div class="tax-info-row"><span>Reduced Food Rate:</span><strong>${(s.food_reduced_rate * 100).toFixed(3)}%</strong></div>` : ''}
          ${s.alcohol_extra_rate > 0 ? `<div class="tax-info-row"><span>Alcohol Extra Tax:</span><strong>+${(s.alcohol_extra_rate * 100).toFixed(1)}%</strong></div>` : ''}
          <div class="tax-info-row"><span>Filing Options:</span><strong>${JSON.parse(s.filing_frequencies).join(', ')}</strong></div>
        </div>
        ${s.notes ? `<div class="tax-state-notes">${Utils.escapeHtml(s.notes)}</div>` : ''}
      </div>`;
  },

  async applyState(stateCode) {
    try {
      await API.post('/api/sales-tax/config', { state_code: stateCode });
      UI.toast(`${stateCode} tax configuration applied`);
      this.renderConfig(document.getElementById('tax-content'));
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  },

  async saveLocalRates(configId) {
    try {
      await API.put(`/api/sales-tax/config/${configId}`, {
        county_name: document.getElementById('cfg-county').value || null,
        county_rate: parseFloat(document.getElementById('cfg-county-rate').value) / 100 || 0,
        city_name: document.getElementById('cfg-city').value || null,
        city_rate: parseFloat(document.getElementById('cfg-city-rate').value) / 100 || 0,
        special_district_rate: parseFloat(document.getElementById('cfg-special-rate').value) / 100 || 0,
        filing_frequency: document.getElementById('cfg-frequency').value,
      });
      UI.toast('Local rates saved');
      this.renderConfig(document.getElementById('tax-content'));
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  },

  // ---- REPORTS ----
  async renderReports(el) {
    const now = new Date();
    const yearStart = `${now.getFullYear()}-01-01`;
    const today = now.toISOString().slice(0, 10);

    el.innerHTML = `
      <div class="tax-reports">
        <div class="tax-section">
          <h3 class="tax-section-title">Generate Tax Report</h3>
          <p style="color:var(--text-secondary);margin:0 0 16px">Generate a detailed tax report for any date range. Export as CSV for your accountant or tax preparer.</p>
          <div class="form-row">
            <div class="form-group"><label>Start Date</label><input type="date" id="report-start" value="${yearStart}" /></div>
            <div class="form-group"><label>End Date</label><input type="date" id="report-end" value="${today}" /></div>
            <div class="form-group" style="display:flex;align-items:flex-end;gap:8px">
              <button class="btn-primary" onclick="SalesTaxModule.generateReport()">Generate Report</button>
              <button class="btn-secondary" onclick="SalesTaxModule.exportCSV()">Export CSV</button>
            </div>
          </div>
        </div>
        <div id="report-output"></div>
      </div>`;
  },

  async generateReport() {
    const start = document.getElementById('report-start').value;
    const end = document.getElementById('report-end').value;
    const outputEl = document.getElementById('report-output');
    UI.loading(outputEl);

    const data = await API.get(`/api/sales-tax/report?start=${start}&end=${end}`);
    const s = data.summary;

    outputEl.innerHTML = `
      <div class="tax-report-output">
        <div class="tax-report-header">
          <h3>Sales Tax Report</h3>
          <p>${data.period.start} through ${data.period.end}</p>
          ${data.config ? `<p>${data.config.state_name} (${data.config.state_code}) &middot; Combined Rate: ${(data.config.combined_rate * 100).toFixed(2)}%</p>` : ''}
        </div>

        <div class="tax-summary-grid" style="margin-bottom:20px">
          <div class="tax-card compact">
            <div class="tax-card-label">Total Transactions</div>
            <div class="tax-card-value">${s.total_transactions}</div>
          </div>
          <div class="tax-card compact">
            <div class="tax-card-label">Gross Sales</div>
            <div class="tax-card-value">${Utils.money(s.gross_sales)}</div>
          </div>
          <div class="tax-card compact">
            <div class="tax-card-label">Total Tax Collected</div>
            <div class="tax-card-value">${Utils.money(s.total_tax)}</div>
          </div>
          <div class="tax-card compact accent">
            <div class="tax-card-label">Effective Rate</div>
            <div class="tax-card-value">${s.gross_sales > 0 ? ((s.total_tax / s.gross_sales) * 100).toFixed(2) : '0.00'}%</div>
          </div>
        </div>

        <div class="tax-section-grid">
          <div class="tax-section">
            <h4>By Category</h4>
            <table class="data-table compact">
              <tr><td>Food & Meals</td><td>${Utils.money(s.food_sales)}</td><td>${Utils.money(s.food_tax)}</td></tr>
              <tr><td>Beverages</td><td>${Utils.money(s.beverage_sales)}</td><td>${Utils.money(s.beverage_tax)}</td></tr>
              <tr><td>Alcohol</td><td>${Utils.money(s.alcohol_sales)}</td><td>${Utils.money(s.alcohol_tax)}</td></tr>
              <tr><td><strong>Total</strong></td><td><strong>${Utils.money(s.gross_sales)}</strong></td><td><strong>${Utils.money(s.total_tax)}</strong></td></tr>
            </table>
          </div>
          <div class="tax-section">
            <h4>By Jurisdiction</h4>
            <table class="data-table compact">
              <tr><td>State</td><td>${Utils.money(s.state_tax)}</td></tr>
              <tr><td>County</td><td>${Utils.money(s.county_tax)}</td></tr>
              <tr><td>City</td><td>${Utils.money(s.city_tax)}</td></tr>
              <tr><td>Special</td><td>${Utils.money(s.special_tax)}</td></tr>
              <tr><td><strong>Total</strong></td><td><strong>${Utils.money(s.total_tax)}</strong></td></tr>
            </table>
          </div>
        </div>

        ${data.monthly.length > 0 ? `
        <div class="tax-section">
          <h4>Monthly Summary</h4>
          <table class="data-table">
            <thead><tr><th>Month</th><th>Transactions</th><th>Sales</th><th>Tax</th><th>State</th><th>County</th><th>City</th></tr></thead>
            <tbody>
              ${data.monthly.map(m => `
                <tr>
                  <td>${m.month}</td>
                  <td>${m.transactions}</td>
                  <td>${Utils.money(m.sales)}</td>
                  <td><strong>${Utils.money(m.tax)}</strong></td>
                  <td>${Utils.money(m.state_tax)}</td>
                  <td>${Utils.money(m.county_tax)}</td>
                  <td>${Utils.money(m.city_tax)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>` : ''}
      </div>`;
  },

  exportCSV() {
    const start = document.getElementById('report-start').value;
    const end = document.getElementById('report-end').value;
    window.open(`/api/sales-tax/report?start=${start}&end=${end}&format=csv`, '_blank');
  },

  // ---- HELPERS ----
  getNextDeadline(deadlines) {
    if (!deadlines || !deadlines.length) return null;
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();

    // Find next upcoming deadline
    for (const d of deadlines) {
      if (d.month > currentMonth || (d.month === currentMonth && d.day_of_month >= currentDay)) {
        const year = now.getFullYear();
        return `${year}-${String(d.month).padStart(2, '0')}-${String(d.day_of_month).padStart(2, '0')}`;
      }
    }
    // Wrap to next year's first deadline
    const d = deadlines[0];
    return `${now.getFullYear() + 1}-${String(d.month).padStart(2, '0')}-${String(d.day_of_month).padStart(2, '0')}`;
  },

  deadlineUrgency(dateStr) {
    const diff = (new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24);
    if (diff < 0) return 'overdue';
    if (diff < 7) return 'urgent';
    if (diff < 14) return 'soon';
    return '';
  },

  formatDate(dateStr) {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  },
};
