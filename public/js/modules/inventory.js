const InventoryModule = {
  _activeTab: 'stock',
  _cache: {},
  _searchTerm: '',
  _categoryFilter: '',
  _locationFilter: '',
  _expirySubView: 'expiring',
  _expiryDays: 7,

  async render(container) {
    this._container = container;
    this._cache = {};
    const [summary, lowStock, categories] = await Promise.all([
      API.inventorySummary(),
      API.lowStock(),
      API.inventoryCategories()
    ]);
    this._cache.summary = summary;
    this._cache.lowStock = lowStock;
    this._cache.categories = categories;

    container.innerHTML = `<div class="animate-fade">
      <div class="flex justify-between items-center mb-md">
        <div class="tabs" id="inv-tabs">
          <button class="tab ${this._activeTab === 'stock' ? 'active' : ''}" onclick="InventoryModule.showTab('stock')">Stock Levels</button>
          <button class="tab ${this._activeTab === 'low' ? 'active' : ''}" onclick="InventoryModule.showTab('low')">Low Stock (${lowStock.length})</button>
          <button class="tab ${this._activeTab === 'expiry' ? 'active' : ''}" onclick="InventoryModule.showTab('expiry')">Expiration / FIFO</button>
          <button class="tab ${this._activeTab === 'recipes' ? 'active' : ''}" onclick="InventoryModule.showTab('recipes')">Recipes</button>
          <button class="tab ${this._activeTab === 'counts' ? 'active' : ''}" onclick="InventoryModule.showTab('counts')">Count Sheets</button>
          <button class="tab ${this._activeTab === 'transfers' ? 'active' : ''}" onclick="InventoryModule.showTab('transfers')">Transfers</button>
          <button class="tab ${this._activeTab === 'waste' ? 'active' : ''}" onclick="InventoryModule.showTab('waste')">Waste Log</button>
          <button class="tab ${this._activeTab === 'forecast' ? 'active' : ''}" onclick="InventoryModule.showTab('forecast')">Forecast</button>
          <button class="tab ${this._activeTab === 'reorder' ? 'active' : ''}" onclick="InventoryModule.showTab('reorder')">Reorder</button>
          <button class="tab ${this._activeTab === 'profit' ? 'active' : ''}" onclick="InventoryModule.showTab('profit')">Profitability</button>
        </div>
        <div class="flex gap-sm">
          <button class="btn btn-primary" onclick="InventoryModule.addStock()">+ Add Stock</button>
          <button class="btn btn-secondary" onclick="InventoryModule.addIngredient()">+ Ingredient</button>
          <button class="btn btn-secondary" onclick="InventoryModule.receiveDelivery()">Receive</button>
          <button class="btn btn-warning" onclick="InventoryModule.logWaste()">Log Waste</button>
        </div>
      </div>
      <div id="inv-content"></div>
    </div>`;

    await this._renderTabContent();
  },

  async showTab(tab) {
    this._activeTab = tab;
    document.querySelectorAll('#inv-tabs .tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('#inv-tabs .tab').forEach(t => {
      const tabMap = {
        'Stock Levels': 'stock', 'Low Stock': 'low', 'Expiration / FIFO': 'expiry',
        'Recipes': 'recipes', 'Count Sheets': 'counts', 'Transfers': 'transfers',
        'Waste Log': 'waste', 'Forecast': 'forecast', 'Reorder': 'reorder', 'Profitability': 'profit'
      };
      const btnTab = Object.entries(tabMap).find(([label]) => t.textContent.startsWith(label));
      if (btnTab && btnTab[1] === tab) t.classList.add('active');
    });
    await this._renderTabContent();
  },

  async _renderTabContent() {
    const content = document.getElementById('inv-content');
    if (!content) return;
    UI.loading(content);

    try {
      switch (this._activeTab) {
        case 'stock': await this._renderStock(content); break;
        case 'low': await this._renderLowStock(content); break;
        case 'expiry': await this._renderExpiry(content); break;
        case 'recipes': await this._renderRecipes(content); break;
        case 'counts': await this._renderCounts(content); break;
        case 'transfers': await this._renderTransfers(content); break;
        case 'waste': await this._renderWaste(content); break;
        case 'forecast': await this._renderForecast(content); break;
        case 'reorder': await this._renderReorder(content); break;
        case 'profit': await this._renderProfitability(content); break;
        default: await this._renderStock(content);
      }
    } catch (err) {
      content.innerHTML = `<div class="card"><div class="card-body"><div class="empty-state">Error loading data: ${Utils.escapeHtml(err.message)}</div></div></div>`;
    }
  },

  // --- TAB 1: STOCK LEVELS ------------------------------------------------
  async _renderStock(content) {
    const summary = this._cache.summary || await API.inventorySummary();
    const categories = this._cache.categories || await API.inventoryCategories();
    this._cache.summary = summary;
    this._cache.categories = categories;

    const totalItems = summary.length;
    const lowStockCount = summary.filter(s => s.below_par).length;
    const totalValue = summary.reduce((sum, s) => sum + (s.total_quantity * (s.cost_per_unit || 0)), 0);
    const locations = [...new Set(summary.map(s => s.location).filter(Boolean))];
    if (locations.length === 0) locations.push('storage', 'bar', 'kitchen', 'walk-in');

    let filtered = summary;
    if (this._searchTerm) {
      const term = this._searchTerm.toLowerCase();
      filtered = filtered.filter(s => s.name.toLowerCase().includes(term));
    }
    if (this._categoryFilter) {
      filtered = filtered.filter(s => s.category_name === this._categoryFilter);
    }
    if (this._locationFilter) {
      filtered = filtered.filter(s => s.location === this._locationFilter);
    }

    content.innerHTML = `
      <div class="grid grid-3 gap-md mb-md">
        ${UI.statCard('Total Items', totalItems, '')}
        ${UI.statCard('Low Stock', lowStockCount, '')}
        ${UI.statCard('Inventory Value', Utils.currency(totalValue), '')}
      </div>
      <div class="inv-toolbar flex items-center gap-sm mb-md">
        <input type="text" class="form-input search-box" placeholder="Search ingredients..."
          value="${Utils.escapeHtml(this._searchTerm)}"
          oninput="InventoryModule._searchTerm = this.value; InventoryModule._renderStock(document.getElementById('inv-content'))">
        <select class="form-select" onchange="InventoryModule._categoryFilter = this.value; InventoryModule._renderStock(document.getElementById('inv-content'))">
          <option value="">All Categories</option>
          ${categories.map(c => `<option value="${Utils.escapeHtml(c.name)}" ${this._categoryFilter === c.name ? 'selected' : ''}>${Utils.escapeHtml(c.name)}</option>`).join('')}
        </select>
        <select class="form-select" onchange="InventoryModule._locationFilter = this.value; InventoryModule._renderStock(document.getElementById('inv-content'))">
          <option value="">All Locations</option>
          ${locations.map(l => `<option value="${Utils.escapeHtml(l)}" ${this._locationFilter === l ? 'selected' : ''}>${Utils.escapeHtml(l)}</option>`).join('')}
        </select>
      </div>
      <div class="card"><div class="card-body" style="overflow-x:auto">
        ${UI.table(
          [
            { label: 'Ingredient', key: 'name', render: (v, r) => `<div class="font-medium">${Utils.escapeHtml(v)}</div><div class="text-sm text-muted">${Utils.escapeHtml(r.category_name || '')}</div>` },
            { label: 'On Hand', key: 'total_quantity', align: 'right', render: (v, r) => `${Number(v).toFixed(1)} ${Utils.escapeHtml(r.unit)}` },
            { label: 'Stock %', key: 'stock_percent', render: (v) => {
              const pct = Math.min(Number(v) || 0, 100);
              const cls = pct < 20 ? 'danger' : pct < 50 ? 'warning' : 'success';
              return `<div class="flex items-center gap-sm">
                <div class="progress-bar stock-bar" style="width:100px"><div class="progress-fill ${cls}" style="width:${pct}%"></div></div>
                <span class="text-sm">${v}%</span>
              </div>`;
            }},
            { label: 'Open', key: 'open_count', align: 'center' },
            { label: 'Sealed', key: 'sealed_count', align: 'center' },
            { label: 'Empty', key: 'empty_count', align: 'center' },
            { label: 'Par Level', key: 'par_level', align: 'right', render: (v, r) => v > 0 ? `${v} ${Utils.escapeHtml(r.unit)}` : '-' },
            { label: 'Status', key: 'below_par', render: v => v ? '<span class="badge badge-danger">Below Par</span>' : '<span class="badge badge-success">OK</span>' },
          ],
          filtered,
          { emptyMessage: 'No inventory items found' }
        )}
      </div></div>`;
  },

  // --- TAB 2: LOW STOCK ---------------------------------------------------
  async _renderLowStock(content) {
    const items = await API.lowStock();

    content.innerHTML = `
      <div class="grid grid-2 gap-md mb-md">
        ${UI.statCard('Items Below Par', items.length, '')}
        ${UI.statCard('Est. Restock Cost', Utils.currency(items.reduce((s, i) => s + ((i.par_level - i.total_quantity) * (i.cost_per_unit || 0)), 0)), '')}
      </div>
      <div class="card"><div class="card-body" style="overflow-x:auto">
        ${UI.table(
          [
            { label: 'Ingredient', key: 'name', render: v => `<span class="font-medium">${Utils.escapeHtml(v)}</span>` },
            { label: 'On Hand', key: 'total_quantity', align: 'right', render: (v, r) => `${Number(v).toFixed(1)} ${Utils.escapeHtml(r.unit)}` },
            { label: 'Par Level', key: 'par_level', align: 'right', render: (v, r) => `${v} ${Utils.escapeHtml(r.unit)}` },
            { label: 'Capacity', key: 'total_capacity', align: 'right', render: (v, r) => `${Number(v).toFixed(1)} ${Utils.escapeHtml(r.unit)}` },
            { label: 'Stock %', key: 'total_quantity', render: (v, r) => {
              const pct = r.total_capacity > 0 ? Math.round(v / r.total_capacity * 100) : 0;
              const cls = pct < 20 ? 'danger' : pct < 50 ? 'warning' : 'success';
              return `<div class="flex items-center gap-sm">
                <div class="progress-bar stock-bar" style="width:80px"><div class="progress-fill ${cls}" style="width:${pct}%"></div></div>
                <span class="badge badge-${cls}">${pct}%</span>
              </div>`;
            }},
            { label: 'Deficit', key: 'par_level', align: 'right', render: (v, r) => {
              const deficit = Math.max(0, v - r.total_quantity);
              return `<span class="font-bold text-danger">${deficit.toFixed(1)} ${Utils.escapeHtml(r.unit)}</span>`;
            }},
            { label: 'Restock Cost', key: 'cost_per_unit', align: 'right', render: (v, r) => {
              const deficit = Math.max(0, r.par_level - r.total_quantity);
              return Utils.currency(deficit * (v || 0));
            }},
          ],
          items,
          { emptyMessage: 'All items are above par level' }
        )}
      </div></div>`;
  },

  // --- TAB 3: EXPIRATION / FIFO -------------------------------------------
  async _renderExpiry(content) {
    const isExpiring = this._expirySubView === 'expiring';

    content.innerHTML = `
      <div class="flex items-center gap-sm mb-md">
        <button class="btn ${isExpiring ? 'btn-primary' : 'btn-secondary'}" onclick="InventoryModule._expirySubView='expiring'; InventoryModule._renderTabContent()">Expiring Soon</button>
        <button class="btn ${!isExpiring ? 'btn-primary' : 'btn-secondary'}" onclick="InventoryModule._expirySubView='fifo'; InventoryModule._renderTabContent()">FIFO Order</button>
        ${isExpiring ? `
          <select class="form-select" style="width:auto;margin-left:auto" onchange="InventoryModule._expiryDays=parseInt(this.value); InventoryModule._renderTabContent()">
            <option value="3" ${this._expiryDays === 3 ? 'selected' : ''}>Next 3 Days</option>
            <option value="7" ${this._expiryDays === 7 ? 'selected' : ''}>Next 7 Days</option>
            <option value="14" ${this._expiryDays === 14 ? 'selected' : ''}>Next 14 Days</option>
          </select>
        ` : ''}
      </div>
      <div id="expiry-body"></div>`;

    const body = document.getElementById('expiry-body');
    UI.loading(body);

    if (isExpiring) {
      const items = await API.expiringItems(this._expiryDays);
      body.innerHTML = `
        <div class="grid grid-3 gap-md mb-md">
          ${UI.statCard('Expiring Items', items.length, '')}
          ${UI.statCard('Expired', items.filter(i => i.days_until_expiry <= 0).length, '')}
          ${UI.statCard('At Risk Value', Utils.currency(items.reduce((s, i) => s + (i.quantity * (i.cost_per_unit || 0)), 0)), '')}
        </div>
        <div class="card"><div class="card-body" style="overflow-x:auto">
          ${UI.table(
            [
              { label: 'Ingredient', key: 'ingredient_name', render: v => `<span class="font-medium">${Utils.escapeHtml(v)}</span>` },
              { label: 'Quantity', key: 'quantity', align: 'right', render: (v, r) => `${Number(v).toFixed(1)} ${Utils.escapeHtml(r.unit || '')}` },
              { label: 'Location', key: 'location', render: v => v ? `<span class="location-tag chip">${Utils.escapeHtml(v)}</span>` : '-' },
              { label: 'Status', key: 'status', render: v => Utils.statusBadge(v) },
              { label: 'Lot #', key: 'lot_number', render: v => v ? Utils.escapeHtml(v) : '-' },
              { label: 'Expires', key: 'expiration_date', render: (v, r) => {
                const d = r.days_until_expiry;
                let cls, label;
                if (d <= 0) { cls = 'badge-danger'; label = d === 0 ? 'Today' : 'Expired'; }
                else if (d <= 3) { cls = 'badge-warning'; label = `${d}d`; }
                else if (d <= 7) { cls = 'badge-info'; label = `${d}d`; }
                else { cls = 'badge-success'; label = `${d}d`; }
                return `<span class="expiry-badge badge ${cls}">${label}</span> <span class="text-sm text-muted">${Utils.formatDate(v)}</span>`;
              }},
              { label: 'Value', key: 'cost_per_unit', align: 'right', render: (v, r) => Utils.currency((v || 0) * r.quantity) },
            ],
            items,
            { emptyMessage: 'No items expiring in this period' }
          )}
        </div></div>`;
    } else {
      const fifo = await API.fifoOrder();
      const grouped = {};
      fifo.forEach(item => {
        if (!grouped[item.ingredient_name]) grouped[item.ingredient_name] = [];
        grouped[item.ingredient_name].push(item);
      });

      let html = '';
      Object.entries(grouped).forEach(([name, items]) => {
        html += `
          <div class="card mb-md">
            <div class="card-header flex justify-between items-center">
              <span class="font-bold">${Utils.escapeHtml(name)}</span>
              <span class="badge badge-info">${items.length} container${items.length !== 1 ? 's' : ''}</span>
            </div>
            <div class="card-body" style="overflow-x:auto">
              ${UI.table(
                [
                  { label: '#', key: 'id', render: (v, r, idx) => `<span class="badge ${idx === 0 ? 'badge-success' : 'badge-info'}">${idx === 0 ? 'USE FIRST' : idx + 1}</span>` },
                  { label: 'Quantity', key: 'quantity', align: 'right', render: (v, r) => `${Number(v).toFixed(1)} ${Utils.escapeHtml(r.unit || '')}` },
                  { label: 'Location', key: 'location', render: v => v ? `<span class="location-tag chip">${Utils.escapeHtml(v)}</span>` : '-' },
                  { label: 'Status', key: 'status', render: v => Utils.statusBadge(v) },
                  { label: 'Received', key: 'received_date', render: v => v ? Utils.formatDate(v) : '-' },
                  { label: 'Expires', key: 'expiration_date', render: (v, r) => {
                    if (!v) return '-';
                    const d = r.days_until_expiry;
                    const cls = d <= 0 ? 'badge-danger' : d <= 3 ? 'badge-warning' : d <= 7 ? 'badge-info' : 'badge-success';
                    return `<span class="expiry-badge badge ${cls}">${d <= 0 ? 'Expired' : d + 'd'}</span> ${Utils.formatDate(v)}`;
                  }},
                ],
                items,
                { emptyMessage: 'No containers' }
              )}
            </div>
          </div>`;
      });

      body.innerHTML = html || '<div class="empty-state">No FIFO data available</div>';
    }
  },

  // --- TAB 4: RECIPES -----------------------------------------------------
  async _renderRecipes(content) {
    const recipes = await API.inventoryRecipes();

    content.innerHTML = `
      <div class="grid grid-3 gap-md mb-md">
        ${UI.statCard('Menu Items', recipes.length, '')}
        ${UI.statCard('Avg Food Cost %', (recipes.length ? (recipes.reduce((s, r) => s + (r.food_cost_percent || 0), 0) / recipes.length).toFixed(1) : 0) + '%', '')}
        ${UI.statCard('Items > 35%', recipes.filter(r => r.food_cost_percent > 35).length, '')}
      </div>
      <div id="recipes-list"></div>`;

    const list = document.getElementById('recipes-list');
    if (!recipes.length) {
      list.innerHTML = '<div class="empty-state">No recipes found</div>';
      return;
    }

    let html = '';
    recipes.forEach(r => {
      const costCls = r.food_cost_percent > 35 ? 'badge-danger' : r.food_cost_percent > 28 ? 'badge-warning' : 'badge-success';
      html += `
        <div class="card mb-md">
          <div class="card-header flex justify-between items-center" style="cursor:pointer" onclick="InventoryModule._toggleRecipe(${r.menu_item_id}, this)">
            <div>
              <span class="font-bold">${Utils.escapeHtml(r.menu_item_name)}</span>
              <span class="text-sm text-muted" style="margin-left:8px">${Utils.escapeHtml(r.category_name || '')}</span>
            </div>
            <div class="flex items-center gap-sm">
              <span class="text-sm">Price: ${Utils.currency(r.price)}</span>
              <span class="text-sm">Cost: ${Utils.currency(r.recipe_cost || r.cost)}</span>
              <span class="badge ${costCls}">${(r.food_cost_percent || 0).toFixed(1)}%</span>
              <span class="text-muted"></span>
            </div>
          </div>
          <div class="card-body recipe-builder" id="recipe-${r.menu_item_id}" style="display:none">
            <div class="text-muted text-sm">Click to load recipe details...</div>
          </div>
        </div>`;
    });
    list.innerHTML = html;
  },

  async _toggleRecipe(menuItemId, headerEl) {
    const body = document.getElementById(`recipe-${menuItemId}`);
    if (!body) return;

    if (body.style.display !== 'none') {
      body.style.display = 'none';
      return;
    }
    body.style.display = '';
    UI.loading(body);

    const [recipe, allIngredients] = await Promise.all([
      API.recipeForItem(menuItemId),
      API.ingredients()
    ]);

    this._recipeEdits = this._recipeEdits || {};
    this._recipeEdits[menuItemId] = recipe.map(r => ({ ...r }));

    this._renderRecipeBody(menuItemId, allIngredients);
  },

  _renderRecipeBody(menuItemId, allIngredients) {
    const body = document.getElementById(`recipe-${menuItemId}`);
    if (!body) return;
    const items = this._recipeEdits[menuItemId] || [];

    const totalCost = items.reduce((s, i) => s + ((i.cost_per_unit || 0) * (i.quantity || 0)), 0);

    let rowsHtml = '';
    items.forEach((item, idx) => {
      const lineCost = (item.cost_per_unit || 0) * (item.quantity || 0);
      rowsHtml += `
        <div class="form-row flex items-center gap-sm mb-md" data-recipe-row="${idx}">
          <div class="form-group" style="flex:2">
            <select class="form-select" onchange="InventoryModule._updateRecipeRow(${menuItemId}, ${idx}, 'ingredient_id', parseInt(this.value))">
              <option value="">Select ingredient...</option>
              ${allIngredients.map(ing => `<option value="${ing.id}" ${ing.id === item.ingredient_id ? 'selected' : ''}>${Utils.escapeHtml(ing.name)} (${Utils.escapeHtml(ing.unit)}) - ${Utils.currency(ing.cost_per_unit)}/unit</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="flex:1">
            <input type="number" class="form-input" step="0.01" placeholder="Qty" value="${item.quantity || ''}"
              onchange="InventoryModule._updateRecipeRow(${menuItemId}, ${idx}, 'quantity', parseFloat(this.value))">
          </div>
          <div class="form-group" style="flex:0.7">
            <input type="text" class="form-input" value="${Utils.escapeHtml(item.unit || '')}" placeholder="Unit"
              onchange="InventoryModule._updateRecipeRow(${menuItemId}, ${idx}, 'unit', this.value)">
          </div>
          <div class="text-sm font-medium" style="min-width:70px;text-align:right">${Utils.currency(lineCost)}</div>
          <button class="btn btn-danger" style="padding:4px 8px" onclick="InventoryModule._removeRecipeRow(${menuItemId}, ${idx})">X</button>
        </div>`;
    });

    body.innerHTML = `
      <div class="mb-md">
        ${rowsHtml || '<div class="text-muted text-sm mb-md">No ingredients in recipe yet.</div>'}
      </div>
      <div class="flex justify-between items-center">
        <button class="btn btn-secondary" onclick="InventoryModule._addRecipeRow(${menuItemId})">+ Add Ingredient</button>
        <div class="flex items-center gap-sm">
          <span class="font-bold">Total Cost: ${Utils.currency(totalCost)}</span>
          <button class="btn btn-primary" onclick="InventoryModule._saveRecipe(${menuItemId})">Save Recipe</button>
        </div>
      </div>`;
  },

  _updateRecipeRow(menuItemId, idx, field, value) {
    if (!this._recipeEdits[menuItemId]) return;
    const row = this._recipeEdits[menuItemId][idx];
    if (!row) return;

    if (field === 'ingredient_id') {
      row.ingredient_id = value;
      API.ingredients().then(all => {
        const ing = all.find(i => i.id === value);
        if (ing) {
          row.cost_per_unit = ing.cost_per_unit;
          row.unit = ing.unit;
          row.ingredient_name = ing.name;
          this._renderRecipeBody(menuItemId, all);
        }
      });
    } else {
      row[field] = value;
      if (field === 'quantity') {
        API.ingredients().then(all => this._renderRecipeBody(menuItemId, all));
      }
    }
  },

  async _addRecipeRow(menuItemId) {
    if (!this._recipeEdits[menuItemId]) this._recipeEdits[menuItemId] = [];
    this._recipeEdits[menuItemId].push({ ingredient_id: null, quantity: 0, unit: '', cost_per_unit: 0 });
    const allIngredients = await API.ingredients();
    this._renderRecipeBody(menuItemId, allIngredients);
  },

  async _removeRecipeRow(menuItemId, idx) {
    if (!this._recipeEdits[menuItemId]) return;
    this._recipeEdits[menuItemId].splice(idx, 1);
    const allIngredients = await API.ingredients();
    this._renderRecipeBody(menuItemId, allIngredients);
  },

  async _saveRecipe(menuItemId) {
    const items = (this._recipeEdits[menuItemId] || []).filter(i => i.ingredient_id && i.quantity > 0);
    if (!items.length) {
      UI.toast('Error', 'Recipe must have at least one ingredient', 'danger');
      return;
    }
    try {
      await API.saveRecipe(menuItemId, items.map(i => ({
        ingredient_id: i.ingredient_id,
        quantity: i.quantity,
        unit: i.unit
      })));
      UI.toast('Recipe Saved', 'Recipe updated successfully', 'success');
      await this._renderRecipes(document.getElementById('inv-content'));
    } catch (err) {
      UI.toast('Error', err.message, 'danger');
    }
  },

  // --- TAB 5: COUNT SHEETS ------------------------------------------------
  async _renderCounts(content) {
    const counts = await API.inventoryCounts();

    content.innerHTML = `
      <div class="flex justify-between items-center mb-md">
        <div class="flex items-center gap-sm">
          ${UI.statCard('Total Counts', counts.length, '')}
        </div>
        <button class="btn btn-primary" onclick="InventoryModule._startNewCount()">+ New Count</button>
      </div>
      <div class="card"><div class="card-body" style="overflow-x:auto">
        ${UI.table(
          [
            { label: 'Date', key: 'count_date', render: v => Utils.formatDate(v) },
            { label: 'Counted By', key: 'employee_name', render: v => Utils.escapeHtml(v || 'Unknown') },
            { label: 'Status', key: 'status', render: v => Utils.statusBadge(v) },
            { label: 'Items', key: 'item_count', align: 'center' },
            { label: 'Variance Cost', key: 'total_variance_cost', align: 'right', render: v => {
              const val = Number(v) || 0;
              const cls = Math.abs(val) > 50 ? 'text-danger font-bold' : '';
              return `<span class="${cls}">${Utils.currency(val)}</span>`;
            }},
            { label: 'Notes', key: 'notes', render: v => v ? Utils.escapeHtml(v) : '-' },
            { label: '', key: 'id', render: v => `<button class="btn btn-secondary" style="padding:4px 12px" onclick="InventoryModule._viewCount(${v})">View</button>` },
          ],
          counts,
          { emptyMessage: 'No inventory counts recorded yet' }
        )}
      </div></div>`;
  },

  async _startNewCount() {
    const ingredients = await API.ingredients();
    if (!ingredients.length) {
      UI.toast('Error', 'No ingredients to count', 'danger');
      return;
    }

    let rows = ingredients.map(ing => `
      <div class="form-row count-sheet flex items-center gap-sm" style="padding:6px 0;border-bottom:1px solid var(--border-color,#eee)" data-ing-id="${ing.id}">
        <div style="flex:2" class="font-medium">${Utils.escapeHtml(ing.name)}</div>
        <div style="flex:0.7" class="text-sm text-muted">${Utils.escapeHtml(ing.unit)}</div>
        <div style="flex:1"><input type="number" class="form-input count-qty" step="0.01" placeholder="Actual qty" data-id="${ing.id}"></div>
      </div>`).join('');

    const html = `
      <div style="max-height:50vh;overflow-y:auto;margin-bottom:12px">
        <div class="flex items-center gap-sm" style="padding:6px 0;border-bottom:2px solid var(--border-color,#ccc)">
          <div style="flex:2" class="font-bold">Ingredient</div>
          <div style="flex:0.7" class="font-bold">Unit</div>
          <div style="flex:1" class="font-bold">Actual Qty</div>
        </div>
        ${rows}
      </div>
      <div class="form-group">
        <label class="form-label">Notes</label>
        <input class="form-input" id="count-notes" placeholder="Optional notes...">
      </div>`;

    const modal = await UI.modal('New Inventory Count', html, { confirmText: 'Submit Count', size: 'lg' });
    if (!modal) return;

    const items = [];
    modal.querySelectorAll('.count-qty').forEach(input => {
      const val = parseFloat(input.value);
      if (!isNaN(val)) {
        items.push({ ingredient_id: parseInt(input.dataset.id), actual_qty: val });
      }
    });

    if (!items.length) {
      UI.toast('Error', 'Please enter at least one quantity', 'danger');
      return;
    }

    try {
      await API.submitCount({
        items,
        notes: modal.querySelector('#count-notes').value || '',
        employee_id: App.employee?.id
      });
      UI.toast('Count Submitted', `${items.length} items counted`, 'success');
      await this._renderCounts(document.getElementById('inv-content'));
    } catch (err) {
      UI.toast('Error', err.message, 'danger');
    }
  },

  async _viewCount(countId) {
    const data = await API.inventoryCount(countId);

    const items = data.items || [];
    const tableHtml = UI.table(
      [
        { label: 'Ingredient', key: 'ingredient_name', render: v => `<span class="font-medium">${Utils.escapeHtml(v)}</span>` },
        { label: 'Unit', key: 'unit' },
        { label: 'Expected', key: 'expected_qty', align: 'right', render: v => Number(v).toFixed(2) },
        { label: 'Actual', key: 'actual_qty', align: 'right', render: v => Number(v).toFixed(2) },
        { label: 'Variance', key: 'variance', align: 'right', render: v => {
          const val = Number(v);
          const cls = val < 0 ? 'text-danger font-bold' : val > 0 ? 'text-success' : '';
          return `<span class="${cls}">${val > 0 ? '+' : ''}${val.toFixed(2)}</span>`;
        }},
        { label: 'Variance Cost', key: 'variance_cost', align: 'right', render: v => {
          const val = Number(v) || 0;
          const cls = val < 0 ? 'text-danger' : '';
          return `<span class="${cls}">${Utils.currency(val)}</span>`;
        }},
      ],
      items,
      { emptyMessage: 'No items in this count' }
    );

    const html = `
      <div class="grid grid-3 gap-md mb-md">
        <div><span class="text-sm text-muted">Date</span><br><span class="font-medium">${Utils.formatDate(data.count_date)}</span></div>
        <div><span class="text-sm text-muted">Counted By</span><br><span class="font-medium">${Utils.escapeHtml(data.employee_name || 'Unknown')}</span></div>
        <div><span class="text-sm text-muted">Status</span><br>${Utils.statusBadge(data.status)}</div>
      </div>
      ${data.notes ? `<div class="mb-md text-sm"><strong>Notes:</strong> ${Utils.escapeHtml(data.notes)}</div>` : ''}
      <div style="overflow-x:auto">${tableHtml}</div>`;

    await UI.modal(`Inventory Count #${countId}`, html, { size: 'xl', showCancel: false, confirmText: 'Close' });
  },

  // --- TAB 6: TRANSFERS ---------------------------------------------------
  async _renderTransfers(content) {
    const transfers = await API.stockTransfers();
    const pending = transfers.filter(t => t.status === 'pending');
    const completed = transfers.filter(t => t.status === 'completed');
    const rejected = transfers.filter(t => t.status === 'rejected');
    const isManager = App.employee?.role === 'manager' || App.employee?.role === 'admin';

    content.innerHTML = `
      <div class="flex justify-between items-center mb-md">
        <div class="grid grid-3 gap-md">
          ${UI.statCard('Pending', pending.length, '')}
          ${UI.statCard('Completed', completed.length, '')}
          ${UI.statCard('Rejected', rejected.length, '')}
        </div>
        <button class="btn btn-primary" onclick="InventoryModule._requestTransfer()">+ Request Transfer</button>
      </div>
      ${pending.length ? `
        <h3 class="font-bold mb-md">Pending Transfers</h3>
        <div class="grid grid-2 gap-md mb-md">
          ${pending.map(t => `
            <div class="card transfer-card">
              <div class="card-body">
                <div class="flex justify-between items-center mb-md">
                  <span class="font-bold">${Utils.escapeHtml(t.ingredient_name)}</span>
                  <span class="badge badge-warning">Pending</span>
                </div>
                <div class="grid grid-2 gap-sm text-sm mb-md">
                  <div><span class="text-muted">From:</span> <span class="location-tag chip">${Utils.escapeHtml(t.from_location)}</span></div>
                  <div><span class="text-muted">To:</span> <span class="location-tag chip">${Utils.escapeHtml(t.to_location)}</span></div>
                  <div><span class="text-muted">Qty:</span> <span class="font-medium">${t.quantity} ${Utils.escapeHtml(t.unit || '')}</span></div>
                  <div><span class="text-muted">By:</span> ${Utils.escapeHtml(t.requested_by_name || 'Unknown')}</div>
                </div>
                <div class="text-sm text-muted mb-md">${Utils.timeAgo(t.created_at)}</div>
                ${isManager ? `
                  <div class="flex gap-sm">
                    <button class="btn btn-primary" onclick="InventoryModule._approveTransfer(${t.id})">Approve</button>
                    <button class="btn btn-danger" onclick="InventoryModule._rejectTransfer(${t.id})">Reject</button>
                  </div>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
      <h3 class="font-bold mb-md">All Transfers</h3>
      <div class="card"><div class="card-body" style="overflow-x:auto">
        ${UI.table(
          [
            { label: 'Ingredient', key: 'ingredient_name', render: v => `<span class="font-medium">${Utils.escapeHtml(v)}</span>` },
            { label: 'From', key: 'from_location', render: v => `<span class="location-tag chip">${Utils.escapeHtml(v)}</span>` },
            { label: 'To', key: 'to_location', render: v => `<span class="location-tag chip">${Utils.escapeHtml(v)}</span>` },
            { label: 'Quantity', key: 'quantity', align: 'right', render: (v, r) => `${v} ${Utils.escapeHtml(r.unit || '')}` },
            { label: 'Status', key: 'status', render: v => Utils.statusBadge(v) },
            { label: 'Requested', key: 'requested_by_name', render: v => Utils.escapeHtml(v || 'Unknown') },
            { label: 'Approved', key: 'approved_by_name', render: v => v ? Utils.escapeHtml(v) : '-' },
            { label: 'Date', key: 'created_at', render: v => Utils.timeAgo(v) },
          ],
          transfers,
          { emptyMessage: 'No transfers found' }
        )}
      </div></div>`;
  },

  async _requestTransfer() {
    const ingredients = await API.ingredients();
    const locations = ['storage', 'bar', 'kitchen', 'walk-in'];

    const html = `
      <div class="form-group">
        <label class="form-label">Ingredient</label>
        <select class="form-select" id="xfer-ing">
          ${ingredients.map(i => `<option value="${i.id}">${Utils.escapeHtml(i.name)} (${Utils.escapeHtml(i.unit)})</option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">From Location</label>
          <select class="form-select" id="xfer-from">
            ${locations.map(l => `<option value="${l}">${l}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">To Location</label>
          <select class="form-select" id="xfer-to">
            ${locations.map((l, i) => `<option value="${l}" ${i === 1 ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Quantity</label>
        <input type="number" class="form-input" id="xfer-qty" step="0.01">
      </div>
      <div class="form-group">
        <label class="form-label">Notes</label>
        <input class="form-input" id="xfer-notes" placeholder="Optional notes...">
      </div>`;

    const modal = await UI.modal('Request Stock Transfer', html, { confirmText: 'Submit Request' });
    if (!modal) return;

    const from = modal.querySelector('#xfer-from').value;
    const to = modal.querySelector('#xfer-to').value;
    if (from === to) {
      UI.toast('Error', 'From and To locations must be different', 'danger');
      return;
    }

    try {
      await API.transferStock({
        ingredient_id: parseInt(modal.querySelector('#xfer-ing').value),
        from_location: from,
        to_location: to,
        quantity: parseFloat(modal.querySelector('#xfer-qty').value),
        requested_by: App.employee?.id,
        notes: modal.querySelector('#xfer-notes').value || ''
      });
      UI.toast('Transfer Requested', 'Awaiting approval', 'success');
      await this._renderTransfers(document.getElementById('inv-content'));
    } catch (err) {
      UI.toast('Error', err.message, 'danger');
    }
  },

  async _approveTransfer(id) {
    const ok = await UI.confirm('Approve Transfer', 'Are you sure you want to approve this transfer?');
    if (!ok) return;
    try {
      await API.approveTransfer(id, App.employee?.id);
      UI.toast('Transfer Approved', '', 'success');
      await this._renderTransfers(document.getElementById('inv-content'));
    } catch (err) {
      UI.toast('Error', err.message, 'danger');
    }
  },

  async _rejectTransfer(id) {
    const ok = await UI.confirm('Reject Transfer', 'Are you sure you want to reject this transfer?');
    if (!ok) return;
    try {
      await API.rejectTransfer(id);
      UI.toast('Transfer Rejected', '', 'warning');
      await this._renderTransfers(document.getElementById('inv-content'));
    } catch (err) {
      UI.toast('Error', err.message, 'danger');
    }
  },

  // --- TAB 7: WASTE LOG ---------------------------------------------------
  async _renderWaste(content) {
    const waste = await API.getWaste();

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekWaste = waste.filter(w => new Date(w.created_at) >= weekAgo);
    const weekCost = weekWaste.reduce((s, w) => s + (Number(w.cost) || 0), 0);
    const totalCost = waste.reduce((s, w) => s + (Number(w.cost) || 0), 0);
    const topReason = waste.length ? (() => {
      const counts = {};
      waste.forEach(w => { counts[w.reason] = (counts[w.reason] || 0) + 1; });
      return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';
    })() : '-';

    content.innerHTML = `
      <div class="grid grid-3 gap-md mb-md">
        ${UI.statCard('This Week', Utils.currency(weekCost), '')}
        ${UI.statCard('Total Waste Cost', Utils.currency(totalCost), '')}
        ${UI.statCard('Top Reason', topReason, '')}
      </div>
      <div class="flex justify-between items-center mb-md">
        <span class="font-bold">${waste.length} waste entries</span>
        <button class="btn btn-warning" onclick="InventoryModule.logWaste()">+ Log Waste</button>
      </div>
      <div class="card"><div class="card-body" style="overflow-x:auto">
        ${UI.table(
          [
            { label: 'Ingredient', key: 'ingredient_name', render: v => `<span class="font-medium">${Utils.escapeHtml(v)}</span>` },
            { label: 'Quantity', key: 'quantity', align: 'right', render: (v, r) => `${v} ${Utils.escapeHtml(r.unit || '')}` },
            { label: 'Reason', key: 'reason', render: v => {
              const cls = v === 'expired' || v === 'spoiled' ? 'badge-danger' : v === 'spill' || v === 'mistake' ? 'badge-warning' : 'badge-info';
              return `<span class="badge ${cls}">${Utils.escapeHtml(v)}</span>`;
            }},
            { label: 'Cost', key: 'cost', align: 'right', render: v => `<span class="font-medium">${Utils.currency(v)}</span>` },
            { label: 'Logged By', key: 'employee_name', render: v => Utils.escapeHtml(v || 'Unknown') },
            { label: 'When', key: 'created_at', render: v => Utils.timeAgo(v) },
          ],
          waste,
          { emptyMessage: 'No waste logged' }
        )}
      </div></div>`;
  },

  // --- TAB 8: FORECAST -------------------------------------------------
  async _renderForecast(content) {
    const data = await API.inventoryForecast(7);

    const reorderCount = data.filter(d => d.should_reorder).length;
    const criticalCount = data.filter(d => d.days_until_empty <= 3 && d.days_until_empty !== 999).length;

    content.innerHTML = `
      <div class="grid grid-3 gap-md mb-md">
        ${UI.statCard('Items Tracked', data.length, '')}
        ${UI.statCard('Need Reorder', reorderCount, '')}
        ${UI.statCard('Critical (3d)', criticalCount, '')}
      </div>
      <div class="card"><div class="card-body" style="overflow-x:auto">
        ${UI.table(
          [
            { label: 'Ingredient', key: 'name', render: v => `<span class="font-medium">${Utils.escapeHtml(v)}</span>` },
            { label: 'Current Stock', key: 'current_stock', align: 'right', render: (v, r) => `${Number(v).toFixed(1)} ${Utils.escapeHtml(r.unit)}` },
            { label: 'Avg Daily Use', key: 'avg_daily_usage', align: 'right', render: v => Number(v).toFixed(2) },
            { label: 'Days Left', key: 'days_until_empty', render: v => {
              if (v === 999 || v == null) return '<span class="text-muted">N/A</span>';
              const cls = v <= 2 ? 'badge-danger' : v <= 5 ? 'badge-warning' : 'badge-success';
              return `<span class="badge ${cls}">${v} days</span>`;
            }},
            { label: '7-Day Need', key: 'forecast_needed', align: 'right', render: v => Number(v).toFixed(1) },
            { label: 'Par Level', key: 'par_level', align: 'right', render: v => v > 0 ? v : '-' },
            { label: 'Action', key: 'should_reorder', render: v => v ? '<span class="badge badge-danger">Reorder</span>' : '<span class="badge badge-success">OK</span>' },
          ],
          data,
          { emptyMessage: 'No usage data available' }
        )}
      </div></div>`;
  },

  // --- TAB 9: REORDER -----------------------------------------------------
  async _renderReorder(content) {
    const suggestions = await API.reorderSuggestions();

    const criticalCount = suggestions.filter(s => s.urgency === 'critical').length;
    const totalEstCost = suggestions.reduce((s, r) => s + (Number(r.est_cost) || 0), 0);

    content.innerHTML = `
      <div class="grid grid-3 gap-md mb-md">
        ${UI.statCard('Suggestions', suggestions.length, '')}
        ${UI.statCard('Critical', criticalCount, '')}
        ${UI.statCard('Est. Total Cost', Utils.currency(totalEstCost), '')}
      </div>
      ${suggestions.length ? `<div class="grid grid-2 gap-md">
        ${suggestions.map(s => {
          const urgCls = s.urgency === 'critical' ? 'urgency-critical' : s.urgency === 'high' ? 'urgency-high' : '';
          const borderColor = s.urgency === 'critical' ? '#e74c3c' : s.urgency === 'high' ? '#f39c12' : '#3498db';
          const urgBadge = s.urgency === 'critical' ? 'badge-danger' : s.urgency === 'high' ? 'badge-warning' : 'badge-info';
          return `
            <div class="card reorder-card ${urgCls}" style="border-left:4px solid ${borderColor}">
              <div class="card-body">
                <div class="flex justify-between items-center mb-md">
                  <span class="font-bold">${Utils.escapeHtml(s.name)}</span>
                  <span class="badge ${urgBadge}">${Utils.escapeHtml(s.urgency || 'medium')}</span>
                </div>
                <div class="grid grid-2 gap-sm text-sm mb-md">
                  <div><span class="text-muted">Current:</span> <span class="font-medium">${Number(s.current_stock).toFixed(1)} ${Utils.escapeHtml(s.unit)}</span></div>
                  <div><span class="text-muted">Par Level:</span> ${s.par_level} ${Utils.escapeHtml(s.unit)}</div>
                  <div><span class="text-muted">Days Left:</span> <span class="font-bold ${s.days_left <= 3 ? 'text-danger' : ''}">${s.days_left != null ? s.days_left + ' days' : 'N/A'}</span></div>
                  <div><span class="text-muted">Daily Use:</span> ${Number(s.avg_daily_usage).toFixed(2)} ${Utils.escapeHtml(s.unit)}</div>
                  <div><span class="text-muted">Order Qty:</span> <span class="font-bold">${Number(s.suggested_order_qty).toFixed(1)} ${Utils.escapeHtml(s.unit)}</span></div>
                  <div><span class="text-muted">Est. Cost:</span> <span class="font-bold">${Utils.currency(s.est_cost)}</span></div>
                </div>
                ${s.reason ? `<div class="text-sm text-muted mb-md">${Utils.escapeHtml(s.reason)}</div>` : ''}
                ${s.supplier_name ? `
                  <div class="text-sm mb-md" style="padding:8px;background:var(--bg-secondary,#f8f9fa);border-radius:6px">
                    <div class="font-medium">${Utils.escapeHtml(s.supplier_name)}</div>
                    ${s.supplier_email ? `<div class="text-muted">${Utils.escapeHtml(s.supplier_email)}</div>` : ''}
                    ${s.supplier_phone ? `<div class="text-muted">${Utils.escapeHtml(s.supplier_phone)}</div>` : ''}
                  </div>
                ` : ''}
                <button class="btn btn-primary" style="width:100%" onclick="InventoryModule._sendOrder('${Utils.escapeHtml(s.name)}', ${Number(s.suggested_order_qty).toFixed(1)}, '${Utils.escapeHtml(s.unit)}', '${Utils.escapeHtml(s.supplier_name || '')}')">Send Order</button>
              </div>
            </div>`;
        }).join('')}
      </div>` : '<div class="empty-state">No reorder suggestions at this time</div>'}`;
  },

  _sendOrder(name, qty, unit, supplier) {
    UI.toast('Order Sent', `Order for ${qty} ${unit} of ${name}${supplier ? ' sent to ' + supplier : ''} has been submitted.`, 'success');
  },

  // --- MODALS ------------------------------------------------------------

  async addIngredient() {
    const [categories, suppliers] = await Promise.all([API.inventoryCategories(), API.suppliers()]);
    const html = `
      <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="ing-name"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Category</label><select class="form-select" id="ing-cat"><option value="">None</option>${categories.map(c => `<option value="${c.id}">${Utils.escapeHtml(c.name)}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">Unit</label><select class="form-select" id="ing-unit"><option>oz</option><option>ml</option><option>each</option><option>lbs</option><option>liters</option><option>grams</option><option>kg</option></select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Cost/Unit</label><input type="number" class="form-input" id="ing-cost" step="0.01"></div>
        <div class="form-group"><label class="form-label">Par Level</label><input type="number" class="form-input" id="ing-par" step="0.1"></div>
      </div>
      <div class="form-group"><label class="form-label">Supplier</label><select class="form-select" id="ing-sup"><option value="">None</option>${suppliers.map(s => `<option value="${s.id}">${Utils.escapeHtml(s.name)}</option>`).join('')}</select></div>
    `;
    const modal = await UI.modal('Add Ingredient', html, { confirmText: 'Create' });
    if (!modal) return;
    const name = modal.querySelector('#ing-name').value.trim();
    if (!name) {
      UI.toast('Error', 'Ingredient name is required', 'danger');
      return;
    }
    try {
      await API.addIngredient({
        name,
        category_id: modal.querySelector('#ing-cat').value || null,
        unit: modal.querySelector('#ing-unit').value,
        cost_per_unit: parseFloat(modal.querySelector('#ing-cost').value) || 0,
        par_level: parseFloat(modal.querySelector('#ing-par').value) || 0,
        supplier_id: modal.querySelector('#ing-sup').value || null,
      });
      UI.toast('Ingredient Added', `${name} has been created`, 'success');
      this._cache = {};
      this.render(this._container || document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async addStock() {
    const ingredients = await API.ingredients();
    const html = `
      <div class="form-group"><label class="form-label">Ingredient</label><select class="form-select" id="stk-ing">${ingredients.map(i => `<option value="${i.id}">${Utils.escapeHtml(i.name)} (${Utils.escapeHtml(i.unit)})</option>`).join('')}</select></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Quantity</label><input type="number" class="form-input" id="stk-qty" step="0.01"></div>
        <div class="form-group"><label class="form-label">Location</label><select class="form-select" id="stk-loc"><option>storage</option><option>bar</option><option>kitchen</option><option>walk-in</option></select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Expiration Date</label><input type="date" class="form-input" id="stk-exp"></div>
        <div class="form-group"><label class="form-label">Lot Number</label><input class="form-input" id="stk-lot" placeholder="Optional"></div>
      </div>
    `;
    const modal = await UI.modal('Add Stock', html, { confirmText: 'Add' });
    if (!modal) return;
    const qty = parseFloat(modal.querySelector('#stk-qty').value);
    if (!qty || qty <= 0) {
      UI.toast('Error', 'Please enter a valid quantity', 'danger');
      return;
    }
    try {
      await API.addStock({
        ingredient_id: parseInt(modal.querySelector('#stk-ing').value),
        quantity: qty,
        location: modal.querySelector('#stk-loc').value,
        expiration_date: modal.querySelector('#stk-exp').value || null,
        lot_number: modal.querySelector('#stk-lot').value || null,
      });
      UI.toast('Stock Added', '', 'success');
      this._cache = {};
      this.render(this._container || document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async logWaste() {
    const ingredients = await API.ingredients();
    const html = `
      <div class="form-group"><label class="form-label">Ingredient</label><select class="form-select" id="w-ing">${ingredients.map(i => `<option value="${i.id}" data-cost="${i.cost_per_unit}" data-unit="${Utils.escapeHtml(i.unit)}">${Utils.escapeHtml(i.name)} (${Utils.escapeHtml(i.unit)})</option>`).join('')}</select></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Quantity</label><input type="number" class="form-input" id="w-qty" step="0.01"></div>
        <div class="form-group"><label class="form-label">Reason</label><select class="form-select" id="w-reason"><option>expired</option><option>spoiled</option><option>spill</option><option>overcooked</option><option>overprepped</option><option>mistake</option><option>contamination</option><option>other</option></select></div>
      </div>
      <div class="form-group"><label class="form-label">Notes</label><input class="form-input" id="w-notes" placeholder="Optional notes..."></div>
      <div class="text-sm text-muted" id="w-cost-preview">Estimated cost: $0.00</div>
    `;
    const modal = await UI.modal('Log Waste', html, {
      confirmText: 'Log Waste',
      onMount: (el) => {
        const updateCost = () => {
          const ingEl = el.querySelector('#w-ing');
          const costPerUnit = parseFloat(ingEl.selectedOptions[0]?.dataset.cost || '0');
          const qty = parseFloat(el.querySelector('#w-qty').value) || 0;
          el.querySelector('#w-cost-preview').textContent = `Estimated cost: ${Utils.currency(costPerUnit * qty)}`;
        };
        el.querySelector('#w-ing').addEventListener('change', updateCost);
        el.querySelector('#w-qty').addEventListener('input', updateCost);
      }
    });
    if (!modal) return;
    const ingEl = modal.querySelector('#w-ing');
    const costPerUnit = parseFloat(ingEl.selectedOptions[0]?.dataset.cost || '0');
    const qty = parseFloat(modal.querySelector('#w-qty').value);
    if (!qty || qty <= 0) {
      UI.toast('Error', 'Please enter a valid quantity', 'danger');
      return;
    }
    try {
      await API.logWaste({
        ingredient_id: parseInt(ingEl.value),
        quantity: qty,
        reason: modal.querySelector('#w-reason').value,
        cost: +(costPerUnit * qty).toFixed(2),
        employee_id: App.employee?.id,
        notes: modal.querySelector('#w-notes').value,
      });
      UI.toast('Waste Logged', `${qty} ${ingEl.selectedOptions[0]?.dataset.unit || ''} wasted (${Utils.currency(costPerUnit * qty)})`, 'warning');
      if (this._activeTab === 'waste') {
        await this._renderWaste(document.getElementById('inv-content'));
      }
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async receiveDelivery() {
    const [suppliers, ingredients] = await Promise.all([API.suppliers(), API.ingredients()]);
    const html = `
      <div class="form-group"><label class="form-label">Supplier</label><select class="form-select" id="rcv-sup">${suppliers.map(s => `<option value="${s.id}">${Utils.escapeHtml(s.name)}</option>`).join('')}</select></div>
      <div id="rcv-items">
        <div class="form-row rcv-line" data-line="0">
          <div class="form-group" style="flex:2"><label class="form-label">Ingredient</label><select class="form-select rcv-ing">${ingredients.map(i => `<option value="${i.id}">${Utils.escapeHtml(i.name)} (${Utils.escapeHtml(i.unit)})</option>`).join('')}</select></div>
          <div class="form-group" style="flex:1"><label class="form-label">Quantity</label><input type="number" class="form-input rcv-qty" step="0.01"></div>
          <div class="form-group" style="flex:1"><label class="form-label">Location</label><select class="form-select rcv-loc"><option>storage</option><option>bar</option><option>kitchen</option><option>walk-in</option></select></div>
        </div>
      </div>
      <button class="btn btn-secondary" style="margin-top:8px" onclick="
        var c = document.querySelector('.rcv-line').cloneNode(true);
        c.querySelectorAll('input').forEach(function(i){i.value=''});
        c.querySelectorAll('.form-label').forEach(function(l){l.style.display='none'});
        document.getElementById('rcv-items').appendChild(c);
      ">+ Add Item</button>
    `;
    const modal = await UI.modal('Receive Delivery', html, { confirmText: 'Receive', size: 'lg' });
    if (!modal) return;

    const items = [];
    modal.querySelectorAll('.rcv-line').forEach(line => {
      const qty = parseFloat(line.querySelector('.rcv-qty').value);
      if (qty > 0) {
        items.push({
          ingredient_id: parseInt(line.querySelector('.rcv-ing').value),
          quantity: qty,
          location: line.querySelector('.rcv-loc').value
        });
      }
    });

    if (!items.length) {
      UI.toast('Error', 'Please enter at least one item', 'danger');
      return;
    }

    try {
      await API.receiveDelivery({
        items,
        supplier_id: parseInt(modal.querySelector('#rcv-sup').value),
      });
      UI.toast('Delivery Received', `${items.length} item(s) received`, 'success');
      this._cache = {};
      this.render(this._container || document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  // ============================================================
  // PROFITABILITY TAB
  // ============================================================
  _profitDays: 30,
  _profitSort: 'margin_asc',
  _profitCategoryFilter: '',
  _profitExpandedItem: null,

  async _renderProfitability(content) {
    const data = await API.profitability(this._profitDays);
    const { items, summary } = data;

    // Apply category filter
    let filtered = items;
    if (this._profitCategoryFilter) {
      filtered = items.filter(i => i.category === this._profitCategoryFilter);
    }

    // Sort
    switch (this._profitSort) {
      case 'margin_asc': filtered.sort((a, b) => a.margin_percent - b.margin_percent); break;
      case 'margin_desc': filtered.sort((a, b) => b.margin_percent - a.margin_percent); break;
      case 'profit_desc': filtered.sort((a, b) => b.total_profit - a.total_profit); break;
      case 'revenue_desc': filtered.sort((a, b) => b.total_revenue - a.total_revenue); break;
      case 'cost_asc': filtered.sort((a, b) => b.cost_percent - a.cost_percent); break;
    }

    // Get unique categories
    const categories = [...new Set(items.map(i => i.category).filter(Boolean))];

    content.innerHTML = `
      <style>
        .profit-summary-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:12px; margin-bottom:20px; }
        .profit-stat { background:var(--bg-secondary,#f8f9fa); border-radius:10px; padding:16px; text-align:center; }
        .profit-stat-val { font-size:22px; font-weight:800; line-height:1.2; }
        .profit-stat-lbl { font-size:11px; text-transform:uppercase; letter-spacing:.8px; opacity:.6; margin-top:4px; }
        .profit-controls { display:flex; align-items:center; gap:12px; margin-bottom:16px; flex-wrap:wrap; }
        .profit-item-row { border:1px solid var(--border-color,#eee); border-radius:10px; margin-bottom:8px; overflow:hidden; transition:all .2s; }
        .profit-item-row:hover { box-shadow:0 2px 8px rgba(0,0,0,.06); }
        .profit-item-header { display:grid; grid-template-columns:2fr 1fr 1fr 1fr 1fr 1fr 100px; align-items:center; padding:12px 16px; cursor:pointer; gap:8px; }
        .profit-item-header:hover { background:var(--bg-secondary,#f5f5f5); }
        .profit-margin-bar { height:6px; background:var(--bg-tertiary,#e5e7eb); border-radius:3px; overflow:hidden; width:100%; }
        .profit-margin-fill { height:100%; border-radius:3px; transition:width .4s ease; }
        .profit-detail { padding:16px 20px; background:var(--bg-secondary,#f8f9fa); border-top:1px solid var(--border-color,#eee); }
        .profit-ingredient-row { display:grid; grid-template-columns:2fr 1fr 1fr 1fr; gap:8px; padding:6px 0; border-bottom:1px solid var(--border-color,#eee); font-size:13px; }
        .profit-ingredient-row:last-child { border-bottom:none; }
        .profit-ingredient-header { font-weight:700; opacity:.6; text-transform:uppercase; font-size:11px; letter-spacing:.5px; }
        .profit-badge { display:inline-flex; padding:3px 10px; border-radius:12px; font-size:11px; font-weight:700; }
        .profit-badge-high { background:rgba(39,174,96,.15); color:#27ae60; }
        .profit-badge-mid { background:rgba(243,156,18,.15); color:#f39c12; }
        .profit-badge-low { background:rgba(231,76,60,.15); color:#e74c3c; }
        .profit-badge-none { background:rgba(148,163,184,.15); color:#94a3b8; }
        .profit-ai-btn { padding:6px 14px; border-radius:8px; border:1px solid var(--primary,#4361ee); background:transparent; color:var(--primary,#4361ee); font-size:12px; font-weight:600; cursor:pointer; transition:all .2s; }
        .profit-ai-btn:hover { background:var(--primary,#4361ee); color:#fff; }
        .profit-ai-result { margin-top:12px; padding:14px; background:var(--bg-primary,#fff); border-radius:8px; border-left:3px solid var(--primary,#4361ee); font-size:13px; line-height:1.7; white-space:pre-wrap; }
        @media (max-width:900px) {
          .profit-summary-grid { grid-template-columns:repeat(3,1fr); }
          .profit-item-header { grid-template-columns:2fr 1fr 1fr 80px; }
          .profit-item-header > *:nth-child(4),
          .profit-item-header > *:nth-child(5) { display:none; }
        }
      </style>

      <!-- Summary -->
      <div class="profit-summary-grid">
        <div class="profit-stat">
          <div class="profit-stat-val" style="color:${summary.overall_margin >= 70 ? 'var(--success,#27ae60)' : summary.overall_margin >= 60 ? 'var(--warning,#f39c12)' : 'var(--danger,#e74c3c)'}">
            ${summary.overall_margin}%
          </div>
          <div class="profit-stat-lbl">Overall Margin</div>
        </div>
        <div class="profit-stat">
          <div class="profit-stat-val">${Utils.currency(summary.total_revenue)}</div>
          <div class="profit-stat-lbl">Revenue (${summary.days_analyzed}d)</div>
        </div>
        <div class="profit-stat">
          <div class="profit-stat-val" style="color:var(--success,#27ae60)">${Utils.currency(summary.total_profit)}</div>
          <div class="profit-stat-lbl">Gross Profit</div>
        </div>
        <div class="profit-stat">
          <div class="profit-stat-val" style="color:var(--danger,#e74c3c)">${summary.low_margin_items}</div>
          <div class="profit-stat-lbl">Low Margin Items</div>
        </div>
        <div class="profit-stat">
          <div class="profit-stat-val" style="color:var(--success,#27ae60)">${summary.high_margin_items}</div>
          <div class="profit-stat-lbl">High Margin Items</div>
        </div>
      </div>

      <!-- Controls -->
      <div class="profit-controls">
        <select class="form-input" style="width:auto" onchange="InventoryModule._profitDays=parseInt(this.value);InventoryModule._renderProfitability(document.getElementById('inv-content'))">
          <option value="7" ${this._profitDays===7?'selected':''}>Last 7 days</option>
          <option value="14" ${this._profitDays===14?'selected':''}>Last 14 days</option>
          <option value="30" ${this._profitDays===30?'selected':''}>Last 30 days</option>
          <option value="90" ${this._profitDays===90?'selected':''}>Last 90 days</option>
        </select>
        <select class="form-input" style="width:auto" onchange="InventoryModule._profitCategoryFilter=this.value;InventoryModule._renderProfitability(document.getElementById('inv-content'))">
          <option value="">All Categories</option>
          ${categories.map(c => `<option value="${Utils.escapeHtml(c)}" ${this._profitCategoryFilter===c?'selected':''}>${Utils.escapeHtml(c)}</option>`).join('')}
        </select>
        <select class="form-input" style="width:auto" onchange="InventoryModule._profitSort=this.value;InventoryModule._renderProfitability(document.getElementById('inv-content'))">
          <option value="margin_asc" ${this._profitSort==='margin_asc'?'selected':''}>Lowest Margin First</option>
          <option value="margin_desc" ${this._profitSort==='margin_desc'?'selected':''}>Highest Margin First</option>
          <option value="profit_desc" ${this._profitSort==='profit_desc'?'selected':''}>Most Profit</option>
          <option value="revenue_desc" ${this._profitSort==='revenue_desc'?'selected':''}>Most Revenue</option>
          <option value="cost_asc" ${this._profitSort==='cost_asc'?'selected':''}>Highest Cost %</option>
        </select>
        <span class="text-sm text-muted">${filtered.length} items</span>
      </div>

      <!-- Column headers -->
      <div class="profit-item-header" style="padding:8px 16px;font-size:11px;font-weight:700;opacity:.5;text-transform:uppercase;letter-spacing:.5px;cursor:default">
        <span>Item</span>
        <span>Price</span>
        <span>Cost</span>
        <span>Profit</span>
        <span>Margin</span>
        <span>Sold</span>
        <span></span>
      </div>

      <!-- Items -->
      ${filtered.length === 0 ? '<div class="empty-state"><p>No menu items with recipes found</p></div>' :
        filtered.map(item => this._renderProfitItem(item)).join('')}
    `;
  },

  _renderProfitItem(item) {
    const marginColor = !item.has_recipe ? '#94a3b8' :
      item.margin_percent >= 75 ? '#27ae60' :
      item.margin_percent >= 60 ? '#f39c12' : '#e74c3c';
    const badgeClass = !item.has_recipe ? 'profit-badge-none' :
      item.margin_percent >= 75 ? 'profit-badge-high' :
      item.margin_percent >= 60 ? 'profit-badge-mid' : 'profit-badge-low';
    const isExpanded = this._profitExpandedItem === item.id;

    return `
      <div class="profit-item-row">
        <div class="profit-item-header" onclick="InventoryModule._toggleProfitDetail(${item.id})">
          <div>
            <div class="font-bold text-sm">${Utils.escapeHtml(item.name)}</div>
            <div class="text-muted" style="font-size:11px">${Utils.escapeHtml(item.category || 'Uncategorized')} &middot; ${Utils.escapeHtml(item.station)}</div>
          </div>
          <span class="font-bold">${Utils.currency(item.sell_price)}</span>
          <span style="color:var(--danger,#e74c3c)">${item.has_recipe ? Utils.currency(item.ingredient_cost) : '--'}</span>
          <span style="color:var(--success,#27ae60)">${item.has_recipe ? Utils.currency(item.profit_per_unit) : '--'}</span>
          <div>
            <span class="profit-badge ${badgeClass}">${item.has_recipe ? item.margin_percent + '%' : 'No Recipe'}</span>
            <div class="profit-margin-bar" style="margin-top:4px">
              <div class="profit-margin-fill" style="width:${item.margin_percent}%;background:${marginColor}"></div>
            </div>
          </div>
          <span class="text-sm">${item.qty_sold > 0 ? item.qty_sold + ' units' : '--'}</span>
          <span style="font-size:16px;opacity:.4">${isExpanded ? '' : ''}</span>
        </div>
        ${isExpanded ? this._renderProfitDetail(item) : ''}
      </div>
    `;
  },

  _renderProfitDetail(item) {
    if (!item.has_recipe || item.ingredients.length === 0) {
      return `<div class="profit-detail">
        <p class="text-muted text-sm">No recipe defined for this item. <a href="#" onclick="event.preventDefault();InventoryModule.showTab('recipes')">Go to Recipes tab</a> to add one.</p>
      </div>`;
    }

    const totalCost = item.ingredients.reduce((s, i) => s + i.line_cost, 0);

    return `
      <div class="profit-detail">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
          <!-- Ingredient Breakdown -->
          <div>
            <div class="font-bold text-sm mb-sm">Ingredient Breakdown</div>
            <div class="profit-ingredient-row profit-ingredient-header">
              <span>Ingredient</span>
              <span>Qty</span>
              <span>Unit Cost</span>
              <span>Line Cost</span>
            </div>
            ${item.ingredients.map(ing => {
              const pctOfCost = totalCost > 0 ? ((ing.line_cost / totalCost) * 100).toFixed(0) : 0;
              return `
                <div class="profit-ingredient-row">
                  <span>${Utils.escapeHtml(ing.name)}</span>
                  <span>${ing.quantity} ${Utils.escapeHtml(ing.unit)}</span>
                  <span>${Utils.currency(ing.cost_per_unit)}</span>
                  <span class="font-bold">${Utils.currency(ing.line_cost)} <span class="text-muted" style="font-size:10px">(${pctOfCost}%)</span></span>
                </div>
              `;
            }).join('')}
            <div class="profit-ingredient-row" style="border-top:2px solid var(--border-color,#ddd);font-weight:700;padding-top:8px">
              <span>Total</span>
              <span></span>
              <span></span>
              <span>${Utils.currency(totalCost)}</span>
            </div>
          </div>

          <!-- Profit Summary -->
          <div>
            <div class="font-bold text-sm mb-sm">Profit Analysis</div>
            <div style="background:var(--bg-primary,#fff);border-radius:8px;padding:14px;border:1px solid var(--border-color,#eee)">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
                <div>
                  <div class="text-muted" style="font-size:11px">Sell Price</div>
                  <div class="font-bold">${Utils.currency(item.sell_price)}</div>
                </div>
                <div>
                  <div class="text-muted" style="font-size:11px">Ingredient Cost</div>
                  <div class="font-bold" style="color:var(--danger,#e74c3c)">${Utils.currency(item.ingredient_cost)}</div>
                </div>
                <div>
                  <div class="text-muted" style="font-size:11px">Profit / Unit</div>
                  <div class="font-bold" style="color:var(--success,#27ae60)">${Utils.currency(item.profit_per_unit)}</div>
                </div>
                <div>
                  <div class="text-muted" style="font-size:11px">Markup</div>
                  <div class="font-bold">${item.markup_multiplier}x</div>
                </div>
              </div>
              ${item.qty_sold > 0 ? `
                <div style="border-top:1px solid var(--border-color,#eee);padding-top:10px;margin-top:4px">
                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                    <div>
                      <div class="text-muted" style="font-size:11px">${this._profitDays}d Revenue</div>
                      <div class="font-bold">${Utils.currency(item.total_revenue)}</div>
                    </div>
                    <div>
                      <div class="text-muted" style="font-size:11px">${this._profitDays}d Profit</div>
                      <div class="font-bold" style="color:var(--success,#27ae60)">${Utils.currency(item.total_profit)}</div>
                    </div>
                  </div>
                </div>
              ` : ''}
            </div>

            <!-- AI Analysis Button -->
            <div style="margin-top:12px">
              <button class="profit-ai-btn" id="ai-btn-${item.id}" onclick="InventoryModule._analyzeItem(${item.id})">
                AI Margin Analysis
              </button>
              <div id="ai-result-${item.id}"></div>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  _toggleProfitDetail(itemId) {
    this._profitExpandedItem = this._profitExpandedItem === itemId ? null : itemId;
    this._renderProfitability(document.getElementById('inv-content'));
  },

  async _analyzeItem(itemId) {
    const btn = document.getElementById(`ai-btn-${itemId}`);
    const resultDiv = document.getElementById(`ai-result-${itemId}`);
    if (!btn || !resultDiv) return;

    btn.disabled = true;
    btn.textContent = 'Analyzing...';
    resultDiv.innerHTML = '<div class="text-muted text-sm" style="padding:8px 0">Running analysis...</div>';

    try {
      const result = await API.profitabilityAnalyze(itemId);
      const sourceLabel = result.source === 'ai' ? 'AI Analysis' : 'Automated Analysis';
      resultDiv.innerHTML = `
        <div class="profit-ai-result">
          <div class="font-bold text-sm mb-sm" style="opacity:.6">${sourceLabel}</div>
          ${Utils.escapeHtml(result.analysis).replace(/\n/g, '<br>')}
        </div>
      `;
    } catch (err) {
      resultDiv.innerHTML = `<div class="text-sm" style="color:var(--danger,#e74c3c);padding:8px 0">${Utils.escapeHtml(err.message)}</div>`;
    }

    btn.disabled = false;
    btn.textContent = 'AI Margin Analysis';
  },

  destroy() {
    this._cache = {};
    this._recipeEdits = {};
    this._searchTerm = '';
    this._categoryFilter = '';
    this._locationFilter = '';
    this._activeTab = 'stock';
    this._container = null;
    this._profitExpandedItem = null;
  }
};
