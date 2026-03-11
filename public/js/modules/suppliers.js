const SuppliersModule = {
  _suppliers: [],
  _tab: 'suppliers',

  async render(container) {
    const [suppliers, pos] = await Promise.all([API.suppliers(), API.purchaseOrders()]);
    this._suppliers = suppliers;

    const pendingPOs = pos.filter(p => p.status === 'pending' || p.status === 'ordered');
    const totalOwed = pos.filter(p => p.status !== 'received' && p.status !== 'cancelled').reduce((s, p) => s + (p.total_cost || 0), 0);

    container.innerHTML = `<div class="animate-fade">
      <div class="grid grid-4 gap-md mb-md">
        ${UI.statCard('Suppliers', suppliers.length, '')}
        ${UI.statCard('Open POs', pendingPOs.length, '')}
        ${UI.statCard('Total Outstanding', Utils.currency(totalOwed), '')}
        ${UI.statCard('All POs', pos.length, '')}
      </div>
      <div class="flex justify-between items-center mb-md">
        <div class="tabs">
          <button class="tab ${this._tab === 'suppliers' ? 'active' : ''}" onclick="SuppliersModule.showTab('suppliers')">Suppliers (${suppliers.length})</button>
          <button class="tab ${this._tab === 'po' ? 'active' : ''}" onclick="SuppliersModule.showTab('po')">Purchase Orders (${pos.length})</button>
        </div>
        <div class="flex gap-sm">
          <button class="btn btn-primary" onclick="SuppliersModule.addSupplier()">+ Supplier</button>
          <button class="btn btn-secondary" onclick="SuppliersModule.createPO()">+ Purchase Order</button>
        </div>
      </div>
      <div id="sup-content"></div>
    </div>`;

    this.showTab(this._tab);
  },

  async showTab(tab) {
    this._tab = tab;
    document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', (tab === 'suppliers' && i === 0) || (tab === 'po' && i === 1)));
    const content = document.getElementById('sup-content');
    if (!content) return;

    if (tab === 'po') {
      const pos = await API.purchaseOrders();
      content.innerHTML = `<div class="card"><div class="card-body" style="overflow-x:auto">${UI.table([
        { label: 'PO #', key: 'order_number', render: v => `<strong>${Utils.escapeHtml(v || '-')}</strong>` },
        { label: 'Supplier', key: 'supplier_name' },
        { label: 'Items', key: 'item_count', align: 'center', render: v => v || '-' },
        { label: 'Total', key: 'total_cost', align: 'right', render: v => Utils.currency(v) },
        { label: 'Status', key: 'status', render: v => Utils.statusBadge(v) },
        { label: 'Ordered', key: 'ordered_at', render: v => Utils.formatDate(v) },
        { label: 'Expected', key: 'expected_delivery', render: v => v ? Utils.formatDate(v) : '-' },
        { label: '', key: r => r, render: (_, r) => `<div class="flex gap-xs">
          ${r.status === 'ordered' ? `<button class="btn btn-success btn-sm" onclick="SuppliersModule.receivePO(${r.id})">Receive</button>` : ''}
        </div>` },
      ], pos, { emptyMessage: 'No purchase orders' })}</div></div>`;
    } else {
      content.innerHTML = `<div class="card"><div class="card-body" style="overflow-x:auto">${UI.table([
        { label: 'Name', key: 'name', render: (v, r) => `<div class="font-medium">${Utils.escapeHtml(v)}</div><div class="text-sm text-muted">${Utils.escapeHtml(r.contact_name || '')}</div>` },
        { label: 'Email', key: 'email', render: v => v ? Utils.escapeHtml(v) : '-' },
        { label: 'Phone', key: 'phone', render: v => v ? Utils.escapeHtml(v) : '-' },
        { label: 'Terms', key: 'payment_terms', render: v => v || '-' },
        { label: 'Address', key: 'address', render: v => v ? `<span class="text-sm">${Utils.escapeHtml(v)}</span>` : '-' },
        { label: '', key: r => r, render: (_, r) => `<div class="flex gap-xs">
          <button class="btn btn-ghost btn-sm" onclick="SuppliersModule.editSupplier(${r.id})">Edit</button>
          <button class="btn btn-secondary btn-sm" onclick="SuppliersModule.createPOForSupplier(${r.id})">+ PO</button>
        </div>` },
      ], this._suppliers, { emptyMessage: 'No suppliers yet' })}</div></div>`;
    }
  },

  _supplierFormHtml(sup) {
    return `
      <div class="form-group"><label class="form-label">Company Name *</label><input class="form-input" id="s-name" value="${Utils.escapeHtml(sup?.name || '')}"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Contact Person</label><input class="form-input" id="s-contact" value="${Utils.escapeHtml(sup?.contact_name || '')}"></div>
        <div class="form-group"><label class="form-label">Email</label><input type="email" class="form-input" id="s-email" value="${Utils.escapeHtml(sup?.email || '')}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="s-phone" value="${Utils.escapeHtml(sup?.phone || '')}"></div>
        <div class="form-group"><label class="form-label">Payment Terms</label><input class="form-input" id="s-terms" value="${Utils.escapeHtml(sup?.payment_terms || 'Net 30')}"></div>
      </div>
      <div class="form-group"><label class="form-label">Address</label><input class="form-input" id="s-addr" value="${Utils.escapeHtml(sup?.address || '')}"></div>
      <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="s-notes" rows="2">${Utils.escapeHtml(sup?.notes || '')}</textarea></div>
    `;
  },

  _getSupplierData(modal) {
    return {
      name: modal.querySelector('#s-name').value.trim(),
      contact_name: modal.querySelector('#s-contact').value.trim(),
      email: modal.querySelector('#s-email').value.trim(),
      phone: modal.querySelector('#s-phone').value.trim(),
      payment_terms: modal.querySelector('#s-terms').value.trim(),
      address: modal.querySelector('#s-addr').value.trim(),
      notes: modal.querySelector('#s-notes').value.trim(),
    };
  },

  async addSupplier() {
    const modal = await UI.modal('Add Supplier', this._supplierFormHtml(null), { confirmText: 'Create' });
    if (!modal) return;
    const data = this._getSupplierData(modal);
    if (!data.name) { UI.toast('Error', 'Company name is required', 'danger'); return; }
    try {
      await API.createSupplier(data);
      UI.toast('Supplier Added', '', 'success');
      this.render(document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async editSupplier(id) {
    const sup = this._suppliers.find(s => s.id === id);
    if (!sup) return;
    const modal = await UI.modal(`Edit - ${sup.name}`, this._supplierFormHtml(sup), { confirmText: 'Save Changes' });
    if (!modal) return;
    const data = this._getSupplierData(modal);
    if (!data.name) { UI.toast('Error', 'Company name is required', 'danger'); return; }
    try {
      await API.updateSupplier(id, data);
      UI.toast('Updated', `${data.name} has been updated`, 'success');
      this.render(document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async createPOForSupplier(supplierId) {
    this._preselectedSupplier = supplierId;
    await this.createPO();
    this._preselectedSupplier = null;
  },

  async createPO() {
    const [suppliers, ingredients] = await Promise.all([API.suppliers(), API.ingredients()]);
    const preselected = this._preselectedSupplier || '';

    const html = `
      <div class="form-group"><label class="form-label">Supplier *</label><select class="form-select" id="po-sup">${suppliers.map(s => `<option value="${s.id}" ${s.id == preselected ? 'selected' : ''}>${Utils.escapeHtml(s.name)}</option>`).join('')}</select></div>
      <div class="form-group">
        <label class="form-label">Line Items</label>
        <div id="po-lines"></div>
        <button class="btn btn-ghost btn-sm" onclick="SuppliersModule._addPOLine()" style="margin-top:8px">+ Add Line</button>
      </div>
      <div class="form-group"><label class="form-label">Expected Delivery</label><input type="date" class="form-input" id="po-date"></div>
      <div class="text-sm text-muted" id="po-total" style="margin-top:8px">Total: $0.00</div>
    `;

    const modal = await UI.modal('Create Purchase Order', html, { confirmText: 'Create PO', size: 'lg' });
    // Add initial line
    setTimeout(() => this._addPOLine(), 50);
    if (!modal) return;

    const lineEls = modal.querySelectorAll('.po-line-row');
    const items = [];
    lineEls.forEach(row => {
      const ingId = row.querySelector('.po-ing').value;
      const qty = parseFloat(row.querySelector('.po-qty').value);
      const cost = parseFloat(row.querySelector('.po-cost').value);
      if (ingId && qty > 0) {
        items.push({ ingredient_id: parseInt(ingId), quantity_ordered: qty, unit_cost: cost || 0 });
      }
    });

    if (items.length === 0) { UI.toast('Error', 'Add at least one line item', 'danger'); return; }
    try {
      await API.createPO({
        supplier_id: parseInt(modal.querySelector('#po-sup').value),
        ordered_by: App.employee?.id,
        items,
        expected_delivery: modal.querySelector('#po-date').value,
      });
      UI.toast('PO Created', `${items.length} item(s) ordered`, 'success');
      this._tab = 'po';
      this.render(document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  _poIngredients: null,
  async _addPOLine() {
    if (!this._poIngredients) this._poIngredients = await API.ingredients();
    const container = document.getElementById('po-lines');
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'po-line-row form-row';
    row.style.marginBottom = '8px';
    row.innerHTML = `
      <div class="form-group" style="flex:3"><select class="form-select po-ing"><option value="">Select ingredient...</option>${this._poIngredients.map(i => `<option value="${i.id}">${Utils.escapeHtml(i.name)} (${i.unit})</option>`).join('')}</select></div>
      <div class="form-group" style="flex:1"><input type="number" class="form-input po-qty" placeholder="Qty" step="0.01" oninput="SuppliersModule._updatePOTotal()"></div>
      <div class="form-group" style="flex:1"><input type="number" class="form-input po-cost" placeholder="Unit $" step="0.01" oninput="SuppliersModule._updatePOTotal()"></div>
      <button class="btn btn-ghost btn-sm text-danger" onclick="this.parentElement.remove(); SuppliersModule._updatePOTotal()" style="align-self:flex-end;margin-bottom:4px">X</button>
    `;
    container.appendChild(row);
  },

  _updatePOTotal() {
    const rows = document.querySelectorAll('.po-line-row');
    let total = 0;
    rows.forEach(row => {
      const qty = parseFloat(row.querySelector('.po-qty').value) || 0;
      const cost = parseFloat(row.querySelector('.po-cost').value) || 0;
      total += qty * cost;
    });
    const el = document.getElementById('po-total');
    if (el) el.textContent = `Total: ${Utils.currency(total)}`;
  },

  async receivePO(id) {
    if (!(await UI.confirm('Receive PO', 'Mark this purchase order as received? This will update inventory.'))) return;
    try {
      await API.receivePO(id, []);
      UI.toast('PO Received', 'Inventory updated', 'success');
      this.showTab('po');
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  destroy() { this._poIngredients = null; }
};
