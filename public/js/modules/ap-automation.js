/* ============================================================
   VENUECORE - Accounts Payable Automation Module
   ============================================================ */
const APModule = {
  tab: 'dashboard',

  async render(container) {
    container.innerHTML = `
      <div class="animate-fade">
        <div class="module-tabs" id="ap-tabs">
          <button class="tab-btn active" data-tab="dashboard">Dashboard</button>
          <button class="tab-btn" data-tab="invoices">Invoices</button>
          <button class="tab-btn" data-tab="aging">Aging Report</button>
        </div>
        <div id="ap-content"></div>
      </div>`;
    container.querySelector('#ap-tabs').addEventListener('click', e => {
      if (e.target.classList.contains('tab-btn')) {
        container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.tab = e.target.dataset.tab;
        this.loadTab(container.querySelector('#ap-content'));
      }
    });
    this.loadTab(container.querySelector('#ap-content'));
  },

  async loadTab(el) {
    UI.loading(el);
    try {
      switch (this.tab) {
        case 'dashboard': return await this.renderDashboard(el);
        case 'invoices': return await this.renderInvoices(el);
        case 'aging': return await this.renderAging(el);
      }
    } catch (err) { el.innerHTML = `<div class="empty-state"><p>${Utils.escapeHtml(err.message)}</p></div>`; }
  },

  async renderDashboard(el) {
    const d = await API.apDashboard();
    el.innerHTML = `
      <div class="grid grid-4 gap-md mb-md">
        ${UI.statCard('Pending Approval', d.pending_approval?.count || 0, '')}
        ${UI.statCard('Unpaid', Utils.currency(d.unpaid?.total || 0), '$')}
        ${UI.statCard('Overdue', Utils.currency(d.overdue?.total || 0), '')}
        ${UI.statCard('Due This Week', Utils.currency(d.due_soon?.total || 0), '')}
      </div>
      <div class="grid grid-2 gap-md">
        <div class="card">
          <div class="card-header flex items-center justify-between">
            <h3>Quick Actions</h3>
          </div>
          <div class="card-body">
            <button class="btn btn-primary btn-block mb-sm" onclick="APModule.showNewInvoice()">+ New Invoice</button>
            <button class="btn btn-secondary btn-block" onclick="APModule.tab='aging';document.querySelector('[data-tab=aging]').click()">View Aging Report</button>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h3>Top Suppliers (90 Days)</h3></div>
          <div class="card-body" style="padding:0;max-height:300px;overflow-y:auto">
            ${(d.top_suppliers || []).length === 0 ? '<p class="text-muted text-sm" style="padding:20px;text-align:center">No invoice data</p>' :
              UI.table([
                { label: 'Supplier', key: 'name' },
                { label: 'Invoices', key: 'invoice_count', align: 'right' },
                { label: 'Billed', key: 'total_billed', render: v => Utils.currency(v), align: 'right' },
                { label: 'Outstanding', key: 'outstanding', render: v => Utils.currency(v), align: 'right' },
              ], d.top_suppliers)}
          </div>
        </div>
      </div>`;
  },

  async renderInvoices(el) {
    const invoices = await API.apInvoices();
    el.innerHTML = `
      <div class="flex items-center justify-between mb-md">
        <h3>${invoices.length} Invoices</h3>
        <button class="btn btn-primary btn-sm" onclick="APModule.showNewInvoice()">+ New Invoice</button>
      </div>
      <div class="card"><div class="card-body" style="padding:0">
        ${invoices.length === 0 ? '<p class="text-muted text-sm" style="padding:20px;text-align:center">No invoices yet</p>' :
          UI.table([
            { label: 'Invoice #', key: 'invoice_number' },
            { label: 'Supplier', key: 'supplier_name' },
            { label: 'Date', key: 'invoice_date' },
            { label: 'Due', key: 'due_date' },
            { label: 'Total', key: 'total', render: v => Utils.currency(v), align: 'right' },
            { label: 'Balance', key: 'balance_due', render: v => Utils.currency(v), align: 'right' },
            { label: 'Approval', key: 'approval_status', render: v => `<span class="badge badge-${v === 'approved' ? 'success' : v === 'rejected' ? 'danger' : 'warning'}">${v}</span>` },
            { label: 'Status', key: 'status', render: v => `<span class="badge badge-${v === 'paid' ? 'success' : v === 'partial' ? 'info' : 'secondary'}">${v}</span>` },
            { label: 'Actions', key: r => r, render: (v) => {
              const btns = [];
              if (v.approval_status === 'pending') btns.push(`<button class="btn btn-sm btn-success" onclick="APModule.approve(${v.id})">Approve</button>`);
              if (v.approval_status === 'approved' && v.status !== 'paid') btns.push(`<button class="btn btn-sm btn-primary" onclick="APModule.pay(${v.id})">Pay</button>`);
              return btns.join(' ') || '-';
            }},
          ], invoices)}
      </div></div>`;
  },

  async showNewInvoice() {
    const suppliers = await API.suppliers();
    const supplierOpts = suppliers.map(s => `<option value="${s.id}">${Utils.escapeHtml(s.name)}</option>`).join('');
    const today = new Date().toISOString().slice(0, 10);
    const due = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const html = `
      <div class="grid grid-2 gap-sm">
        <div class="form-group"><label class="form-label">Supplier</label><select class="form-input" id="ap-supplier">${supplierOpts}</select></div>
        <div class="form-group"><label class="form-label">Invoice #</label><input class="form-input" id="ap-num" placeholder="INV-001"></div>
        <div class="form-group"><label class="form-label">Invoice Date</label><input class="form-input" type="date" id="ap-date" value="${today}"></div>
        <div class="form-group"><label class="form-label">Due Date</label><input class="form-input" type="date" id="ap-due" value="${due}"></div>
        <div class="form-group"><label class="form-label">Subtotal</label><input class="form-input" type="number" step="0.01" id="ap-subtotal"></div>
        <div class="form-group"><label class="form-label">Tax</label><input class="form-input" type="number" step="0.01" id="ap-tax" value="0"></div>
      </div>
      <div class="form-group"><label class="form-label">Notes</label><input class="form-input" id="ap-notes"></div>`;
    const modal = await UI.modal('New AP Invoice', html, { confirmText: 'Create Invoice', size: 'lg' });
    if (!modal) return;
    try {
      const subtotal = parseFloat(modal.querySelector('#ap-subtotal').value) || 0;
      const tax = parseFloat(modal.querySelector('#ap-tax').value) || 0;
      await API.createApInvoice({
        invoice_number: modal.querySelector('#ap-num').value,
        supplier_id: parseInt(modal.querySelector('#ap-supplier').value),
        invoice_date: modal.querySelector('#ap-date').value,
        due_date: modal.querySelector('#ap-due').value,
        subtotal, tax, total: subtotal + tax,
        notes: modal.querySelector('#ap-notes').value,
      });
      UI.toast('Success', 'Invoice created', 'success');
      this.loadTab(document.getElementById('ap-content'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async approve(id) {
    try { await API.approveApInvoice(id); UI.toast('Approved', 'Invoice approved', 'success'); this.loadTab(document.getElementById('ap-content')); }
    catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async pay(id) {
    if (!await UI.confirm('Pay Invoice', 'Record payment for this invoice?')) return;
    try { const r = await API.payApInvoice(id, {}); UI.toast('Paid', r.message, 'success'); this.loadTab(document.getElementById('ap-content')); }
    catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async renderAging(el) {
    const aging = await API.apAging();
    const bucketNames = { current: 'Current', days_1_30: '1-30 Days', days_31_60: '31-60 Days', days_61_90: '61-90 Days', days_over_90: '90+ Days' };
    const bucketColors = { current: '#27ae60', days_1_30: '#f39c12', days_31_60: '#e67e22', days_61_90: '#e74c3c', days_over_90: '#c0392b' };

    el.innerHTML = `
      <div class="grid grid-5 gap-md mb-md">
        ${Object.entries(bucketNames).map(([key, label]) => UI.statCard(label, Utils.currency(aging.totals?.[key] || 0), '')).join('')}
      </div>
      <div class="card mb-md">
        <div class="card-header flex items-center justify-between"><h3>Total Outstanding</h3><span class="font-bold" style="font-size:20px">${Utils.currency(aging.total_outstanding || 0)}</span></div>
        <div class="card-body">
          <div class="flex gap-sm" style="height:24px;border-radius:6px;overflow:hidden">
            ${Object.entries(bucketNames).map(([key]) => {
              const pct = aging.total_outstanding > 0 ? ((aging.totals?.[key] || 0) / aging.total_outstanding * 100) : 0;
              return pct > 0 ? `<div style="width:${pct}%;background:${bucketColors[key]}" title="${bucketNames[key]}: ${Utils.currency(aging.totals?.[key] || 0)}"></div>` : '';
            }).join('')}
          </div>
          <div class="flex gap-md mt-sm" style="font-size:11px">
            ${Object.entries(bucketNames).map(([key, label]) => `<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${bucketColors[key]};margin-right:4px"></span>${label}</span>`).join('')}
          </div>
        </div>
      </div>`;
  },

  destroy() {},
};
