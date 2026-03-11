const SuppliersModule = {
  async render(container) {
    const [suppliers, pos] = await Promise.all([API.suppliers(), API.purchaseOrders()]);
    container.innerHTML = `<div class="animate-fade">
      <div class="flex justify-between items-center mb-md">
        <div class="tabs"><button class="tab active" onclick="SuppliersModule.showTab('suppliers')">Suppliers</button><button class="tab" onclick="SuppliersModule.showTab('po')">Purchase Orders (${pos.length})</button></div>
        <div class="flex gap-sm">
          <button class="btn btn-primary" onclick="SuppliersModule.addSupplier()">+ Supplier</button>
          <button class="btn btn-secondary" onclick="SuppliersModule.createPO()">+ Purchase Order</button>
        </div>
      </div>
      <div id="sup-content">
        <div class="card"><div class="card-body" style="overflow-x:auto">
          ${UI.table([
            { label: 'Name', key: 'name', render: (v, r) => `<div class="font-medium">${Utils.escapeHtml(v)}</div><div class="text-sm text-muted">${Utils.escapeHtml(r.contact_name || '')}</div>` },
            { label: 'Email', key: 'email' },
            { label: 'Phone', key: 'phone' },
            { label: 'Terms', key: 'payment_terms' },
            { label: '', key: r => r, render: (_, r) => `<button class="btn btn-ghost btn-sm" onclick="SuppliersModule.editSupplier(${r.id})">Edit</button>` },
          ], suppliers, { emptyMessage: 'No suppliers yet' })}
        </div></div>
      </div>
    </div>`;
  },

  async showTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    const content = document.getElementById('sup-content');
    if (tab === 'po') {
      const pos = await API.purchaseOrders();
      content.innerHTML = `<div class="card"><div class="card-body">${UI.table([
        { label: 'PO #', key: 'order_number', render: v => `<strong>${Utils.escapeHtml(v || '-')}</strong>` },
        { label: 'Supplier', key: 'supplier_name' },
        { label: 'Total', key: 'total_cost', render: v => Utils.currency(v) },
        { label: 'Status', key: 'status', render: v => Utils.statusBadge(v) },
        { label: 'Ordered', key: 'ordered_at', render: v => Utils.formatDate(v) },
        { label: 'Expected', key: 'expected_delivery', render: v => Utils.formatDate(v) },
      ], pos, { emptyMessage: 'No purchase orders' })}</div></div>`;
    } else {
      this.render(document.getElementById('main-body'));
    }
  },

  async addSupplier() {
    const html = `
      <div class="form-group"><label class="form-label">Company Name</label><input class="form-input" id="s-name"></div>
      <div class="form-row"><div class="form-group"><label class="form-label">Contact</label><input class="form-input" id="s-contact"></div>
      <div class="form-group"><label class="form-label">Email</label><input class="form-input" id="s-email"></div></div>
      <div class="form-row"><div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="s-phone"></div>
      <div class="form-group"><label class="form-label">Payment Terms</label><input class="form-input" id="s-terms" value="Net 30"></div></div>
      <div class="form-group"><label class="form-label">Address</label><input class="form-input" id="s-addr"></div>
    `;
    const modal = await UI.modal('Add Supplier', html, { confirmText: 'Create' });
    if (!modal) return;
    try {
      await API.createSupplier({ name: modal.querySelector('#s-name').value, contact_name: modal.querySelector('#s-contact').value, email: modal.querySelector('#s-email').value, phone: modal.querySelector('#s-phone').value, payment_terms: modal.querySelector('#s-terms').value, address: modal.querySelector('#s-addr').value });
      UI.toast('Supplier Added', '', 'success');
      this.render(document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async createPO() {
    const [suppliers, ingredients] = await Promise.all([API.suppliers(), API.ingredients()]);
    const html = `
      <div class="form-group"><label class="form-label">Supplier</label><select class="form-select" id="po-sup">${suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">Ingredient</label><select class="form-select" id="po-ing">${ingredients.map(i => `<option value="${i.id}">${i.name}</option>`).join('')}</select></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Qty</label><input type="number" class="form-input" id="po-qty" step="0.01"></div>
        <div class="form-group"><label class="form-label">Unit Cost</label><input type="number" class="form-input" id="po-cost" step="0.01"></div>
      </div>
      <div class="form-group"><label class="form-label">Expected Delivery</label><input type="date" class="form-input" id="po-date"></div>
    `;
    const modal = await UI.modal('Create Purchase Order', html, { confirmText: 'Create PO' });
    if (!modal) return;
    try {
      await API.createPO({
        supplier_id: parseInt(modal.querySelector('#po-sup').value),
        ordered_by: App.employee?.id,
        items: [{ ingredient_id: parseInt(modal.querySelector('#po-ing').value), quantity_ordered: parseFloat(modal.querySelector('#po-qty').value), unit_cost: parseFloat(modal.querySelector('#po-cost').value) }],
        expected_delivery: modal.querySelector('#po-date').value,
      });
      UI.toast('PO Created', '', 'success');
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  editSupplier() { UI.toast('Edit', 'Edit supplier modal', 'info'); },
  destroy() {}
};
