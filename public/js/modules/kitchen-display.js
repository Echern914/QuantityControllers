/* ============================================================
   VENUECORE - Kitchen Display System
   ============================================================ */
const KitchenDisplay = {
  refreshInterval: null,
  activeStation: null,

  async render(container) {
    container.innerHTML = `<div class="kds-container">
      <div class="kds-header">
        <h2>Kitchen Display</h2>
        <div class="kds-stats" id="kds-stats"></div>
        <div class="flex gap-sm">
          <button class="btn btn-sm btn-secondary" onclick="KitchenDisplay.refresh()">Refresh</button>
          <button class="btn btn-sm btn-ghost" onclick="KitchenDisplay.toggleFullscreen()">Fullscreen</button>
        </div>
      </div>
      <div class="kds-stations" id="kds-stations">
        <button class="kds-station-btn active" onclick="KitchenDisplay.setStation(null)">All</button>
        <button class="kds-station-btn" onclick="KitchenDisplay.setStation('bar')">Bar</button>
        <button class="kds-station-btn" onclick="KitchenDisplay.setStation('kitchen')">Kitchen</button>
        <button class="kds-station-btn" onclick="KitchenDisplay.setStation('grill')">Grill</button>
        <button class="kds-station-btn" onclick="KitchenDisplay.setStation('fryer')">Fryer</button>
      </div>
      <div class="kds-grid" id="kds-grid"></div>
    </div>`;

    await this.refresh();
    this.refreshInterval = setInterval(() => this.refresh(), 10000);
  },

  async refresh() {
    try {
      const [orders, stats] = await Promise.all([
        API.kitchenOrders(this.activeStation),
        API.kitchenStats(),
      ]);

      // Render stats
      document.getElementById('kds-stats').innerHTML = `
        <div class="kds-stat"><span>Queue:</span><span class="stat-num">${stats.current_queue}</span></div>
        <div class="kds-stat"><span>Avg:</span><span class="stat-num">${stats.avg_prep_time}m</span></div>
        <div class="kds-stat"><span>Done:</span><span class="stat-num">${stats.completed_today}</span></div>
        <div class="kds-stat"><span>Max Wait:</span><span class="stat-num ${stats.longest_wait > 10 ? 'text-danger' : ''}">${stats.longest_wait}m</span></div>
      `;

      // Render tickets
      const grid = document.getElementById('kds-grid');
      if (orders.length === 0) {
        grid.innerHTML = '<div class="empty-state" style="grid-column: 1/-1"><div class="empty-icon">OK</div><h3>All Clear!</h3><p>No orders in queue</p></div>';
        return;
      }

      grid.innerHTML = orders.map(order => `
        <div class="kds-ticket urgency-${order.urgency}" data-order-id="${order.id}">
          <div class="kds-ticket-header">
            <div>
              <span class="kds-ticket-order">${Utils.escapeHtml(order.order_number)}</span>
              <span class="kds-ticket-table">${order.table_name ? ' - ' + Utils.escapeHtml(order.table_name) : ''} ${order.order_type !== 'dine-in' ? ' (' + order.order_type + ')' : ''}</span>
            </div>
            <span class="kds-ticket-timer">${order.minutes_waiting}m</span>
          </div>
          <div class="kds-ticket-items">
            ${order.items.map(item => `
              <div class="kds-ticket-item">
                <span class="item-qty">${item.quantity}x</span>
                <div>
                  <span class="item-name">${Utils.escapeHtml(item.name)}</span>
                  ${item.modifiers.length ? `<span class="item-mods">${item.modifiers.map(m => m.name || m).join(', ')}</span>` : ''}
                  ${item.special_instructions ? `<span class="item-notes">${Utils.escapeHtml(item.special_instructions)}</span>` : ''}
                </div>
                <div class="item-status-dot" style="background: ${item.status === 'preparing' ? 'var(--color-warning)' : 'var(--border-color)'}"></div>
              </div>
            `).join('')}
          </div>
          <div class="kds-ticket-footer">
            ${order.queued_count > 0 ? `<button class="btn btn-warning btn-sm" onclick="KitchenDisplay.startAll(${order.id})">Start</button>` : ''}
            <button class="btn btn-success btn-sm" onclick="KitchenDisplay.readyAll(${order.id})">Ready</button>
            <button class="btn btn-ghost btn-sm" onclick="KitchenDisplay.bump(${order.id})">Bump</button>
          </div>
        </div>
      `).join('');
    } catch (err) {
      console.error('KDS refresh error:', err);
    }
  },

  setStation(station) {
    this.activeStation = station;
    document.querySelectorAll('.kds-station-btn').forEach(btn => {
      btn.classList.toggle('active', (station === null && btn.textContent === 'All') || btn.textContent.toLowerCase() === station);
    });
    this.refresh();
  },

  async startAll(orderId) {
    try {
      const orders = await API.kitchenOrders(this.activeStation);
      const order = orders.find(o => o.id === orderId);
      if (order) {
        for (const item of order.items.filter(i => i.status === 'queued')) {
          await API.startPreparing(item.id);
        }
      }
      this.refresh();
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async readyAll(orderId) {
    try {
      const orders = await API.kitchenOrders(this.activeStation);
      const order = orders.find(o => o.id === orderId);
      if (order) {
        for (const item of order.items) {
          await API.markReady(item.id);
        }
      }
      this.refresh();
      UI.toast('Order Ready', `Order sent to expo`, 'success');
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async bump(orderId) {
    try {
      await API.bumpOrder(orderId);
      this.refresh();
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  },

  destroy() {
    if (this.refreshInterval) clearInterval(this.refreshInterval);
  }
};
