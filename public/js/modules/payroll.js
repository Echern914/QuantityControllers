/* ============================================================
   VENUECORE - Payroll Module
   Payroll processing, tip management, tax withholdings
   ============================================================ */
const PayrollModule = {
  tab: 'overview',

  async render(container) {
    container.innerHTML = `
      <div class="animate-fade">
        <div class="module-tabs" id="pay-tabs">
          <button class="tab-btn active" data-tab="overview">Overview</button>
          <button class="tab-btn" data-tab="runs">Payroll Runs</button>
          <button class="tab-btn" data-tab="tips">Tip Pools</button>
          <button class="tab-btn" data-tab="taxes">Tax Rates</button>
        </div>
        <div id="pay-content"></div>
      </div>`;
    container.querySelector('#pay-tabs').addEventListener('click', e => {
      if (e.target.classList.contains('tab-btn')) {
        container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.tab = e.target.dataset.tab;
        this.loadTab(container.querySelector('#pay-content'));
      }
    });
    this.loadTab(container.querySelector('#pay-content'));
  },

  async loadTab(el) {
    UI.loading(el);
    try {
      switch (this.tab) {
        case 'overview': return await this.renderOverview(el);
        case 'runs': return await this.renderRuns(el);
        case 'tips': return await this.renderTips(el);
        case 'taxes': return await this.renderTaxes(el);
      }
    } catch (err) { el.innerHTML = `<div class="empty-state"><p>${Utils.escapeHtml(err.message)}</p></div>`; }
  },

  async renderOverview(el) {
    const summary = await API.payrollSummary();
    const s = summary.summary || {};
    el.innerHTML = `
      <div class="grid grid-4 gap-md mb-md">
        ${UI.statCard('Total Gross Pay', Utils.currency(s.total_gross || 0), '$')}
        ${UI.statCard('Total Net Pay', Utils.currency(s.total_net || 0), '\u2713')}
        ${UI.statCard('Total Deductions', Utils.currency(s.total_deductions || 0), '\u2212')}
        ${UI.statCard('Total Tips', Utils.currency(s.total_tips || 0), '\u2605')}
      </div>
      <div class="grid grid-2 gap-md">
        <div class="card">
          <div class="card-header flex items-center justify-between">
            <h3>Quick Actions</h3>
          </div>
          <div class="card-body">
            <button class="btn btn-primary btn-block mb-sm" onclick="PayrollModule.showRunPayroll()">Run Payroll</button>
            <button class="btn btn-secondary btn-block mb-sm" onclick="PayrollModule.showPoolTips()">Pool Tips for Today</button>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h3>Top Earners (Last 90 Days)</h3></div>
          <div class="card-body" style="padding:0;max-height:300px;overflow-y:auto">
            ${(summary.by_employee || []).length === 0 ? '<p class="text-muted text-sm" style="padding:20px;text-align:center">No payroll data yet</p>' :
              UI.table([
                { label: 'Employee', key: r => `${r.first_name} ${r.last_name}`, render: v => v },
                { label: 'Role', key: 'role' },
                { label: 'Hours', key: r => +((r.total_regular_hours || 0) + (r.total_ot_hours || 0)).toFixed(1), render: v => v, align: 'right' },
                { label: 'Gross', key: 'total_gross', render: v => Utils.currency(v || 0), align: 'right' },
                { label: 'Tips', key: 'total_tips', render: v => Utils.currency(v || 0), align: 'right' },
              ], summary.by_employee.slice(0, 10))}
          </div>
        </div>
      </div>`;
  },

  async renderRuns(el) {
    const runs = await API.payrollRuns();
    el.innerHTML = `
      <div class="flex items-center justify-between mb-md">
        <h3>${runs.length} Payroll Runs</h3>
        <button class="btn btn-primary btn-sm" onclick="PayrollModule.showRunPayroll()">+ Run Payroll</button>
      </div>
      <div class="card"><div class="card-body" style="padding:0">
        ${runs.length === 0 ? '<p class="text-muted text-sm" style="padding:20px;text-align:center">No payroll runs yet</p>' :
          UI.table([
            { label: 'Period', key: r => `${r.pay_period_start} to ${r.pay_period_end}`, render: v => v },
            { label: 'Pay Date', key: 'pay_date' },
            { label: 'Employees', key: 'employee_count', align: 'right' },
            { label: 'Gross', key: 'total_gross', render: v => Utils.currency(v), align: 'right' },
            { label: 'Net', key: 'total_net', render: v => Utils.currency(v), align: 'right' },
            { label: 'Status', key: 'status', render: v => `<span class="badge badge-${v === 'processed' ? 'success' : v === 'approved' ? 'info' : 'warning'}">${v}</span>` },
            { label: 'Actions', key: r => r, render: (v) => {
              if (v.status === 'draft') return `<button class="btn btn-sm btn-success" onclick="PayrollModule.approveRun(${v.id})">Approve</button>`;
              if (v.status === 'approved') return `<button class="btn btn-sm btn-primary" onclick="PayrollModule.processRun(${v.id})">Process</button>`;
              return '<span class="text-muted text-sm">Complete</span>';
            }},
          ], runs)}
      </div></div>`;
  },

  async showRunPayroll() {
    const today = new Date();
    const start = new Date(today); start.setDate(start.getDate() - 14);
    const html = `
      <div class="grid grid-3 gap-sm">
        <div class="form-group"><label class="form-label">Period Start</label><input class="form-input" type="date" id="pr-start" value="${start.toISOString().slice(0, 10)}"></div>
        <div class="form-group"><label class="form-label">Period End</label><input class="form-input" type="date" id="pr-end" value="${today.toISOString().slice(0, 10)}"></div>
        <div class="form-group"><label class="form-label">Pay Date</label><input class="form-input" type="date" id="pr-pay" value="${today.toISOString().slice(0, 10)}"></div>
      </div>
      <p class="text-muted text-sm">This will calculate payroll for all employees with time entries in this period.</p>`;
    const modal = await UI.modal('Run Payroll', html, { confirmText: 'Calculate Payroll' });
    if (!modal) return;
    try {
      const result = await API.createPayrollRun({
        pay_period_start: modal.querySelector('#pr-start').value,
        pay_period_end: modal.querySelector('#pr-end').value,
        pay_date: modal.querySelector('#pr-pay').value,
      });
      UI.toast('Payroll Calculated', `${result.employee_count} employees, Gross: ${Utils.currency(result.total_gross)}`, 'success');
      this.tab = 'runs'; this.loadTab(document.getElementById('pay-content'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async approveRun(id) {
    try { await API.approvePayroll(id); UI.toast('Approved', 'Payroll approved', 'success'); this.loadTab(document.getElementById('pay-content')); }
    catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async processRun(id) {
    if (!await UI.confirm('Process Payroll', 'This will finalize the payroll run. Continue?')) return;
    try { await API.processPayroll(id); UI.toast('Processed', 'Payroll processed', 'success'); this.loadTab(document.getElementById('pay-content')); }
    catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async renderTips(el) {
    const pools = await API.tipPools();
    el.innerHTML = `
      <div class="flex items-center justify-between mb-md">
        <h3>Tip Pools</h3>
        <button class="btn btn-primary btn-sm" onclick="PayrollModule.showPoolTips()">+ Pool Today's Tips</button>
      </div>
      <div class="card"><div class="card-body" style="padding:0">
        ${pools.length === 0 ? '<p class="text-muted text-sm" style="padding:20px;text-align:center">No tip pools yet</p>' :
          UI.table([
            { label: 'Date', key: 'pool_date' },
            { label: 'Shift', key: 'shift' },
            { label: 'Total Tips', key: 'total_tips', render: v => Utils.currency(v), align: 'right' },
            { label: 'Total Hours', key: 'total_hours', render: v => v?.toFixed(1), align: 'right' },
            { label: '$/Hour', key: 'rate_per_hour', render: v => Utils.currency(v), align: 'right' },
            { label: 'Status', key: 'status', render: v => `<span class="badge badge-${v === 'distributed' ? 'success' : 'warning'}">${v}</span>` },
          ], pools)}
      </div></div>`;
  },

  async showPoolTips() {
    try {
      const result = await API.createTipPool({ pool_date: new Date().toISOString().slice(0, 10) });
      if (result.distributions) {
        UI.toast('Tips Pooled', `${Utils.currency(result.total_tips)} distributed to ${result.distributions.length} staff`, 'success');
      } else {
        UI.toast('Info', result.message, 'info');
      }
      this.loadTab(document.getElementById('pay-content'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async renderTaxes(el) {
    const rates = await API.taxRates();
    el.innerHTML = `
      <div class="card">
        <div class="card-header"><h3>Tax Rates</h3></div>
        <div class="card-body" style="padding:0">
          ${UI.table([
            { label: 'Tax', key: 'name' },
            { label: 'Type', key: 'rate_type' },
            { label: 'Rate', key: 'rate', render: v => (v * 100).toFixed(2) + '%', align: 'right' },
            { label: 'Employer Match', key: 'employer_match', render: v => v > 0 ? (v * 100).toFixed(2) + '%' : '-', align: 'right' },
          ], rates)}
        </div>
      </div>`;
  },

  destroy() {},
};
