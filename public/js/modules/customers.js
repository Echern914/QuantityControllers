const CustomersModule = {
  async render(container) {
    const customers = await API.customers();
    container.innerHTML = `<div class="animate-fade">
      <div class="flex justify-between items-center mb-md">
        <div class="search-box" style="width:300px"><span class="search-icon">\u2315</span><input class="form-input" placeholder="Search customers..." id="cust-search" oninput="CustomersModule.search(this.value)"></div>
        <div class="flex gap-sm">
          <button class="btn btn-primary" onclick="CustomersModule.addCustomer()">+ Add Customer</button>
          <button class="btn btn-secondary" onclick="CustomersModule.showBirthdays()">Birthdays</button>
        </div>
      </div>
      <div class="card"><div class="card-body" style="overflow-x:auto" id="cust-table">
        ${this.renderTable(customers)}
      </div></div>
    </div>`;
  },

  renderTable(customers) {
    return UI.table([
      { label: 'Customer', key: r => r, render: (_, r) => `<div class="font-medium">${Utils.escapeHtml(r.first_name)} ${Utils.escapeHtml(r.last_name || '')}</div><div class="text-sm text-muted">${Utils.escapeHtml(r.email || r.phone || '')}</div>` },
      { label: 'VIP', key: 'vip_tier', render: v => Utils.statusBadge(v) },
      { label: 'Points', key: 'loyalty_points', align: 'right', render: v => `<strong>${v.toLocaleString()}</strong>` },
      { label: 'Visits', key: 'total_visits', align: 'center' },
      { label: 'Total Spent', key: 'total_spent', align: 'right', render: v => Utils.currency(v) },
      { label: 'Last Visit', key: 'last_visit_at', render: v => v ? Utils.timeAgo(v) : 'Never' },
      { label: '', key: r => r, render: (_, r) => `<div class="flex gap-xs"><button class="btn btn-ghost btn-sm" onclick="CustomersModule.viewCustomer(${r.id})">View</button><button class="btn btn-ghost btn-sm" onclick="CustomersModule.editCustomer(${r.id})">Edit</button></div>` },
    ], customers, { emptyMessage: 'No customers yet' });
  },

  async search(term) {
    if (!term) { this.render(document.getElementById('main-body')); return; }
    const customers = await API.customers({ search: term });
    document.getElementById('cust-table').innerHTML = this.renderTable(customers);
  },

  async addCustomer() {
    const html = `
      <div class="form-row"><div class="form-group"><label class="form-label">First Name</label><input class="form-input" id="c-first"></div>
      <div class="form-group"><label class="form-label">Last Name</label><input class="form-input" id="c-last"></div></div>
      <div class="form-row"><div class="form-group"><label class="form-label">Email</label><input class="form-input" id="c-email"></div>
      <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="c-phone"></div></div>
      <div class="form-group"><label class="form-label">Birthday</label><input type="date" class="form-input" id="c-bday"></div>
      <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="c-notes"></textarea></div>
    `;
    const modal = await UI.modal('Add Customer', html, { confirmText: 'Create' });
    if (!modal) return;
    try {
      await API.createCustomer({ first_name: modal.querySelector('#c-first').value, last_name: modal.querySelector('#c-last').value, email: modal.querySelector('#c-email').value, phone: modal.querySelector('#c-phone').value, birthday: modal.querySelector('#c-bday').value, notes: modal.querySelector('#c-notes').value });
      UI.toast('Customer Added', '', 'success');
      this.render(document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async viewCustomer(id) {
    const c = await API.customer(id);
    const html = `
      <div class="grid grid-3 gap-md mb-md">
        ${UI.statCard('Loyalty Points', c.loyalty_points.toLocaleString(), '\u2606')}
        ${UI.statCard('Total Visits', c.total_visits, '#')}
        ${UI.statCard('Total Spent', Utils.currency(c.total_spent), '$')}
      </div>
      <div class="flex items-center gap-md mb-md">
        <span class="text-lg font-bold">${Utils.escapeHtml(c.first_name)} ${Utils.escapeHtml(c.last_name || '')}</span>
        ${Utils.statusBadge(c.vip_tier)}
      </div>
      <div class="text-sm text-secondary mb-sm">${c.email || ''} ${c.phone ? '| ' + c.phone : ''}</div>
      ${c.birthday ? `<div class="text-sm text-secondary mb-md">Birthday: ${Utils.formatDate(c.birthday)}</div>` : ''}
      <h4 class="mb-sm">Recent Orders</h4>
      ${c.recent_orders.length ? UI.table([
        { label: 'Order', key: 'order_number' },
        { label: 'Total', key: 'total', render: v => Utils.currency(v) },
        { label: 'Date', key: 'opened_at', render: v => Utils.formatDateTime(v) },
        { label: 'Status', key: 'status', render: v => Utils.statusBadge(v) },
      ], c.recent_orders) : '<p class="text-muted">No orders yet</p>'}
      <div class="flex gap-sm mt-md">
        <button class="btn btn-primary btn-sm" onclick="CustomersModule.addPoints(${c.id})">+ Add Points</button>
        <button class="btn btn-secondary btn-sm" onclick="CustomersModule.redeemPoints(${c.id})">Redeem Points</button>
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

  editCustomer(id) { this.viewCustomer(id); },
  destroy() {}
};
