const CustomersModule = {
  _customers: [],

  async render(container) {
    this._customers = await API.customers();

    const totalSpent = this._customers.reduce((s, c) => s + (c.total_spent || 0), 0);
    const vipCount = this._customers.filter(c => c.vip_tier && c.vip_tier !== 'none').length;

    container.innerHTML = `<div class="animate-fade">
      <div class="grid grid-4 gap-md mb-md">
        ${UI.statCard('Total Customers', this._customers.length, '')}
        ${UI.statCard('VIP Members', vipCount, '')}
        ${UI.statCard('Total Revenue', Utils.currency(totalSpent), '')}
        ${UI.statCard('Avg Spend', Utils.currency(this._customers.length ? totalSpent / this._customers.length : 0), '')}
      </div>
      <div class="flex justify-between items-center mb-md">
        <div class="search-box" style="width:300px"><input class="form-input" placeholder="Search customers..." id="cust-search" oninput="CustomersModule.search(this.value)"></div>
        <div class="flex gap-sm">
          <button class="btn btn-secondary" onclick="CustomersModule.showBirthdays()">Birthdays</button>
          <button class="btn btn-primary" onclick="CustomersModule.addCustomer()">+ Add Customer</button>
        </div>
      </div>
      <div class="card"><div class="card-body" style="overflow-x:auto" id="cust-table">
        ${this.renderTable(this._customers)}
      </div></div>
    </div>`;
  },

  renderTable(customers) {
    return UI.table([
      { label: 'Customer', key: r => r, render: (_, r) => `<div class="font-medium">${Utils.escapeHtml(r.first_name)} ${Utils.escapeHtml(r.last_name || '')}</div><div class="text-sm text-muted">${Utils.escapeHtml(r.email || r.phone || '')}</div>` },
      { label: 'VIP', key: 'vip_tier', render: v => Utils.statusBadge(v) },
      { label: 'Points', key: 'loyalty_points', align: 'right', render: v => `<strong>${(v || 0).toLocaleString()}</strong>` },
      { label: 'Visits', key: 'total_visits', align: 'center' },
      { label: 'Total Spent', key: 'total_spent', align: 'right', render: v => Utils.currency(v) },
      { label: 'Last Visit', key: 'last_visit_at', render: v => v ? Utils.timeAgo(v) : 'Never' },
      { label: '', key: r => r, render: (_, r) => `<div class="flex gap-xs">
        <button class="btn btn-ghost btn-sm" onclick="CustomersModule.viewCustomer(${r.id})">View</button>
        <button class="btn btn-ghost btn-sm" onclick="CustomersModule.editCustomer(${r.id})">Edit</button>
      </div>` },
    ], customers, { emptyMessage: 'No customers yet' });
  },

  async search(term) {
    if (!term) {
      document.getElementById('cust-table').innerHTML = this.renderTable(this._customers);
      return;
    }
    const filtered = this._customers.filter(c => {
      const searchable = `${c.first_name} ${c.last_name} ${c.email || ''} ${c.phone || ''}`.toLowerCase();
      return searchable.includes(term.toLowerCase());
    });
    document.getElementById('cust-table').innerHTML = this.renderTable(filtered);
  },

  _customerFormHtml(c) {
    return `
      <div class="form-row">
        <div class="form-group"><label class="form-label">First Name *</label><input class="form-input" id="c-first" value="${Utils.escapeHtml(c?.first_name || '')}"></div>
        <div class="form-group"><label class="form-label">Last Name</label><input class="form-input" id="c-last" value="${Utils.escapeHtml(c?.last_name || '')}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Email</label><input type="email" class="form-input" id="c-email" value="${Utils.escapeHtml(c?.email || '')}"></div>
        <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="c-phone" value="${Utils.escapeHtml(c?.phone || '')}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Birthday</label><input type="date" class="form-input" id="c-bday" value="${c?.birthday || ''}"></div>
        <div class="form-group"><label class="form-label">VIP Tier</label><select class="form-select" id="c-vip">
          <option value="none" ${(!c?.vip_tier || c?.vip_tier === 'none') ? 'selected' : ''}>None</option>
          <option value="bronze" ${c?.vip_tier === 'bronze' ? 'selected' : ''}>Bronze</option>
          <option value="silver" ${c?.vip_tier === 'silver' ? 'selected' : ''}>Silver</option>
          <option value="gold" ${c?.vip_tier === 'gold' ? 'selected' : ''}>Gold</option>
          <option value="platinum" ${c?.vip_tier === 'platinum' ? 'selected' : ''}>Platinum</option>
        </select></div>
      </div>
      <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="c-notes" rows="2">${Utils.escapeHtml(c?.notes || '')}</textarea></div>
    `;
  },

  _getCustomerData(modal) {
    return {
      first_name: modal.querySelector('#c-first').value.trim(),
      last_name: modal.querySelector('#c-last').value.trim(),
      email: modal.querySelector('#c-email').value.trim(),
      phone: modal.querySelector('#c-phone').value.trim(),
      birthday: modal.querySelector('#c-bday').value,
      vip_tier: modal.querySelector('#c-vip').value,
      notes: modal.querySelector('#c-notes').value.trim(),
    };
  },

  async addCustomer() {
    const modal = await UI.modal('Add Customer', this._customerFormHtml(null), { confirmText: 'Create' });
    if (!modal) return;
    const data = this._getCustomerData(modal);
    if (!data.first_name) { UI.toast('Error', 'First name is required', 'danger'); return; }
    try {
      await API.createCustomer(data);
      UI.toast('Customer Added', '', 'success');
      this.render(document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async editCustomer(id) {
    const c = this._customers.find(c => c.id === id) || await API.customer(id);
    const modal = await UI.modal(`Edit - ${c.first_name} ${c.last_name || ''}`, this._customerFormHtml(c), { confirmText: 'Save Changes' });
    if (!modal) return;
    const data = this._getCustomerData(modal);
    if (!data.first_name) { UI.toast('Error', 'First name is required', 'danger'); return; }
    try {
      await API.updateCustomer(id, data);
      UI.toast('Updated', `${data.first_name} has been updated`, 'success');
      this.render(document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async viewCustomer(id) {
    const c = await API.customer(id);
    const html = `
      <div class="grid grid-3 gap-md mb-md">
        ${UI.statCard('Loyalty Points', (c.loyalty_points || 0).toLocaleString(), '')}
        ${UI.statCard('Total Visits', c.total_visits || 0, '')}
        ${UI.statCard('Total Spent', Utils.currency(c.total_spent || 0), '')}
      </div>
      <div class="flex items-center gap-md mb-md">
        <span class="text-lg font-bold">${Utils.escapeHtml(c.first_name)} ${Utils.escapeHtml(c.last_name || '')}</span>
        ${c.vip_tier && c.vip_tier !== 'none' ? Utils.statusBadge(c.vip_tier) : ''}
      </div>
      <div class="text-sm text-secondary mb-sm">${c.email || ''} ${c.phone ? '| ' + c.phone : ''}</div>
      ${c.birthday ? `<div class="text-sm text-secondary mb-md">Birthday: ${Utils.formatDate(c.birthday)}</div>` : ''}
      ${c.notes ? `<div class="text-sm text-muted mb-md">Notes: ${Utils.escapeHtml(c.notes)}</div>` : ''}
      <h4 class="mb-sm">Recent Orders</h4>
      ${c.recent_orders && c.recent_orders.length ? UI.table([
        { label: 'Order', key: 'order_number' },
        { label: 'Total', key: 'total', render: v => Utils.currency(v) },
        { label: 'Date', key: 'opened_at', render: v => Utils.formatDateTime(v) },
        { label: 'Status', key: 'status', render: v => Utils.statusBadge(v) },
      ], c.recent_orders) : '<p class="text-muted">No orders yet</p>'}
      <div class="flex gap-sm mt-md">
        <button class="btn btn-primary btn-sm" onclick="CustomersModule.addPoints(${c.id})">+ Add Points</button>
        <button class="btn btn-secondary btn-sm" onclick="CustomersModule.redeemPoints(${c.id})">Redeem Points</button>
        <button class="btn btn-ghost btn-sm" onclick="CustomersModule.editCustomer(${c.id})">Edit Customer</button>
      </div>
    `;
    await UI.modal(`${c.first_name} ${c.last_name || ''}`, html, { footer: false, size: 'lg' });
  },

  async addPoints(id) {
    const points = await UI.prompt('Add Points', 'Points to add:');
    if (!points) return;
    try {
      const result = await API.addLoyalty(id, parseInt(points));
      UI.toast('Points Added', `New total: ${result.loyalty_points} (${result.vip_tier})`, 'success');
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async redeemPoints(id) {
    const points = await UI.prompt('Redeem Points', 'Points to redeem:');
    if (!points) return;
    try {
      const result = await API.redeemLoyalty(id, parseInt(points));
      UI.toast('Redeemed', `${Utils.currency(result.discount_amount)} discount`, 'success');
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async showBirthdays() {
    const birthdays = await API.upcomingBirthdays(30);
    const html = birthdays.length ? UI.table([
      { label: 'Name', key: r => r, render: (_, r) => `${r.first_name} ${r.last_name || ''}` },
      { label: 'Birthday', key: 'birthday', render: v => Utils.formatDate(v) },
      { label: 'VIP', key: 'vip_tier', render: v => Utils.statusBadge(v) },
    ], birthdays) : '<p class="text-muted text-center p-lg">No upcoming birthdays</p>';
    await UI.modal('Upcoming Birthdays (30 days)', html, { footer: false });
  },

  destroy() {}
};
