const MenuManager = {
  _items: [],
  _categories: [],
  _modifiers: [],
  _ingredients: [],
  _tab: 'items',
  _filter: { search: '', category: '', status: '', station: '' },

  async render(container) {
    const [items, categories, modifiers] = await Promise.all([
      API.menuItems({ active_only: 'false' }),
      API.menuCategories(),
      API.menuModifiers(),
    ]);
    this._items = items;
    this._categories = categories;
    this._modifiers = modifiers;

    const activeCount = items.filter(i => i.active && !i.is_86d).length;
    const eightySixed = items.filter(i => i.is_86d).length;
    const avgPrice = items.length ? (items.reduce((s, i) => s + i.price, 0) / items.length) : 0;
    const avgMargin = items.filter(i => i.price > 0).length
      ? items.filter(i => i.price > 0).reduce((s, i) => s + ((i.price - i.cost) / i.price * 100), 0) / items.filter(i => i.price > 0).length
      : 0;

    container.innerHTML = `<div class="animate-fade">
      <div class="stats-grid mb-md">
        ${UI.statCard('Active Items', activeCount, '')}
        ${UI.statCard('86\'d', eightySixed, '', eightySixed > 0 ? eightySixed + ' unavailable' : '')}
        ${UI.statCard('Avg Price', Utils.currency(avgPrice), '')}
        ${UI.statCard('Avg Margin', avgMargin.toFixed(1) + '%', '', avgMargin < 30 ? 'Below target' : '')}
      </div>

      <div class="tabs mb-md">
        <button class="tab ${this._tab === 'items' ? 'active' : ''}" onclick="MenuManager.switchTab('items')">Menu Items (${items.length})</button>
        <button class="tab ${this._tab === 'categories' ? 'active' : ''}" onclick="MenuManager.switchTab('categories')">Categories (${categories.length})</button>
        <button class="tab ${this._tab === 'modifiers' ? 'active' : ''}" onclick="MenuManager.switchTab('modifiers')">Modifiers (${modifiers.length})</button>
        <button class="tab ${this._tab === 'pricing' ? 'active' : ''}" onclick="MenuManager.switchTab('pricing')">Pricing Rules</button>
      </div>

      <div id="menu-tab-content"></div>
    </div>`;

    this._renderCurrentTab();
  },

  switchTab(tab) {
    this._tab = tab;
    this._renderCurrentTab();
  },

  _renderCurrentTab() {
    const el = document.getElementById('menu-tab-content');
    if (!el) return;
    switch (this._tab) {
      case 'items': this._renderItemsTab(el); break;
      case 'categories': this._renderCategoriesTab(el); break;
      case 'modifiers': this._renderModifiersTab(el); break;
      case 'pricing': this._renderPricingTab(el); break;
    }
  },

  // --- ITEMS TAB ---
  _renderItemsTab(el) {
    const items = this._getFilteredItems();
    const cats = this._categories;
    const stations = [...new Set(this._items.map(i => i.station).filter(Boolean))];

    el.innerHTML = `
      <div class="flex justify-between items-center mb-md flex-wrap gap-sm">
        <div class="flex gap-sm flex-wrap">
          <button class="btn btn-primary" onclick="MenuManager.addItem()">+ Add Item</button>
          <button class="btn btn-secondary" onclick="MenuManager.bulkActions()">Bulk Actions</button>
        </div>
        <div class="flex gap-sm flex-wrap">
          <input class="form-input" style="width:200px" placeholder="Search items..."
            value="${Utils.escapeHtml(this._filter.search)}"
            oninput="MenuManager._filter.search=this.value;MenuManager._renderCurrentTab()">
          <select class="form-select" style="width:150px" onchange="MenuManager._filter.category=this.value;MenuManager._renderCurrentTab()">
            <option value="">All Categories</option>
            ${cats.map(c => `<option value="${c.id}" ${this._filter.category == c.id ? 'selected' : ''}>${Utils.escapeHtml(c.name)}</option>`).join('')}
          </select>
          <select class="form-select" style="width:130px" onchange="MenuManager._filter.status=this.value;MenuManager._renderCurrentTab()">
            <option value="">All Status</option>
            <option value="active" ${this._filter.status === 'active' ? 'selected' : ''}>Active</option>
            <option value="86d" ${this._filter.status === '86d' ? 'selected' : ''}>86'd</option>
            <option value="inactive" ${this._filter.status === 'inactive' ? 'selected' : ''}>Inactive</option>
          </select>
          <select class="form-select" style="width:130px" onchange="MenuManager._filter.station=this.value;MenuManager._renderCurrentTab()">
            <option value="">All Stations</option>
            ${stations.map(s => `<option value="${s}" ${this._filter.station === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="card">
        <div class="card-body" style="overflow-x:auto">
          ${items.length === 0
            ? '<div class="empty-state"><h3>No items match</h3><p>Adjust your filters or add a new item</p></div>'
            : this._buildItemsTable(items)}
        </div>
      </div>
    `;
  },

  _getFilteredItems() {
    let items = [...this._items];
    const f = this._filter;
    if (f.search) {
      const lower = f.search.toLowerCase();
      items = items.filter(i => i.name.toLowerCase().includes(lower) || (i.description || '').toLowerCase().includes(lower));
    }
    if (f.category) items = items.filter(i => i.category_id == f.category);
    if (f.status === 'active') items = items.filter(i => i.active && !i.is_86d);
    else if (f.status === '86d') items = items.filter(i => i.is_86d);
    else if (f.status === 'inactive') items = items.filter(i => !i.active);
    if (f.station) items = items.filter(i => i.station === f.station);
    return items;
  },

  _buildItemsTable(items) {
    return UI.table(
      [
        { label: '', key: r => r, render: (_, r) => `<input type="checkbox" class="menu-item-check" data-id="${r.id}">` },
        { label: 'Item', key: 'name', render: (v, r) => `
          <div class="font-medium">${Utils.escapeHtml(v)}</div>
          <div class="text-muted text-sm">${Utils.escapeHtml(r.description || '')}</div>
          ${r.recipes && r.recipes.length ? `<div class="text-sm" style="margin-top:2px;color:var(--text-muted)">${r.recipes.length} ingredient${r.recipes.length > 1 ? 's' : ''} linked</div>` : ''}
        ` },
        { label: 'Category', key: 'category_name', render: (v, r) => {
          const color = r.category_color || '#6366f1';
          return v ? `<span class="chip" style="font-size:11px;background:${color}22;color:${color};border:1px solid ${color}44">${Utils.escapeHtml(v)}</span>` : '<span class="text-muted">--</span>';
        }},
        { label: 'Price', key: 'price', align: 'right', render: v => `<strong>${Utils.currency(v)}</strong>` },
        { label: 'Cost', key: 'cost', align: 'right', render: v => v > 0 ? Utils.currency(v) : '<span class="text-muted">--</span>' },
        { label: 'Margin', key: r => r, align: 'right', render: (_, r) => {
          if (r.price <= 0) return '<span class="text-muted">--</span>';
          const m = ((r.price - r.cost) / r.price * 100);
          return `<span class="${m < 30 ? 'text-danger font-bold' : m < 50 ? 'text-warning' : 'text-success'}">${m.toFixed(1)}%</span>`;
        }},
        { label: 'Station', key: 'station', render: v => `<span class="text-sm">${Utils.escapeHtml(v || '--')}</span>` },
        { label: 'Course', key: 'course', render: v => `<span class="text-sm">${Utils.escapeHtml(v || '--')}</span>` },
        { label: 'Status', key: r => r, render: (_, r) => {
          if (r.is_86d) return '<span class="badge badge-danger">86\'d</span>';
          if (!r.active) return '<span class="badge badge-neutral">Inactive</span>';
          return '<span class="badge badge-success">Active</span>';
        }},
        { label: 'Actions', key: r => r, render: (_, r) => `
          <div class="flex gap-xs">
            <button class="btn btn-ghost btn-sm" onclick="MenuManager.editItem(${r.id})">Edit</button>
            <button class="btn btn-ghost btn-sm" onclick="MenuManager.cloneItem(${r.id})">Clone</button>
            <button class="btn btn-ghost btn-sm ${r.is_86d ? 'text-success' : 'text-danger'}" onclick="MenuManager.toggle86(${r.id}, ${!r.is_86d})">${r.is_86d ? 'Un-86' : '86'}</button>
          </div>
        `}
      ],
      items,
      { emptyMessage: 'No menu items' }
    );
  },

  // --- ADD / EDIT ITEM ---
  async addItem() {
    if (!this._ingredients.length) {
      try { this._ingredients = await API.ingredients(); } catch {}
    }
    this._showItemModal(null);
  },

  async editItem(id) {
    const item = this._items.find(i => i.id === id);
    if (!item) return;
    if (!this._ingredients.length) {
      try { this._ingredients = await API.ingredients(); } catch {}
    }
    this._showItemModal(item);
  },

  async _showItemModal(item) {
    const isEdit = !!item;
    const cats = this._categories;
    const stations = ['bar', 'kitchen', 'grill', 'fryer', 'prep', 'expo'];
    const courses = ['drink', 'appetizer', 'main', 'side', 'dessert', 'other'];
    const ingredients = this._ingredients;
    const recipes = item ? (item.recipes || []) : [];

    const html = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="form-group">
          <label class="form-label">Name *</label>
          <input class="form-input" id="mi-name" value="${Utils.escapeHtml(item?.name || '')}" required>
        </div>
        <div class="form-group">
          <label class="form-label">Category</label>
          <select class="form-select" id="mi-category">
            <option value="">None</option>
            ${cats.map(c => `<option value="${c.id}" ${item?.category_id === c.id ? 'selected' : ''}>${Utils.escapeHtml(c.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Description</label>
        <input class="form-input" id="mi-desc" value="${Utils.escapeHtml(item?.description || '')}" placeholder="Short description shown on POS">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px">
        <div class="form-group">
          <label class="form-label">Price *</label>
          <input type="number" class="form-input" id="mi-price" step="0.01" min="0" value="${item?.price ?? ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Cost</label>
          <input type="number" class="form-input" id="mi-cost" step="0.01" min="0" value="${item?.cost ?? 0}">
        </div>
        <div class="form-group">
          <label class="form-label">Margin</label>
          <div class="form-input" id="mi-margin-display" style="background:var(--bg-secondary);cursor:default">--</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px">
        <div class="form-group">
          <label class="form-label">Station</label>
          <select class="form-select" id="mi-station">
            ${stations.map(s => `<option ${s === (item?.station || 'kitchen') ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Course</label>
          <select class="form-select" id="mi-course">
            ${courses.map(s => `<option ${s === (item?.course || 'main') ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Prep Time (min)</label>
          <input type="number" class="form-input" id="mi-prep" value="${item?.prep_time_minutes ?? 5}" min="1">
        </div>
      </div>
      ${isEdit ? `
        <div class="form-group">
          <label class="form-label flex items-center gap-sm">
            <input type="checkbox" id="mi-active" ${item.active ? 'checked' : ''}>
            Active (visible on POS)
          </label>
        </div>
      ` : ''}

      <hr style="border-color:var(--border-color);margin:16px 0">
      <h4 style="margin-bottom:8px">Recipe / Ingredients</h4>
      <p class="text-sm text-muted" style="margin-bottom:8px">Link ingredients for automatic inventory deduction and food cost tracking.</p>
      <div id="mi-recipes">
        ${recipes.map((r, i) => this._recipeRowHtml(r, i, ingredients)).join('')}
      </div>
      <button class="btn btn-ghost btn-sm" onclick="MenuManager._addRecipeRow()" style="margin-top:4px">+ Add Ingredient</button>
    `;

    const modal = await UI.modal(isEdit ? 'Edit Menu Item' : 'Add Menu Item', html, { confirmText: isEdit ? 'Save' : 'Create', size: 'lg' });

    // Set up live margin calc after mount
    setTimeout(() => {
      const priceEl = document.getElementById('mi-price');
      const costEl = document.getElementById('mi-cost');
      const marginEl = document.getElementById('mi-margin-display');
      if (priceEl && costEl && marginEl) {
        const calc = () => {
          const p = parseFloat(priceEl.value) || 0;
          const c = parseFloat(costEl.value) || 0;
          if (p > 0) {
            const m = ((p - c) / p * 100).toFixed(1);
            marginEl.textContent = m + '%';
            marginEl.style.color = m < 30 ? 'var(--color-danger)' : 'var(--color-success)';
          } else {
            marginEl.textContent = '--';
            marginEl.style.color = '';
          }
        };
        priceEl.addEventListener('input', calc);
        costEl.addEventListener('input', calc);
        calc();
      }
    }, 100);

    if (!modal) return;

    const name = modal.querySelector('#mi-name').value.trim();
    if (!name) { UI.toast('Error', 'Name is required', 'danger'); return; }

    // Gather recipe rows
    const recipeRows = modal.querySelectorAll('.recipe-row');
    const recipeData = [];
    recipeRows.forEach(row => {
      const ingId = row.querySelector('.recipe-ingredient')?.value;
      const qty = parseFloat(row.querySelector('.recipe-qty')?.value);
      const unit = row.querySelector('.recipe-unit')?.value;
      if (ingId && qty > 0) recipeData.push({ ingredient_id: parseInt(ingId), quantity: qty, unit: unit || 'oz' });
    });

    const payload = {
      name,
      category_id: modal.querySelector('#mi-category').value || null,
      description: modal.querySelector('#mi-desc').value,
      price: parseFloat(modal.querySelector('#mi-price').value) || 0,
      cost: parseFloat(modal.querySelector('#mi-cost').value) || 0,
      station: modal.querySelector('#mi-station').value,
      course: modal.querySelector('#mi-course').value,
      prep_time_minutes: parseInt(modal.querySelector('#mi-prep').value) || 5,
      recipes: recipeData,
    };

    if (isEdit) {
      payload.active = modal.querySelector('#mi-active')?.checked ? 1 : 0;
    }

    try {
      if (isEdit) {
        await API.updateMenuItem(item.id, payload);
        UI.toast('Updated', name, 'success');
      } else {
        await API.createMenuItem(payload);
        UI.toast('Created', name, 'success');
      }
      this.render(document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  _recipeRowHtml(recipe, index, ingredients) {
    if (!ingredients) ingredients = this._ingredients;
    return `
      <div class="recipe-row flex gap-sm items-center mb-xs" data-index="${index}">
        <select class="form-select recipe-ingredient" style="flex:2">
          <option value="">Select ingredient...</option>
          ${ingredients.map(ing => `<option value="${ing.id}" ${recipe?.ingredient_id === ing.id ? 'selected' : ''}>${Utils.escapeHtml(ing.name)}</option>`).join('')}
        </select>
        <input type="number" class="form-input recipe-qty" style="flex:1" step="0.01" min="0" placeholder="Qty" value="${recipe?.quantity || ''}">
        <select class="form-select recipe-unit" style="flex:1">
          ${['oz', 'ml', 'g', 'kg', 'lb', 'each', 'cup', 'tbsp', 'tsp', 'slice', 'piece'].map(u =>
            `<option ${(recipe?.unit || 'oz') === u ? 'selected' : ''}>${u}</option>`
          ).join('')}
        </select>
        <button class="btn btn-ghost btn-sm text-danger" onclick="this.closest('.recipe-row').remove()">X</button>
      </div>
    `;
  },

  _addRecipeRow() {
    const container = document.getElementById('mi-recipes');
    if (!container) return;
    const index = container.querySelectorAll('.recipe-row').length;
    container.insertAdjacentHTML('beforeend', this._recipeRowHtml(null, index, this._ingredients));
  },

  async cloneItem(id) {
    const item = this._items.find(i => i.id === id);
    if (!item) return;
    try {
      await API.createMenuItem({
        name: item.name + ' (Copy)',
        category_id: item.category_id,
        description: item.description,
        price: item.price,
        cost: item.cost,
        station: item.station,
        course: item.course,
        prep_time_minutes: item.prep_time_minutes,
        recipes: (item.recipes || []).map(r => ({ ingredient_id: r.ingredient_id, quantity: r.quantity, unit: r.unit })),
      });
      UI.toast('Cloned', item.name, 'success');
      this.render(document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async toggle86(id, is86d) {
    try {
      await API.toggle86(id, is86d);
      const item = this._items.find(i => i.id === id);
      UI.toast(is86d ? '86\'d' : 'Restored', item?.name || '', is86d ? 'warning' : 'success');
      this.render(document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async bulkActions() {
    const checked = document.querySelectorAll('.menu-item-check:checked');
    if (checked.length === 0) {
      UI.toast('Select Items', 'Check one or more items first', 'info');
      return;
    }
    const ids = Array.from(checked).map(cb => parseInt(cb.dataset.id));

    const html = `
      <p>${ids.length} item${ids.length > 1 ? 's' : ''} selected</p>
      <div class="flex flex-col gap-sm" style="margin-top:12px">
        <button class="btn btn-danger" id="bulk-86" style="width:100%">86 All Selected</button>
        <button class="btn btn-success" id="bulk-un86" style="width:100%">Un-86 All Selected</button>
        <div class="flex gap-sm items-center" style="margin-top:8px">
          <label class="form-label" style="margin:0;white-space:nowrap">Move to:</label>
          <select class="form-select" id="bulk-category" style="flex:1">
            <option value="">-- Select Category --</option>
            ${this._categories.map(c => `<option value="${c.id}">${Utils.escapeHtml(c.name)}</option>`).join('')}
          </select>
          <button class="btn btn-secondary" id="bulk-move">Move</button>
        </div>
      </div>
    `;

    const modal = await UI.modal('Bulk Actions', html, { confirmText: '', showCancel: true, footer: false });
    if (!modal) return;

    const self = this;

    modal.querySelector('#bulk-86').onclick = async () => {
      for (const id of ids) await API.toggle86(id, true);
      modal.closest('.modal-overlay').remove();
      UI.toast('86\'d', ids.length + ' items', 'warning');
      self.render(document.getElementById('main-body'));
    };

    modal.querySelector('#bulk-un86').onclick = async () => {
      for (const id of ids) await API.toggle86(id, false);
      modal.closest('.modal-overlay').remove();
      UI.toast('Restored', ids.length + ' items', 'success');
      self.render(document.getElementById('main-body'));
    };

    modal.querySelector('#bulk-move').onclick = async () => {
      const catId = modal.querySelector('#bulk-category').value;
      if (!catId) return;
      for (const id of ids) {
        const item = self._items.find(i => i.id === id);
        if (item) await API.updateMenuItem(id, { ...item, category_id: catId });
      }
      modal.closest('.modal-overlay').remove();
      UI.toast('Moved', ids.length + ' items', 'success');
      self.render(document.getElementById('main-body'));
    };
  },

  // --- CATEGORIES TAB ---
  _renderCategoriesTab(el) {
    const cats = this._categories;
    const itemCounts = {};
    this._items.forEach(i => {
      const cid = i.category_id || 'none';
      itemCounts[cid] = (itemCounts[cid] || 0) + 1;
    });

    el.innerHTML = `
      <div class="flex justify-between items-center mb-md">
        <button class="btn btn-primary" onclick="MenuManager.addCategory()">+ Add Category</button>
        <span class="text-muted text-sm">${cats.length} categories, ${itemCounts['none'] || 0} uncategorized items</span>
      </div>
      <div class="card">
        <div class="card-body">
          ${cats.length === 0 ? '<div class="empty-state"><h3>No Categories</h3><p>Create categories to organize your menu</p></div>' :
            cats.map(c => `
              <div class="flex justify-between items-center p-md" style="border-bottom:1px solid var(--border-color)">
                <div class="flex items-center gap-md">
                  <div style="width:32px;height:32px;border-radius:6px;background:${c.color || '#6366f1'};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:14px">
                    ${(c.name || '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <div class="font-medium">${Utils.escapeHtml(c.name)}</div>
                    <div class="text-sm text-muted">${itemCounts[c.id] || 0} items | Order: ${c.display_order || 0}</div>
                  </div>
                </div>
                <div class="flex gap-xs">
                  <button class="btn btn-ghost btn-sm" onclick="MenuManager.editCategory(${c.id})">Edit</button>
                  <button class="btn btn-ghost btn-sm text-danger" onclick="MenuManager.deleteCategory(${c.id})">Delete</button>
                </div>
              </div>
            `).join('')}
        </div>
      </div>
    `;
  },

  async addCategory() {
    const html = `
      <div class="form-group">
        <label class="form-label">Name *</label>
        <input class="form-input" id="cat-name" required>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="form-group">
          <label class="form-label">Color</label>
          <input type="color" class="form-input" id="cat-color" value="#6366f1" style="height:38px;padding:4px">
        </div>
        <div class="form-group">
          <label class="form-label">Display Order</label>
          <input type="number" class="form-input" id="cat-order" value="0" min="0">
        </div>
      </div>
    `;
    const modal = await UI.modal('Add Category', html, { confirmText: 'Create' });
    if (!modal) return;

    const name = modal.querySelector('#cat-name').value.trim();
    if (!name) return;

    try {
      await API.post('/api/menu/categories', {
        name,
        color: modal.querySelector('#cat-color').value,
      });
      UI.toast('Created', name, 'success');
      this.render(document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async editCategory(id) {
    const cat = this._categories.find(c => c.id === id);
    if (!cat) return;

    const html = `
      <div class="form-group">
        <label class="form-label">Name</label>
        <input class="form-input" id="cat-name" value="${Utils.escapeHtml(cat.name)}">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="form-group">
          <label class="form-label">Color</label>
          <input type="color" class="form-input" id="cat-color" value="${cat.color || '#6366f1'}" style="height:38px;padding:4px">
        </div>
        <div class="form-group">
          <label class="form-label">Display Order</label>
          <input type="number" class="form-input" id="cat-order" value="${cat.display_order || 0}" min="0">
        </div>
      </div>
    `;
    const modal = await UI.modal('Edit Category', html, { confirmText: 'Save' });
    if (!modal) return;

    try {
      await API.put(`/api/menu/categories/${id}`, {
        name: modal.querySelector('#cat-name').value.trim(),
        color: modal.querySelector('#cat-color').value,
        display_order: parseInt(modal.querySelector('#cat-order').value) || 0,
      });
      UI.toast('Updated', '', 'success');
      this.render(document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async deleteCategory(id) {
    const cat = this._categories.find(c => c.id === id);
    const count = this._items.filter(i => i.category_id === id).length;
    const msg = count > 0
      ? `"${cat.name}" has ${count} item${count > 1 ? 's' : ''}. They will become uncategorized. Continue?`
      : `Delete category "${cat.name}"?`;
    if (!await UI.confirm('Delete Category', msg)) return;

    try {
      await API.del(`/api/menu/categories/${id}`);
      UI.toast('Deleted', cat.name, 'success');
      this.render(document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  // --- MODIFIERS TAB ---
  _renderModifiersTab(el) {
    const mods = this._modifiers;
    const modCategories = [...new Set(mods.map(m => m.category || 'General'))].sort();

    el.innerHTML = `
      <div class="flex justify-between items-center mb-md">
        <button class="btn btn-primary" onclick="MenuManager.addModifier()">+ Add Modifier</button>
        <span class="text-muted text-sm">${mods.length} modifiers across ${modCategories.length} group${modCategories.length !== 1 ? 's' : ''}</span>
      </div>
      ${modCategories.length === 0 ? '<div class="card"><div class="card-body"><div class="empty-state"><h3>No Modifiers</h3><p>Add modifiers like "No Ice", "Extra Shot", "Well Done"</p></div></div></div>' :
        modCategories.map(cat => {
          const catMods = mods.filter(m => (m.category || 'General') === cat);
          return `
            <div class="card mb-sm">
              <div class="card-body">
                <h4 style="margin-bottom:8px">${Utils.escapeHtml(cat)} (${catMods.length})</h4>
                <div class="flex flex-wrap gap-sm">
                  ${catMods.map(m => `
                    <div class="chip" style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;font-size:13px;cursor:pointer" onclick="MenuManager.editModifier(${m.id})">
                      ${Utils.escapeHtml(m.name)}
                      ${m.price_adjustment ? `<span class="text-sm" style="opacity:.7">${m.price_adjustment > 0 ? '+' : ''}${Utils.currency(m.price_adjustment)}</span>` : ''}
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
          `;
        }).join('')}
    `;
  },

  async addModifier() {
    const existingCategories = [...new Set(this._modifiers.map(m => m.category || 'General'))];
    const html = `
      <div class="form-group">
        <label class="form-label">Name *</label>
        <input class="form-input" id="mod-name" placeholder="e.g. No Ice, Extra Shot, Well Done">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="form-group">
          <label class="form-label">Group</label>
          <input class="form-input" id="mod-category" list="mod-cat-list" value="General" placeholder="e.g. Temperature, Add-ons">
          <datalist id="mod-cat-list">${existingCategories.map(c => `<option value="${Utils.escapeHtml(c)}">`).join('')}</datalist>
        </div>
        <div class="form-group">
          <label class="form-label">Price Adjustment</label>
          <input type="number" class="form-input" id="mod-price" step="0.01" value="0" placeholder="0.00 = free">
        </div>
      </div>
    `;
    const modal = await UI.modal('Add Modifier', html, { confirmText: 'Create' });
    if (!modal) return;

    const name = modal.querySelector('#mod-name').value.trim();
    if (!name) return;

    try {
      await API.post('/api/menu/modifiers', {
        name,
        category: modal.querySelector('#mod-category').value.trim() || 'General',
        price_adjustment: parseFloat(modal.querySelector('#mod-price').value) || 0,
      });
      UI.toast('Created', name, 'success');
      this.render(document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async editModifier(id) {
    const mod = this._modifiers.find(m => m.id === id);
    if (!mod) return;
    const existingCategories = [...new Set(this._modifiers.map(m => m.category || 'General'))];
    const html = `
      <div class="form-group">
        <label class="form-label">Name</label>
        <input class="form-input" id="mod-name" value="${Utils.escapeHtml(mod.name)}">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="form-group">
          <label class="form-label">Group</label>
          <input class="form-input" id="mod-category" list="mod-cat-list" value="${Utils.escapeHtml(mod.category || 'General')}">
          <datalist id="mod-cat-list">${existingCategories.map(c => `<option value="${Utils.escapeHtml(c)}">`).join('')}</datalist>
        </div>
        <div class="form-group">
          <label class="form-label">Price Adjustment</label>
          <input type="number" class="form-input" id="mod-price" step="0.01" value="${mod.price_adjustment || 0}">
        </div>
      </div>
    `;
    const modal = await UI.modal('Edit Modifier', html, { confirmText: 'Save' });
    if (!modal) return;

    try {
      await API.put(`/api/menu/modifiers/${id}`, {
        name: modal.querySelector('#mod-name').value.trim(),
        category: modal.querySelector('#mod-category').value.trim() || 'General',
        price_adjustment: parseFloat(modal.querySelector('#mod-price').value) || 0,
      });
      UI.toast('Updated', '', 'success');
      this.render(document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  // --- PRICING RULES TAB ---
  async _renderPricingTab(el) {
    let rules;
    try { rules = await API.menuPricingRules(); } catch { rules = []; }

    el.innerHTML = `
      <div class="flex justify-between items-center mb-md">
        <button class="btn btn-primary" onclick="MenuManager.addPricingRule()">+ Add Rule</button>
        <span class="text-muted text-sm">${rules.length} active rule${rules.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="card">
        <div class="card-body">
          ${rules.length === 0
            ? '<div class="empty-state"><h3>No Pricing Rules</h3><p>Create rules for happy hours, daily specials, and seasonal pricing</p></div>'
            : UI.table(
              [
                { label: 'Rule Name', key: 'name', render: v => `<div class="font-medium">${Utils.escapeHtml(v)}</div>` },
                { label: 'Type', key: 'type', render: v => `<span class="chip" style="font-size:11px">${Utils.escapeHtml(v || 'custom')}</span>` },
                { label: 'Discount', key: r => r, render: (_, r) => {
                  if (r.discount_type === 'percent') return r.discount_value + '% off';
                  if (r.discount_type === 'fixed') return Utils.currency(r.discount_value) + ' off';
                  if (r.discount_type === 'price_override') return 'Set to ' + Utils.currency(r.discount_value);
                  return '--';
                }},
                { label: 'Schedule', key: r => r, render: (_, r) => {
                  const parts = [];
                  if (r.start_time && r.end_time) parts.push(r.start_time + ' - ' + r.end_time);
                  if (r.start_date) parts.push('From ' + r.start_date);
                  if (r.end_date) parts.push('Until ' + r.end_date);
                  if (r.days_of_week && r.days_of_week !== '[]') {
                    try { const d = JSON.parse(r.days_of_week); if (d.length) parts.push(d.join(', ')); } catch {}
                  }
                  return parts.length ? `<span class="text-sm">${parts.join(' | ')}</span>` : '<span class="text-muted">Always</span>';
                }},
                { label: 'Status', key: 'active', render: v => v ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-neutral">Inactive</span>' },
              ],
              rules,
              { emptyMessage: 'No rules' }
            )}
        </div>
      </div>
    `;
  },

  async addPricingRule() {
    const cats = this._categories;
    const html = `
      <div class="form-group">
        <label class="form-label">Rule Name *</label>
        <input class="form-input" id="pr-name" placeholder="e.g. Happy Hour, Weekend Special">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="form-group">
          <label class="form-label">Type</label>
          <select class="form-select" id="pr-type">
            <option value="happy_hour">Happy Hour</option>
            <option value="daily_special">Daily Special</option>
            <option value="seasonal">Seasonal</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Apply To</label>
          <select class="form-select" id="pr-scope">
            <option value="all">All Items</option>
            <option value="category">Specific Category</option>
          </select>
        </div>
      </div>
      <div class="form-group" id="pr-cat-group" style="display:none">
        <label class="form-label">Category</label>
        <select class="form-select" id="pr-category">
          ${cats.map(c => `<option value="${c.id}">${Utils.escapeHtml(c.name)}</option>`).join('')}
        </select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="form-group">
          <label class="form-label">Discount Type</label>
          <select class="form-select" id="pr-discount-type">
            <option value="percent">Percentage Off</option>
            <option value="fixed">Fixed Amount Off</option>
            <option value="price_override">Set New Price</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Value</label>
          <input type="number" class="form-input" id="pr-value" step="0.01" placeholder="e.g. 20 for 20%">
        </div>
      </div>
      <h4 style="margin:12px 0 8px">Schedule (optional)</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="form-group">
          <label class="form-label">Start Time</label>
          <input type="time" class="form-input" id="pr-start">
        </div>
        <div class="form-group">
          <label class="form-label">End Time</label>
          <input type="time" class="form-input" id="pr-end">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="form-group">
          <label class="form-label">Start Date</label>
          <input type="date" class="form-input" id="pr-start-date">
        </div>
        <div class="form-group">
          <label class="form-label">End Date</label>
          <input type="date" class="form-input" id="pr-end-date">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Days of Week</label>
        <div class="flex flex-wrap gap-sm" id="pr-days">
          ${['mon','tue','wed','thu','fri','sat','sun'].map(d =>
            `<label class="flex items-center gap-xs" style="cursor:pointer"><input type="checkbox" value="${d}"> ${d.charAt(0).toUpperCase() + d.slice(1)}</label>`
          ).join('')}
        </div>
      </div>
    `;

    const modal = await UI.modal('Add Pricing Rule', html, { confirmText: 'Create', size: 'lg' });

    // Wire up scope toggle
    setTimeout(() => {
      const scope = document.getElementById('pr-scope');
      const catGroup = document.getElementById('pr-cat-group');
      if (scope && catGroup) {
        scope.onchange = () => { catGroup.style.display = scope.value === 'category' ? '' : 'none'; };
      }
    }, 50);

    if (!modal) return;

    const name = modal.querySelector('#pr-name').value.trim();
    if (!name) return;

    const scope = modal.querySelector('#pr-scope').value;
    const dayCheckboxes = modal.querySelectorAll('#pr-days input:checked');
    const days = Array.from(dayCheckboxes).map(cb => cb.value);

    try {
      await API.createPricingRule({
        name,
        type: modal.querySelector('#pr-type').value,
        category_id: scope === 'category' ? modal.querySelector('#pr-category').value : null,
        discount_type: modal.querySelector('#pr-discount-type').value,
        discount_value: parseFloat(modal.querySelector('#pr-value').value) || 0,
        start_time: modal.querySelector('#pr-start').value || null,
        end_time: modal.querySelector('#pr-end').value || null,
        start_date: modal.querySelector('#pr-start-date').value || null,
        end_date: modal.querySelector('#pr-end-date').value || null,
        days_of_week: days.length > 0 ? days : [],
      });
      UI.toast('Rule Created', name, 'success');
      this._renderCurrentTab();
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  destroy() {}
};
