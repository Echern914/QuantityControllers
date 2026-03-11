/* ============================================================
   VENUECORE - POS Terminal Module
   ============================================================ */
const POSTerminal = {
  currentOrder: null,
  menuItems: [],
  categories: [],
  activeCategory: 'all',
  searchTerm: '',

  async render(container) {
    container.innerHTML = `<div class="pos-container">
      <div class="pos-menu">
        <div class="pos-categories" id="pos-categories"></div>
        <div class="pos-search">
          <div class="search-box">
            <span class="search-icon">\u2315</span>
            <input type="text" class="form-input" placeholder="Search menu..." id="pos-search" oninput="POSTerminal.onSearch(this.value)">
          </div>
        </div>
        <div class="pos-items-grid" id="pos-items-grid"></div>
      </div>
      <div class="pos-order">
        <div class="pos-order-header">
          <h3 id="order-title">No Order</h3>
          <button class="btn btn-sm btn-primary" onclick="POSTerminal.newOrder()">+ New</button>
        </div>
        <div class="pos-order-meta" id="order-meta"></div>
        <div class="pos-order-items" id="order-items">
          <div class="empty-state"><div class="empty-icon">--</div><h3>No items yet</h3><p>Tap menu items to add</p></div>
        </div>
        <div class="pos-order-totals" id="order-totals"></div>
        <div class="pos-order-actions" id="order-actions">
          <button class="pos-action-btn" onclick="POSTerminal.holdOrder()" disabled>Hold</button>
          <button class="pos-action-btn" onclick="POSTerminal.discountOrder()">Discount</button>
          <button class="pos-action-btn send" onclick="POSTerminal.sendToKitchen()" disabled>Send to Kitchen</button>
          <button class="pos-action-btn" onclick="POSTerminal.voidOrder()">Void</button>
          <button class="pos-action-btn pay" onclick="POSTerminal.openPayment()" disabled>Pay</button>
        </div>
      </div>
    </div>`;

    await this.loadMenu();
    this.renderCategories();
    this.renderMenuItems();
  },

  async loadMenu() {
    const [items, cats] = await Promise.all([API.menuActivePrices(), API.menuCategories()]);
    this.menuItems = items;
    this.categories = cats;
  },

  renderCategories() {
    const el = document.getElementById('pos-categories');
    el.innerHTML = `
      <button class="pos-category-btn ${this.activeCategory === 'all' ? 'active' : ''}" onclick="POSTerminal.filterCategory('all')">All</button>
      ${this.categories.map(c => `
        <button class="pos-category-btn ${this.activeCategory === c.id ? 'active' : ''}"
                style="${this.activeCategory === c.id ? `background:${c.color};border-color:${c.color}` : ''}"
                onclick="POSTerminal.filterCategory(${c.id})">${Utils.escapeHtml(c.name)}</button>
      `).join('')}
    `;
  },

  renderMenuItems() {
    const el = document.getElementById('pos-items-grid');
    let items = this.menuItems;

    if (this.activeCategory !== 'all') {
      items = items.filter(i => i.category_id === this.activeCategory);
    }
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      items = items.filter(i => i.name.toLowerCase().includes(term));
    }

    if (items.length === 0) {
      el.innerHTML = '<div class="empty-state"><p>No items found</p></div>';
      return;
    }

    el.innerHTML = items.map(item => `
      <button class="pos-item-btn ${item.is_86d ? 'is-86d' : ''}" onclick="POSTerminal.addItem(${item.id})"
              style="border-top: 3px solid ${item.category_color || '#6366f1'}">
        ${item.active_discount ? `<span class="pos-item-badge">${Utils.escapeHtml(item.active_discount)}</span>` : ''}
        <span class="pos-item-name">${Utils.escapeHtml(item.name)}</span>
        <span class="pos-item-price">${Utils.currency(item.price)}</span>
        ${item.original_price && item.original_price !== item.price ? `<span class="text-muted text-sm" style="text-decoration:line-through">${Utils.currency(item.original_price)}</span>` : ''}
      </button>
    `).join('');
  },

  filterCategory(catId) {
    this.activeCategory = catId;
    this.renderCategories();
    this.renderMenuItems();
  },

  onSearch(term) {
    this.searchTerm = term;
    this.renderMenuItems();
  },

  async newOrder() {
    try {
      const order = await API.createOrder({
        order_type: 'dine-in',
        employee_id: App.employee.id,
      });
      this.currentOrder = order;
      this.currentOrder.items = [];
      this.renderOrder();
      UI.toast('New Order', `Order #${order.order_number} created`, 'success');
    } catch (err) {
      UI.toast('Error', err.message, 'danger');
    }
  },

  async addItem(menuItemId) {
    if (!this.currentOrder) {
      await this.newOrder();
    }

    const menuItem = this.menuItems.find(i => i.id === menuItemId);
    if (!menuItem || menuItem.is_86d) return;

    try {
      const result = await API.addOrderItems(this.currentOrder.id, [{ menu_item_id: menuItemId, quantity: 1 }]);

      // Refresh order
      this.currentOrder = await API.getOrder(this.currentOrder.id);
      this.renderOrder();
    } catch (err) {
      UI.toast('Error', err.message, 'danger');
    }
  },

  renderOrder() {
    if (!this.currentOrder) return;
    const o = this.currentOrder;

    document.getElementById('order-title').innerHTML = `#${Utils.escapeHtml(o.order_number)} <span class="badge ${o.status === 'open' ? 'badge-info' : 'badge-success'}">${o.status}</span>`;

    document.getElementById('order-meta').innerHTML = `
      <span class="meta-item">${o.order_type}</span>
      ${o.table_name ? `<span class="meta-item">T: ${Utils.escapeHtml(o.table_name)}</span>` : ''}
      <span class="meta-item">S: ${Utils.escapeHtml(o.server_name || '')}</span>
    `;

    const items = o.items || [];
    const itemsEl = document.getElementById('order-items');

    if (items.length === 0) {
      itemsEl.innerHTML = '<div class="empty-state p-lg"><p class="text-muted">Add items from the menu</p></div>';
    } else {
      itemsEl.innerHTML = items.map(item => `
        <div class="pos-order-item ${item.voided ? 'voided' : ''}">
          <span class="item-qty">${item.quantity}x</span>
          <div class="item-details">
            <div class="item-name">${Utils.escapeHtml(item.name)}</div>
            ${item.special_instructions ? `<div class="item-mods">${Utils.escapeHtml(item.special_instructions)}</div>` : ''}
            ${item.modifiers && JSON.parse(item.modifiers || '[]').length ? `<div class="item-mods">${JSON.parse(item.modifiers).map(m => m.name).join(', ')}</div>` : ''}
          </div>
          <span class="item-price">${Utils.currency(item.unit_price * item.quantity)}</span>
          <div class="item-actions">
            <button class="item-action-btn" onclick="POSTerminal.changeQty(${item.id}, ${item.quantity + 1})">+</button>
            <button class="item-action-btn" onclick="POSTerminal.changeQty(${item.id}, ${Math.max(0, item.quantity - 1)})">-</button>
            <button class="item-action-btn danger" onclick="POSTerminal.voidItem(${item.id})">x</button>
          </div>
        </div>
      `).join('');
    }

    document.getElementById('order-totals').innerHTML = `
      <div class="pos-total-row"><span>Subtotal</span><span>${Utils.currency(o.subtotal)}</span></div>
      ${o.discount > 0 ? `<div class="pos-total-row discount"><span>Discount</span><span>-${Utils.currency(o.discount)}</span></div>` : ''}
      <div class="pos-total-row"><span>Tax</span><span>${Utils.currency(o.tax)}</span></div>
      <div class="pos-total-row grand-total"><span>Total</span><span>${Utils.currency(o.total)}</span></div>
    `;

    // Enable/disable buttons
    const hasItems = items.filter(i => !i.voided).length > 0;
    const hasPendingItems = items.some(i => i.status === 'pending' && !i.voided);
    document.querySelectorAll('.pos-action-btn.send')[0].disabled = !hasPendingItems;
    document.querySelectorAll('.pos-action-btn.pay')[0].disabled = !hasItems || o.payment_status === 'paid';
  },

  async changeQty(itemId, newQty) {
    if (newQty <= 0) return this.voidItem(itemId);
    try {
      await API.updateOrderItem(this.currentOrder.id, itemId, { quantity: newQty });
      this.currentOrder = await API.getOrder(this.currentOrder.id);
      this.renderOrder();
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async voidItem(itemId) {
    try {
      await API.updateOrderItem(this.currentOrder.id, itemId, { voided: true, void_reason: 'Removed' });
      this.currentOrder = await API.getOrder(this.currentOrder.id);
      this.renderOrder();
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async sendToKitchen() {
    if (!this.currentOrder) return;
    try {
      const result = await API.sendToKitchen(this.currentOrder.id);
      this.currentOrder = await API.getOrder(this.currentOrder.id);
      this.renderOrder();
      UI.toast('Sent', `${result.sent} items sent to kitchen`, 'success');
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async openPayment() {
    if (!this.currentOrder) return;
    const o = this.currentOrder;

    const html = `
      <div class="payment-amount">
        <div class="amount-label">Amount Due</div>
        <div class="amount-value">${Utils.currency(o.total)}</div>
      </div>
      <div class="payment-grid">
        <button class="payment-method-btn" onclick="POSTerminal.processPayment('cash')" id="pay-cash">
          <div class="pay-icon">$</div>
          <div class="pay-label">Cash</div>
        </button>
        <button class="payment-method-btn" onclick="POSTerminal.processPayment('card')" id="pay-card">
          <div class="pay-icon">\u25A1</div>
          <div class="pay-label">Card</div>
        </button>
        <button class="payment-method-btn" onclick="POSTerminal.splitPayment()">
          <div class="pay-icon">\u2702</div>
          <div class="pay-label">Split</div>
        </button>
        <button class="payment-method-btn" onclick="POSTerminal.openTabForOrder()">
          <div class="pay-icon">\u2261</div>
          <div class="pay-label">Tab</div>
        </button>
      </div>
      <div class="form-group">
        <label class="form-label">Tip Amount</label>
        <input type="number" class="form-input" id="tip-amount" value="0" min="0" step="0.01">
      </div>
    `;

    await UI.modal('Payment', html, { footer: false, size: 'lg' });
  },

  async processPayment(method) {
    const tipEl = document.getElementById('tip-amount');
    const tip = parseFloat(tipEl?.value || '0');

    try {
      const result = await API.payOrder(this.currentOrder.id, [{
        method,
        amount: this.currentOrder.total,
        tip,
      }]);

      document.querySelector('.modal-overlay')?.remove();

      if (result.payment_status === 'paid') {
        UI.toast('Payment Complete', `Order #${this.currentOrder.order_number} - ${Utils.currency(this.currentOrder.total)}`, 'success');
        this.currentOrder = null;
        document.getElementById('order-title').textContent = 'No Order';
        document.getElementById('order-meta').innerHTML = '';
        document.getElementById('order-items').innerHTML = '<div class="empty-state"><div class="empty-icon">--</div><h3>No items yet</h3><p>Tap menu items to add</p></div>';
        document.getElementById('order-totals').innerHTML = '';
      } else {
        this.currentOrder = await API.getOrder(this.currentOrder.id);
        this.renderOrder();
        UI.toast('Partial Payment', `${Utils.currency(result.remaining)} remaining`, 'warning');
      }
    } catch (err) { UI.toast('Payment Error', err.message, 'danger'); }
  },

  async splitPayment() {
    const numWays = await UI.prompt('Split Check', 'Number of ways to split:', '2');
    if (!numWays) return;

    try {
      const result = await API.splitOrder(this.currentOrder.id, 'even', parseInt(numWays));
      let html = '<div class="flex flex-col gap-md">';
      for (const check of result.checks) {
        html += `<div class="card"><div class="card-body flex justify-between items-center">
          <span class="font-bold">Check #${check.checkNumber}</span>
          <span class="text-xl font-bold">${Utils.currency(check.amount)}</span>
        </div></div>`;
      }
      html += '</div>';

      document.querySelector('.modal-overlay')?.remove();
      await UI.modal(`Split ${numWays} Ways`, html, { confirmText: 'Process All', size: 'lg' });
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async discountOrder() {
    if (!this.currentOrder) return;
    const html = `
      <div class="form-group">
        <label class="form-label">Discount Type</label>
        <select class="form-select" id="discount-type">
          <option value="percent">Percentage</option>
          <option value="fixed">Fixed Amount</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Value</label>
        <input type="number" class="form-input" id="discount-value" placeholder="e.g. 10" min="0">
      </div>
      <div class="form-group">
        <label class="form-label">Reason</label>
        <input type="text" class="form-input" id="discount-reason" placeholder="e.g. Manager comp">
      </div>
    `;

    const modal = await UI.modal('Apply Discount', html, { confirmText: 'Apply' });
    if (!modal) return;

    const type = modal.querySelector('#discount-type').value;
    const value = parseFloat(modal.querySelector('#discount-value').value);
    const reason = modal.querySelector('#discount-reason').value;

    try {
      await API.discountOrder(this.currentOrder.id, type, value, reason);
      this.currentOrder = await API.getOrder(this.currentOrder.id);
      this.renderOrder();
      UI.toast('Discount Applied', '', 'success');
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async voidOrder() {
    if (!this.currentOrder) return;
    const reason = await UI.prompt('Void Order', 'Reason for voiding:');
    if (!reason) return;

    try {
      await API.voidOrder(this.currentOrder.id, reason);
      UI.toast('Order Voided', `#${this.currentOrder.order_number}`, 'warning');
      this.currentOrder = null;
      document.getElementById('order-title').textContent = 'No Order';
      document.getElementById('order-items').innerHTML = '<div class="empty-state"><div class="empty-icon">--</div><h3>No items yet</h3></div>';
      document.getElementById('order-totals').innerHTML = '';
      document.getElementById('order-meta').innerHTML = '';
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  holdOrder() {
    this.currentOrder = null;
    document.getElementById('order-title').textContent = 'No Order';
    document.getElementById('order-items').innerHTML = '<div class="empty-state"><div class="empty-icon">--</div><h3>No items yet</h3><p>Tap menu items to add</p></div>';
    document.getElementById('order-totals').innerHTML = '';
    document.getElementById('order-meta').innerHTML = '';
    UI.toast('Order Held', 'You can resume it from the open orders', 'info');
  },

  async openTabForOrder() {
    if (!this.currentOrder) return;
    const name = await UI.prompt('Open Tab', 'Tab name:', `Tab - ${this.currentOrder.order_number}`);
    if (!name) return;

    try {
      await API.openTab({ name, employee_id: App.employee.id });
      document.querySelector('.modal-overlay')?.remove();
      UI.toast('Tab Opened', name, 'success');
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  destroy() {}
};
