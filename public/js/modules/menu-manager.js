const MenuManager = {
  async render(container) {
    const [items, categories] = await Promise.all([API.menuItems(), API.menuCategories()]);
    container.innerHTML = `<div class="animate-fade">
      <div class="flex justify-between items-center mb-md">
        <div class="flex gap-sm">
          <button class="btn btn-primary" onclick="MenuManager.addItem()">+ Add Item</button>
          <button class="btn btn-secondary" onclick="MenuManager.addCategory()">+ Category</button>
          <button class="btn btn-secondary" onclick="MenuManager.managePricing()">Pricing Rules</button>
        </div>
        <div class="search-box" style="width:250px">
          <span class="search-icon">\u2315</span>
          <input class="form-input" placeholder="Search menu..." oninput="MenuManager.filterItems(this.value)">
        </div>
      </div>
      <div class="card">
        <div class="card-body" style="overflow-x:auto" id="menu-table-container">
          ${UI.table(
            [
              { label: 'Item', key: 'name', render: (v, r) => `<div class="font-medium">${Utils.escapeHtml(v)}</div><div class="text-muted text-sm">${Utils.escapeHtml(r.description || '')}</div>` },
              { label: 'Category', key: 'category_name', render: v => `<span class="chip" style="font-size:11px">${Utils.escapeHtml(v || 'None')}</span>` },
              { label: 'Price', key: 'price', align: 'right', render: v => `<strong>${Utils.currency(v)}</strong>` },
              { label: 'Cost', key: 'cost', align: 'right', render: v => Utils.currency(v) },
              { label: 'Margin', key: r => r, render: (_, r) => { const m = r.price > 0 ? ((r.price - r.cost) / r.price * 100) : 0; return `<span class="${m < 30 ? 'text-danger' : 'text-success'}">${m.toFixed(0)}%</span>`; } },
              { label: 'Station', key: 'station' },
              { label: 'Status', key: r => r, render: (_, r) => r.is_86d ? '<span class="badge badge-danger">86\'d</span>' : r.active ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-neutral">Inactive</span>' },
              { label: '', key: r => r, render: (_, r) => `
                <div class="flex gap-xs">
                  <button class="btn btn-ghost btn-sm" onclick="MenuManager.editItem(${r.id})">Edit</button>
                  <button class="btn btn-ghost btn-sm ${r.is_86d ? 'text-success' : 'text-danger'}" onclick="MenuManager.toggle86(${r.id}, ${!r.is_86d})">${r.is_86d ? 'Un-86' : '86'}</button>
                </div>
              `}
            ],
            items,
            { emptyMessage: 'No menu items yet' }
          )}
        </div>
      </div>
    </div>`;
  },

  async addItem() {
    const [categories, ingredients] = await Promise.all([API.menuCategories(), API.ingredients()]);
    const html = `
      <div class="form-row"><div class="form-group"><label class="form-label">Name</label><input class="form-input" id="mi-name" required></div>
      <div class="form-group"><label class="form-label">Category</label><select class="form-select" id="mi-category"><option value="">None</option>${categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}</select></div></div>
      <div class="form-group"><label class="form-label">Description</label><input class="form-input" id="mi-desc"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Price</label><input type="number" class="form-input" id="mi-price" step="0.01" min="0"></div>
        <div class="form-group"><label class="form-label">Cost</label><input type="number" class="form-input" id="mi-cost" step="0.01" min="0"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Station</label><select class="form-select" id="mi-station"><option>bar</option><option>kitchen</option><option>grill</option><option>fryer</option></select></div>
        <div class="form-group"><label class="form-label">Course</label><select class="form-select" id="mi-course"><option>drink</option><option>appetizer</option><option>main</option><option>dessert</option></select></div>
        <div class="form-group"><label class="form-label">Prep Time</label><input type="number" class="form-input" id="mi-prep" value="5" min="1"></div>
      </div>
    `;

    const modal = await UI.modal('Add Menu Item', html, { confirmText: 'Create', size: 'lg' });
    if (!modal) return;

    try {
      await API.createMenuItem({
        name: modal.querySelector('#mi-name').value,
        category_id: modal.querySelector('#mi-category').value || null,
        description: modal.querySelector('#mi-desc').value,
        price: parseFloat(modal.querySelector('#mi-price').value) || 0,
        cost: parseFloat(modal.querySelector('#mi-cost').value) || 0,
        station: modal.querySelector('#mi-station').value,
        course: modal.querySelector('#mi-course').value,
        prep_time_minutes: parseInt(modal.querySelector('#mi-prep').value) || 5,
      });
      UI.toast('Item Created', '', 'success');
      this.render(document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async toggle86(id, is86d) {
    try {
      await API.toggle86(id, is86d);
      UI.toast(is86d ? '86\'d' : 'Restored', '', is86d ? 'warning' : 'success');
      this.render(document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async addCategory() {
    const name = await UI.prompt('New Category', 'Category name:');
    if (!name) return;
    try {
      await API.post('/api/menu/categories', { name });
      UI.toast('Category Created', '', 'success');
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async editItem(id) {
    const items = await API.menuItems();
    const item = items.find(i => i.id === id);
    if (!item) return;

    const categories = await API.menuCategories();
    const html = `
      <div class="form-row"><div class="form-group"><label class="form-label">Name</label><input class="form-input" id="mi-name" value="${Utils.escapeHtml(item.name)}"></div>
      <div class="form-group"><label class="form-label">Category</label><select class="form-select" id="mi-category"><option value="">None</option>${categories.map(c => `<option value="${c.id}" ${c.id === item.category_id ? 'selected' : ''}>${c.name}</option>`).join('')}</select></div></div>
      <div class="form-group"><label class="form-label">Description</label><input class="form-input" id="mi-desc" value="${Utils.escapeHtml(item.description || '')}"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Price</label><input type="number" class="form-input" id="mi-price" step="0.01" value="${item.price}"></div>
        <div class="form-group"><label class="form-label">Cost</label><input type="number" class="form-input" id="mi-cost" step="0.01" value="${item.cost}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Station</label><select class="form-select" id="mi-station">${['bar','kitchen','grill','fryer'].map(s => `<option ${s === item.station ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">Course</label><select class="form-select" id="mi-course">${['drink','appetizer','main','dessert'].map(s => `<option ${s === item.course ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      </div>
    `;

    const modal = await UI.modal('Edit Menu Item', html, { confirmText: 'Save', size: 'lg' });
    if (!modal) return;

    try {
      await API.updateMenuItem(id, {
        name: modal.querySelector('#mi-name').value,
        category_id: modal.querySelector('#mi-category').value || null,
        description: modal.querySelector('#mi-desc').value,
        price: parseFloat(modal.querySelector('#mi-price').value),
        cost: parseFloat(modal.querySelector('#mi-cost').value),
        station: modal.querySelector('#mi-station').value,
        course: modal.querySelector('#mi-course').value,
        active: item.active,
      });
      UI.toast('Item Updated', '', 'success');
      this.render(document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  filterItems(term) {
    // Simple client-side filter
    const rows = document.querySelectorAll('#menu-table-container tbody tr');
    const lower = term.toLowerCase();
    rows.forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(lower) ? '' : 'none';
    });
  },

  async managePricing() {
    const rules = await API.menuPricingRules();
    const html = `
      <div class="mb-md">${rules.length === 0 ? '<p class="text-muted">No pricing rules yet</p>' :
        rules.map(r => `<div class="flex justify-between items-center p-sm" style="border-bottom:1px solid var(--border-color)">
          <div><div class="font-medium">${Utils.escapeHtml(r.name)}</div><div class="text-sm text-muted">${r.type} | ${r.discount_type}: ${r.discount_value}${r.discount_type === 'percent' ? '%' : ''} ${r.start_time ? `| ${r.start_time}-${r.end_time}` : ''}</div></div>
          <span class="badge badge-${r.active ? 'success' : 'neutral'}">${r.active ? 'Active' : 'Inactive'}</span>
        </div>`).join('')}
      </div>
      <h4 class="mb-sm">Add New Rule</h4>
      <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="pr-name" placeholder="e.g. Happy Hour"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Type</label><select class="form-select" id="pr-discount-type"><option value="percent">Percentage Off</option><option value="fixed">Fixed Discount</option><option value="price_override">New Price</option></select></div>
        <div class="form-group"><label class="form-label">Value</label><input type="number" class="form-input" id="pr-value" step="0.01"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Start Time</label><input type="time" class="form-input" id="pr-start" value="16:00"></div>
        <div class="form-group"><label class="form-label">End Time</label><input type="time" class="form-input" id="pr-end" value="18:00"></div>
      </div>
    `;

    const modal = await UI.modal('Pricing Rules', html, { confirmText: 'Add Rule', size: 'lg' });
    if (!modal) return;

    const name = modal.querySelector('#pr-name').value;
    if (!name) return;

    try {
      await API.createPricingRule({
        name,
        discount_type: modal.querySelector('#pr-discount-type').value,
        discount_value: parseFloat(modal.querySelector('#pr-value').value),
        start_time: modal.querySelector('#pr-start').value,
        end_time: modal.querySelector('#pr-end').value,
        type: 'happy_hour',
      });
      UI.toast('Rule Created', '', 'success');
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  destroy() {}
};
