/* ============================================================
   VENUECORE - Floor Plan Module
   ============================================================ */
const FloorPlan = {
  refreshInterval: null,
  selectedTable: null,

  async render(container) {
    container.innerHTML = `<div class="floor-container">
      <div class="floor-map" id="floor-map"></div>
      <div class="floor-sidebar">
        <div class="floor-legend">
          <div class="floor-legend-item"><div class="floor-legend-dot" style="background:var(--color-success)"></div> Open</div>
          <div class="floor-legend-item"><div class="floor-legend-dot" style="background:var(--accent-primary)"></div> Occupied</div>
          <div class="floor-legend-item"><div class="floor-legend-dot" style="background:var(--color-warning)"></div> Reserved</div>
          <div class="floor-legend-item"><div class="floor-legend-dot" style="background:var(--color-danger)"></div> Dirty</div>
        </div>
        <div class="p-md">
          <h3 class="mb-sm">Table Details</h3>
          <div id="table-details">
            <p class="text-muted">Select a table to view details</p>
          </div>
        </div>
        <div class="p-md" style="border-top:1px solid var(--border-color)">
          <h4 class="mb-sm text-secondary">Quick Actions</h4>
          <div class="flex flex-col gap-sm">
            <button class="btn btn-primary btn-block" onclick="FloorPlan.addTable()">+ Add Table</button>
            <button class="btn btn-secondary btn-block" onclick="FloorPlan.refresh()">Refresh</button>
          </div>
        </div>
        <div class="p-md flex-1 overflow-auto" style="border-top:1px solid var(--border-color)">
          <h4 class="mb-sm text-secondary">Server Sections</h4>
          <div id="server-sections"></div>
        </div>
      </div>
    </div>`;

    await this.refresh();
    this.refreshInterval = setInterval(() => this.refresh(), 15000);
  },

  async refresh() {
    try {
      const tables = await API.floorPlan();
      const map = document.getElementById('floor-map');

      map.innerHTML = tables.map(t => `
        <div class="floor-table status-${t.status} ${t.shape === 'circle' ? 'circle' : ''}"
             style="left:${t.pos_x}px; top:${t.pos_y}px; width:${t.width}px; height:${t.height}px"
             onclick="FloorPlan.selectTable(${t.id})"
             data-table-id="${t.id}">
          <div class="table-name">${Utils.escapeHtml(t.name)}</div>
          <div class="table-info">${t.capacity} seats</div>
          ${t.server_name ? `<div class="table-server">${Utils.escapeHtml(t.server_name)}</div>` : ''}
          ${t.minutes_occupied ? `<div class="table-timer">${t.minutes_occupied}m</div>` : ''}
          ${t.order_total ? `<div class="table-info">${Utils.currency(t.order_total)}</div>` : ''}
        </div>
      `).join('');

      // Server sections
      const servers = {};
      for (const t of tables) {
        if (t.server_name) {
          if (!servers[t.server_name]) servers[t.server_name] = { tables: [], color: t.server_color || '#6366f1' };
          servers[t.server_name].tables.push(t);
        }
      }

      document.getElementById('server-sections').innerHTML = Object.entries(servers).map(([name, data]) => `
        <div class="flex items-center gap-sm p-sm" style="border-bottom:1px solid var(--border-color)">
          <div style="width:8px;height:8px;border-radius:50%;background:${data.color}"></div>
          <span class="flex-1 text-sm">${Utils.escapeHtml(name)}</span>
          <span class="text-muted text-sm">${data.tables.length} tables</span>
        </div>
      `).join('') || '<p class="text-muted text-sm">No server assignments</p>';

      // Re-select if one was selected
      if (this.selectedTable) this.showTableDetails(this.selectedTable);
    } catch (err) { console.error('Floor plan error:', err); }
  },

  async selectTable(tableId) {
    this.selectedTable = tableId;
    const tables = await API.floorPlan();
    const table = tables.find(t => t.id === tableId);
    if (table) this.showTableDetails(table);
  },

  showTableDetails(table) {
    const el = document.getElementById('table-details');
    el.innerHTML = `
      <div class="card mb-sm">
        <div class="card-body">
          <div class="flex justify-between items-center mb-sm">
            <h3>${Utils.escapeHtml(table.name)}</h3>
            ${Utils.statusBadge(table.status)}
          </div>
          <div class="text-sm text-secondary mb-sm">${table.section} section | ${table.capacity} seats</div>
          ${table.server_name ? `<div class="text-sm">Server: <strong>${Utils.escapeHtml(table.server_name)}</strong></div>` : ''}
          ${table.order_number ? `<div class="text-sm">Order: <strong>#${Utils.escapeHtml(table.order_number)}</strong> - ${Utils.currency(table.order_total)}</div>` : ''}
          ${table.minutes_occupied ? `<div class="text-sm text-muted">${table.minutes_occupied} min occupied</div>` : ''}
        </div>
      </div>
      <div class="flex flex-col gap-xs">
        ${table.status === 'open' ? `<button class="btn btn-success btn-sm btn-block" onclick="FloorPlan.seatTable(${table.id})">Seat Guests</button>` : ''}
        ${table.status === 'occupied' ? `<button class="btn btn-primary btn-sm btn-block" onclick="FloorPlan.openOrder(${table.current_order_id})">View Order</button>` : ''}
        ${table.status === 'dirty' ? `<button class="btn btn-warning btn-sm btn-block" onclick="FloorPlan.markClean(${table.id})">Mark Clean</button>` : ''}
        ${table.status === 'occupied' ? `<button class="btn btn-secondary btn-sm btn-block" onclick="FloorPlan.transferTable(${table.id})">Transfer</button>` : ''}
      </div>
    `;
  },

  async seatTable(tableId) {
    const guestCount = await UI.prompt('Seat Guests', 'Party size:', '2');
    if (!guestCount) return;

    try {
      const result = await API.seatTable(tableId, { guest_count: parseInt(guestCount), employee_id: App.employee.id });
      UI.toast('Seated', `Order #${result.order_number} created`, 'success');
      this.refresh();
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  openOrder(orderId) {
    // Switch to POS with this order loaded
    App.navigate('pos');
    setTimeout(async () => {
      try {
        POSTerminal.currentOrder = await API.getOrder(orderId);
        POSTerminal.renderOrder();
      } catch {}
    }, 500);
  },

  async markClean(tableId) {
    try {
      await API.setTableStatus(tableId, 'open');
      this.refresh();
      UI.toast('Table Clean', '', 'success');
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async addTable() {
    const html = `
      <div class="form-row">
        <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="new-table-name" placeholder="e.g. T1, Bar-1"></div>
        <div class="form-group"><label class="form-label">Section</label>
          <select class="form-select" id="new-table-section">
            <option>main</option><option>patio</option><option>bar</option><option>private</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Capacity</label><input type="number" class="form-input" id="new-table-cap" value="4"></div>
        <div class="form-group"><label class="form-label">Shape</label>
          <select class="form-select" id="new-table-shape"><option value="rect">Rectangle</option><option value="circle">Circle</option></select>
        </div>
      </div>
    `;

    const modal = await UI.modal('Add Table', html, { confirmText: 'Add' });
    if (!modal) return;

    try {
      await API.createTable({
        name: modal.querySelector('#new-table-name').value,
        section: modal.querySelector('#new-table-section').value,
        capacity: parseInt(modal.querySelector('#new-table-cap').value),
        shape: modal.querySelector('#new-table-shape').value,
        pos_x: 50 + Math.random() * 400,
        pos_y: 50 + Math.random() * 300,
      });
      this.refresh();
      UI.toast('Table Added', '', 'success');
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  destroy() {
    if (this.refreshInterval) clearInterval(this.refreshInterval);
  }
};
