const InventoryModule = {
  async render(container) {
    const [summary, lowStock, categories] = await Promise.all([API.inventorySummary(), API.lowStock(), API.inventoryCategories()]);
    container.innerHTML = `<div class="animate-fade">
      <div class="flex justify-between items-center mb-md">
        <div class="tabs" id="inv-tabs">
          <button class="tab active" onclick="InventoryModule.showTab('stock')">Stock Levels</button>
          <button class="tab" onclick="InventoryModule.showTab('low')">Low Stock (${lowStock.length})</button>
          <button class="tab" onclick="InventoryModule.showTab('forecast')">Forecast</button>
          <button class="tab" onclick="InventoryModule.showTab('waste')">Waste Log</button>
          <button class="tab" onclick="InventoryModule.showTab('variance')">Variance</button>
        </div>
        <div class="flex gap-sm">
          <button class="btn btn-primary" onclick="InventoryModule.addStock()">+ Add Stock</button>
          <button class="btn btn-secondary" onclick="InventoryModule.addIngredient()">+ Ingredient</button>
          <button class="btn btn-secondary" onclick="InventoryModule.receiveDelivery()">Receive</button>
          <button class="btn btn-warning" onclick="InventoryModule.logWaste()">Log Waste</button>
        </div>
      </div>
      <div id="inv-content">
        <div class="grid grid-3 gap-md mb-md">
          ${UI.statCard('Total Items', summary.length, '\u25A4')}
          ${UI.statCard('Low Stock', lowStock.length, '\u26A0')}
          ${UI.statCard('Categories', categories.length, '\u2261')}
        </div>
        <div class="card"><div class="card-body" style="overflow-x:auto">
          ${UI.table(
            [
              { label: 'Ingredient', key: 'name', render: (v, r) => `<div class="font-medium">${Utils.escapeHtml(v)}</div><div class="text-sm text-muted">${Utils.escapeHtml(r.category_name || '')}</div>` },
              { label: 'On Hand', key: 'total_quantity', align: 'right', render: (v, r) => `${v.toFixed(1)} ${r.unit}` },
              { label: 'Stock %', key: 'stock_percent', render: (v) => `
                <div class="flex items-center gap-sm">
                  <div class="progress-bar" style="width:80px"><div class="progress-fill ${v < 20 ? 'danger' : v < 50 ? 'warning' : 'success'}" style="width:${v}%"></div></div>
                  <span class="text-sm">${v}%</span>
                </div>` },
              { label: 'Open', key: 'open_count', align: 'center' },
              { label: 'Sealed', key: 'sealed_count', align: 'center' },
              { label: 'Empty', key: 'empty_count', align: 'center' },
              { label: 'Par Level', key: 'par_level', align: 'right', render: (v, r) => v > 0 ? `${v} ${r.unit}` : '-' },
              { label: 'Status', key: 'below_par', render: v => v ? '<span class="badge badge-danger">Below Par</span>' : '<span class="badge badge-success">OK</span>' },
            ],
            summary,
            { emptyMessage: 'No inventory items' }
          )}
        </div></div>
      </div>
    </div>`;
  },

  async showTab(tab) {
    document.querySelectorAll('#inv-tabs .tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    const content = document.getElementById('inv-content');
    UI.loading(content);

    if (tab === 'low') {
      const items = await API.lowStock();
      content.innerHTML = `<div class="card"><div class="card-body">${UI.table(
        [
          { label: 'Ingredient', key: 'name' },
          { label: 'Remaining', key: 'total_quantity', render: (v, r) => `${v.toFixed(1)} ${r.unit}` },
          { label: 'Capacity', key: 'total_capacity', render: (v, r) => `${v.toFixed(1)} ${r.unit}` },
          { label: 'Level', key: r => r, render: (_, r) => { const p = r.total_capacity > 0 ? Math.round(r.total_quantity / r.total_capacity * 100) : 0; return `<span class="badge badge-danger">${p}%</span>`; }},
        ], items, { emptyMessage: 'No low stock items' }
      )}</div></div>`;
    } else if (tab === 'forecast') {
      const data = await API.inventoryForecast(7);
      content.innerHTML = `<div class="card"><div class="card-body">${UI.table(
        [
          { label: 'Ingredient', key: 'name' },
          { label: 'Current Stock', key: 'current_stock', render: (v, r) => `${v.toFixed(1)} ${r.unit}` },
          { label: 'Avg Daily Use', key: 'avg_daily_usage', render: v => v.toFixed(2) },
          { label: 'Days Left', key: 'days_until_empty', render: v => `<span class="${v <= 3 ? 'text-danger font-bold' : ''}">${v === 999 ? 'N/A' : v + ' days'}</span>` },
          { label: '7-Day Need', key: 'forecast_needed', render: v => v.toFixed(1) },
          { label: 'Action', key: 'should_reorder', render: v => v ? '<span class="badge badge-danger">Reorder</span>' : '<span class="badge badge-success">OK</span>' },
        ], data, { emptyMessage: 'No usage data' }
      )}</div></div>`;
    } else if (tab === 'waste') {
      const waste = await API.getWaste();
      content.innerHTML = `<div class="card"><div class="card-body">${UI.table(
        [
          { label: 'Ingredient', key: 'ingredient_name' },
          { label: 'Quantity', key: 'quantity', render: (v, r) => `${v} ${r.unit || ''}` },
          { label: 'Reason', key: 'reason' },
          { label: 'Cost', key: 'cost', render: v => Utils.currency(v) },
          { label: 'By', key: 'employee_name' },
          { label: 'When', key: 'created_at', render: v => Utils.timeAgo(v) },
        ], waste, { emptyMessage: 'No waste logged' }
      )}</div></div>`;
    } else if (tab === 'variance') {
      const data = await API.inventoryVariance(7);
      content.innerHTML = `<div class="card"><div class="card-body">${UI.table(
        [
          { label: 'Ingredient', key: 'name' },
          { label: 'Sales Usage', key: 'theoretical_usage', render: (v, r) => `${v.toFixed(1)} ${r.unit}` },
          { label: 'Waste', key: 'waste', render: (v, r) => `${v.toFixed(1)} ${r.unit}` },
          { label: 'Total', key: 'total_usage', render: (v, r) => `${v.toFixed(1)} ${r.unit}` },
          { label: 'Waste %', key: r => r, render: (_, r) => { const p = r.total_usage > 0 ? (r.waste / r.total_usage * 100).toFixed(1) : 0; return `<span class="${p > 10 ? 'text-danger' : ''}">${p}%</span>`; }},
        ], data, { emptyMessage: 'No data' }
      )}</div></div>`;
    } else {
      this.render(document.getElementById('main-body'));
    }
  },

  async addIngredient() {
    const [categories, suppliers] = await Promise.all([API.inventoryCategories(), API.suppliers()]);
    const html = `
      <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="ing-name"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Category</label><select class="form-select" id="ing-cat"><option value="">None</option>${categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">Unit</label><select class="form-select" id="ing-unit"><option>oz</option><option>ml</option><option>each</option><option>lbs</option><option>liters</option></select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Cost/Unit</label><input type="number" class="form-input" id="ing-cost" step="0.01"></div>
        <div class="form-group"><label class="form-label">Par Level</label><input type="number" class="form-input" id="ing-par" step="0.1"></div>
      </div>
      <div class="form-group"><label class="form-label">Supplier</label><select class="form-select" id="ing-sup"><option value="">None</option>${suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}</select></div>
    `;
    const modal = await UI.modal('Add Ingredient', html, { confirmText: 'Create' });
    if (!modal) return;
    try {
      await API.addIngredient({
        name: modal.querySelector('#ing-name').value,
        category_id: modal.querySelector('#ing-cat').value || null,
        unit: modal.querySelector('#ing-unit').value,
        cost_per_unit: parseFloat(modal.querySelector('#ing-cost').value) || 0,
        par_level: parseFloat(modal.querySelector('#ing-par').value) || 0,
        supplier_id: modal.querySelector('#ing-sup').value || null,
      });
      UI.toast('Ingredient Added', '', 'success');
      this.render(document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async addStock() {
    const ingredients = await API.ingredients();
    const html = `
      <div class="form-group"><label class="form-label">Ingredient</label><select class="form-select" id="stk-ing">${ingredients.map(i => `<option value="${i.id}">${i.name}</option>`).join('')}</select></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Quantity</label><input type="number" class="form-input" id="stk-qty" step="0.01"></div>
        <div class="form-group"><label class="form-label">Location</label><select class="form-select" id="stk-loc"><option>storage</option><option>bar</option><option>kitchen</option><option>walk-in</option></select></div>
      </div>
    `;
    const modal = await UI.modal('Add Stock', html, { confirmText: 'Add' });
    if (!modal) return;
    try {
      await API.addStock({
        ingredient_id: parseInt(modal.querySelector('#stk-ing').value),
        quantity: parseFloat(modal.querySelector('#stk-qty').value),
        location: modal.querySelector('#stk-loc').value,
      });
      UI.toast('Stock Added', '', 'success');
      this.render(document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async logWaste() {
    const ingredients = await API.ingredients();
    const html = `
      <div class="form-group"><label class="form-label">Ingredient</label><select class="form-select" id="w-ing">${ingredients.map(i => `<option value="${i.id}" data-cost="${i.cost_per_unit}">${i.name}</option>`).join('')}</select></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Quantity</label><input type="number" class="form-input" id="w-qty" step="0.01"></div>
        <div class="form-group"><label class="form-label">Reason</label><select class="form-select" id="w-reason"><option>expired</option><option>spoiled</option><option>spill</option><option>overcooked</option><option>mistake</option><option>other</option></select></div>
      </div>
      <div class="form-group"><label class="form-label">Notes</label><input class="form-input" id="w-notes"></div>
    `;
    const modal = await UI.modal('Log Waste', html, { confirmText: 'Log' });
    if (!modal) return;
    const ingEl = modal.querySelector('#w-ing');
    const costPerUnit = parseFloat(ingEl.selectedOptions[0]?.dataset.cost || '0');
    const qty = parseFloat(modal.querySelector('#w-qty').value);
    try {
      await API.logWaste({
        ingredient_id: parseInt(ingEl.value),
        quantity: qty,
        reason: modal.querySelector('#w-reason').value,
        cost: +(costPerUnit * qty).toFixed(2),
        employee_id: App.employee?.id,
        notes: modal.querySelector('#w-notes').value,
      });
      UI.toast('Waste Logged', '', 'warning');
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async receiveDelivery() {
    const [suppliers, ingredients] = await Promise.all([API.suppliers(), API.ingredients()]);
    const html = `
      <div class="form-group"><label class="form-label">Supplier</label><select class="form-select" id="rcv-sup">${suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">Ingredient</label><select class="form-select" id="rcv-ing">${ingredients.map(i => `<option value="${i.id}">${i.name} (${i.unit})</option>`).join('')}</select></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Quantity</label><input type="number" class="form-input" id="rcv-qty" step="0.01"></div>
        <div class="form-group"><label class="form-label">Location</label><select class="form-select" id="rcv-loc"><option>storage</option><option>bar</option><option>kitchen</option><option>walk-in</option></select></div>
      </div>
    `;
    const modal = await UI.modal('Receive Delivery', html, { confirmText: 'Receive' });
    if (!modal) return;
    try {
      await API.receiveDelivery({
        items: [{ ingredient_id: parseInt(modal.querySelector('#rcv-ing').value), quantity: parseFloat(modal.querySelector('#rcv-qty').value), location: modal.querySelector('#rcv-loc').value }],
        supplier_id: parseInt(modal.querySelector('#rcv-sup').value),
      });
      UI.toast('Delivery Received', '', 'success');
      this.render(document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  destroy() {}
};
