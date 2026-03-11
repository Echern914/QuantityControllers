/* ============================================================
   VENUECORE - Recipe Deduction Module
   Real-time stock cards with fractional display
   ============================================================ */
const DrinkDeductionModule = {
  _view: 'stock',       // stock | recipes | night-summary
  _cards: [],
  _searchTerm: '',
  _levelFilter: '',
  _refreshTimer: null,
  _container: null,

  // ---- Fraction Utility ----
  toFraction(decimal) {
    if (decimal <= 0) return '0';
    const whole = Math.floor(decimal);
    const frac = decimal - whole;

    // Map common fractions to vulgar fraction characters
    const fractions = [
      [0, ''],
      [0.125, '\u215B'],  // ⅛
      [0.25, '\u00BC'],   // ¼
      [0.333, '\u2153'],  // ⅓
      [0.375, '\u215C'],  // ⅜
      [0.5, '\u00BD'],    // ½
      [0.625, '\u215D'],  // ⅝
      [0.666, '\u2154'],  // ⅔
      [0.75, '\u00BE'],   // ¾
      [0.875, '\u215E'],  // ⅞
      [1, ''],
    ];

    // Find closest fraction
    let closest = fractions[0];
    let minDiff = Math.abs(frac - 0);
    for (const f of fractions) {
      const diff = Math.abs(frac - f[0]);
      if (diff < minDiff) {
        minDiff = diff;
        closest = f;
      }
    }

    if (closest[0] >= 1) return String(whole + 1);
    if (closest[0] === 0 || closest[1] === '') return String(whole || '0');
    if (whole === 0) return closest[1];
    return `${whole}${closest[1]}`;
  },

  // ---- Main Render ----
  async render(container) {
    this._container = container;
    container.innerHTML = `<div class="dd-page animate-fade">
      <div class="dd-header">
        <div>
          <div class="dd-header__title">Recipe Deduction</div>
          <span class="dd-live-dot">LIVE</span>
        </div>
        <div class="dd-header__actions">
          <button class="btn btn-sm btn-secondary" onclick="DrinkDeductionModule.refresh()">Refresh</button>
          <button class="btn btn-sm btn-primary" onclick="DrinkDeductionModule.showManualDeduct()">+ Manual Deduct</button>
        </div>
      </div>

      <div class="dd-tabs">
        <button class="dd-tab ${this._view === 'stock' ? 'dd-tab--active' : ''}" onclick="DrinkDeductionModule.switchView('stock')">Live Stock</button>
        <button class="dd-tab ${this._view === 'recipes' ? 'dd-tab--active' : ''}" onclick="DrinkDeductionModule.switchView('recipes')">Recipes</button>
        <button class="dd-tab ${this._view === 'night-summary' ? 'dd-tab--active' : ''}" onclick="DrinkDeductionModule.switchView('night-summary')">End of Night</button>
      </div>

      <div id="dd-content"></div>
    </div>`;

    await this.switchView(this._view);
    this.startAutoRefresh();
  },

  destroy() {
    this.stopAutoRefresh();
  },

  startAutoRefresh() {
    this.stopAutoRefresh();
    // Auto-refresh stock cards every 5 seconds
    if (this._view === 'stock') {
      this._refreshTimer = setInterval(() => this.refreshStockCards(), 5000);
    }
  },

  stopAutoRefresh() {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
  },

  async switchView(view) {
    this._view = view;
    this.stopAutoRefresh();

    // Update tab UI
    document.querySelectorAll('.dd-tab').forEach(t => t.classList.remove('dd-tab--active'));
    const tabs = document.querySelectorAll('.dd-tab');
    if (view === 'stock' && tabs[0]) tabs[0].classList.add('dd-tab--active');
    if (view === 'recipes' && tabs[1]) tabs[1].classList.add('dd-tab--active');
    if (view === 'night-summary' && tabs[2]) tabs[2].classList.add('dd-tab--active');

    const content = document.getElementById('dd-content');
    if (!content) return;

    UI.loading(content);

    switch (view) {
      case 'stock': await this.renderStockCards(content); this.startAutoRefresh(); break;
      case 'recipes': await this.renderRecipes(content); break;
      case 'night-summary': await this.renderNightSummary(content); break;
    }
  },

  async refresh() {
    await this.switchView(this._view);
  },

  // ============================================================
  // LIVE STOCK CARDS
  // ============================================================
  async renderStockCards(container) {
    try {
      this._cards = await API.ddStockCards();
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Error loading stock</h3><p>${Utils.escapeHtml(err.message)}</p></div>`;
      return;
    }

    const critical = this._cards.filter(c => c.stock_level === 'critical').length;
    const low = this._cards.filter(c => c.stock_level === 'low').length;
    const good = this._cards.filter(c => c.stock_level === 'good').length;

    container.innerHTML = `
      <div class="dd-stats-row">
        ${this._statCard(good, 'In Stock', 'good')}
        ${this._statCard(low, 'Getting Low', 'low')}
        ${this._statCard(critical, 'Critical', 'critical')}
        ${this._statCard(this._cards.length, 'Total Items', 'neutral')}
      </div>

      <div class="dd-search" style="margin-top:var(--space-md)">
        <input class="dd-search__input" type="text" placeholder="Search ingredients..."
          value="${Utils.escapeHtml(this._searchTerm)}"
          oninput="DrinkDeductionModule._searchTerm=this.value;DrinkDeductionModule.filterCards()">
        <select class="dd-search__select" onchange="DrinkDeductionModule._levelFilter=this.value;DrinkDeductionModule.filterCards()">
          <option value="">All Levels</option>
          <option value="critical" ${this._levelFilter === 'critical' ? 'selected' : ''}>Critical</option>
          <option value="low" ${this._levelFilter === 'low' ? 'selected' : ''}>Low</option>
          <option value="good" ${this._levelFilter === 'good' ? 'selected' : ''}>In Stock</option>
        </select>
      </div>

      <div class="dd-grid" id="dd-card-grid" style="margin-top:var(--space-md)">
        ${this._renderCardGrid(this._cards)}
      </div>
    `;
  },

  _statCard(value, label, type) {
    const colors = { good: 'var(--color-success)', low: 'var(--color-warning)', critical: 'var(--color-danger)', neutral: 'var(--accent-primary)' };
    return `<div class="dd-eon__stat">
      <div class="dd-eon__stat-value" style="color:${colors[type]}">${value}</div>
      <div class="dd-eon__stat-label">${label}</div>
    </div>`;
  },

  _renderCardGrid(cards) {
    let filtered = cards;
    if (this._searchTerm) {
      const s = this._searchTerm.toLowerCase();
      filtered = filtered.filter(c => c.name.toLowerCase().includes(s) || (c.category_name || '').toLowerCase().includes(s));
    }
    if (this._levelFilter) {
      filtered = filtered.filter(c => c.stock_level === this._levelFilter);
    }

    if (filtered.length === 0) {
      return '<div class="empty-state"><h3>No matching ingredients</h3></div>';
    }

    // Sort: critical first, then low, then good
    const order = { critical: 0, low: 1, good: 2 };
    filtered.sort((a, b) => (order[a.stock_level] ?? 3) - (order[b.stock_level] ?? 3));

    return filtered.map(card => this._renderCard(card)).join('');
  },

  _renderCard(card) {
    const frac = this.toFraction(card.current_stock);
    const pct = card.total_capacity > 0 ? Math.min(100, Math.round((card.current_stock / card.total_capacity) * 100)) : (card.current_stock > 0 ? 50 : 0);
    const level = card.stock_level;

    return `<div class="dd-card dd-card--${level}" id="dd-card-${card.id}" onclick="DrinkDeductionModule.showDetail(${card.id})">
      <div class="dd-card__deduct-flash"></div>
      <div class="dd-card__top">
        <div>
          <div class="dd-card__name">${Utils.escapeHtml(card.name)}</div>
          <div class="dd-card__category">${Utils.escapeHtml(card.category_name || 'Uncategorized')}</div>
        </div>
        <div class="dd-card__status-dot dd-card__status-dot--${level}"></div>
      </div>
      <div class="dd-card__qty">
        <span class="dd-card__qty-value dd-card__qty-value--${level}">${frac}</span>
        <span class="dd-card__qty-unit">${Utils.escapeHtml(card.unit)}</span>
        <div class="dd-card__qty-label">remaining</div>
      </div>
      <div class="dd-card__bar">
        <div class="dd-card__bar-fill dd-card__bar-fill--${level}" style="width:${pct}%"></div>
      </div>
      <div class="dd-card__meta">
        <div class="dd-card__meta-item">
          <span class="dd-card__meta-label">Today</span>
          <span class="dd-card__meta-value">-${this.toFraction(card.today_usage)} ${Utils.escapeHtml(card.unit)}</span>
        </div>
        <div class="dd-card__meta-item">
          <span class="dd-card__meta-label">Recipes</span>
          <span class="dd-card__meta-value">${card.drink_count} items</span>
        </div>
        <div class="dd-card__meta-item">
          <span class="dd-card__meta-label">Days Left</span>
          <span class="dd-card__meta-value">${card.days_remaining >= 999 ? '--' : card.days_remaining + 'd'}</span>
        </div>
        <div class="dd-card__meta-item">
          <span class="dd-card__meta-label">Par Level</span>
          <span class="dd-card__meta-value">${card.par_level > 0 ? this.toFraction(card.par_level) + ' ' + card.unit : '--'}</span>
        </div>
      </div>
    </div>`;
  },

  filterCards() {
    const grid = document.getElementById('dd-card-grid');
    if (grid) grid.innerHTML = this._renderCardGrid(this._cards);
  },

  // Silently refresh cards without full re-render
  async refreshStockCards() {
    try {
      const newCards = await API.ddStockCards();
      // Detect changes and animate
      for (const nc of newCards) {
        const old = this._cards.find(c => c.id === nc.id);
        if (old && old.current_stock !== nc.current_stock) {
          this._animateDeduction(nc.id, old.current_stock - nc.current_stock, nc);
        }
      }
      this._cards = newCards;
    } catch {}
  },

  _animateDeduction(ingredientId, amount, newData) {
    const el = document.getElementById(`dd-card-${ingredientId}`);
    if (!el || amount <= 0) return;

    // Flash animation
    el.classList.add('dd-card--deducting');

    // Floating toast showing deducted amount
    const toast = document.createElement('div');
    toast.className = 'dd-deduct-toast';
    toast.textContent = `-${this.toFraction(amount)} ${newData.unit}`;
    el.appendChild(toast);

    // Update card content
    setTimeout(() => {
      const qtyEl = el.querySelector('.dd-card__qty-value');
      if (qtyEl) {
        qtyEl.textContent = this.toFraction(newData.current_stock);
        qtyEl.className = `dd-card__qty-value dd-card__qty-value--${newData.stock_level}`;
      }
      const barEl = el.querySelector('.dd-card__bar-fill');
      if (barEl) {
        const pct = newData.total_capacity > 0 ? Math.min(100, Math.round((newData.current_stock / newData.total_capacity) * 100)) : 0;
        barEl.style.width = pct + '%';
        barEl.className = `dd-card__bar-fill dd-card__bar-fill--${newData.stock_level}`;
      }
      // Update card border class
      el.className = `dd-card dd-card--${newData.stock_level} dd-card--deducting`;
    }, 200);

    // Clean up
    setTimeout(() => {
      el.classList.remove('dd-card--deducting');
      toast.remove();
    }, 1500);
  },

  // ============================================================
  // INGREDIENT DETAIL MODAL
  // ============================================================
  async showDetail(ingredientId) {
    try {
      const data = await API.ddIngredientDetail(ingredientId);
      const ing = data.ingredient;
      const level = ing.current_stock <= 0 ? 'critical' :
                    (ing.par_level > 0 && ing.current_stock <= ing.par_level) ? 'critical' :
                    (ing.total_capacity > 0 && ing.current_stock / ing.total_capacity < 0.25) ? 'low' : 'good';

      const html = `<div class="dd-detail">
        <div class="dd-detail__header">
          <div>
            <div style="font-size:18px;font-weight:800;color:var(--text-primary)">${Utils.escapeHtml(ing.name)}</div>
            <div style="font-size:12px;color:var(--text-muted)">${Utils.escapeHtml(ing.category_name || '')} ${ing.supplier_name ? '&middot; ' + Utils.escapeHtml(ing.supplier_name) : ''}</div>
          </div>
          <div class="dd-detail__qty-big dd-detail__qty-big--${level}">
            ${this.toFraction(ing.current_stock)} <span style="font-size:16px;color:var(--text-muted)">${Utils.escapeHtml(ing.unit)}</span>
          </div>
        </div>

        ${data.drinks_remaining.length > 0 ? `
        <div class="dd-detail__section">
          <div class="dd-detail__section-title">Items Remaining</div>
          <div class="dd-detail__drinks-list">
            ${data.drinks_remaining.map(d => {
              const countClass = d.can_make <= 0 ? 'zero' : d.can_make <= 5 ? 'low' : 'good';
              return `<div class="dd-detail__drink-row">
                <div>
                  <div class="dd-detail__drink-name">${Utils.escapeHtml(d.drink_name)}</div>
                  <div class="dd-detail__drink-qty">${this.toFraction(d.required_per_drink)} ${Utils.escapeHtml(d.unit)} per serving</div>
                </div>
                <div class="dd-detail__drink-count dd-detail__drink-count--${countClass}">${d.can_make}</div>
              </div>`;
            }).join('')}
          </div>
        </div>` : ''}

        <div class="dd-detail__section">
          <div class="dd-detail__section-title">Today's Deductions (${data.deductions.length})</div>
          ${data.deductions.length > 0 ? data.deductions.slice(0, 20).map(d => `
            <div class="dd-detail__history-item">
              <div>
                <div class="dd-detail__history-drink">${Utils.escapeHtml(d.drink_name || 'Unknown')}</div>
                <div class="dd-detail__history-time">${d.order_number ? '#' + d.order_number : ''} ${d.employee_name ? '&middot; ' + Utils.escapeHtml(d.employee_name) : ''}</div>
              </div>
              <div>
                <div class="dd-detail__history-amount">-${this.toFraction(d.quantity)} ${Utils.escapeHtml(d.unit)}</div>
                <div class="dd-detail__history-time">${Utils.formatTime(d.created_at)}</div>
              </div>
            </div>
          `).join('') : '<div style="color:var(--text-muted);font-size:13px;padding:var(--space-md) 0">No deductions today</div>'}
        </div>

        <div class="dd-detail__section">
          <div class="dd-detail__section-title">Restock Info</div>
          <div class="dd-detail__restock-info">
            <div>
              <div class="dd-detail__restock-label">Last Restocked</div>
              <div class="dd-detail__restock-value">${data.last_restock ? Utils.formatDate(data.last_restock.received_date) : 'Never'}</div>
            </div>
            <div>
              <div class="dd-detail__restock-label">Last Restock Qty</div>
              <div class="dd-detail__restock-value">${data.last_restock ? this.toFraction(data.last_restock.quantity) + ' ' + ing.unit : '--'}</div>
            </div>
            <div>
              <div class="dd-detail__restock-label">Par Level</div>
              <div class="dd-detail__restock-value">${ing.par_level > 0 ? this.toFraction(ing.par_level) + ' ' + ing.unit : 'Not set'}</div>
            </div>
            <div>
              <div class="dd-detail__restock-label">Cost / Unit</div>
              <div class="dd-detail__restock-value">${Utils.currency(ing.cost_per_unit)}</div>
            </div>
          </div>
        </div>

        ${data.weekly_usage.length > 0 ? `
        <div class="dd-detail__section">
          <div class="dd-detail__section-title">7-Day Usage</div>
          ${data.weekly_usage.map(w => `
            <div class="dd-detail__history-item">
              <span style="color:var(--text-secondary)">${Utils.getDayOfWeek(w.day)}</span>
              <span style="font-family:var(--font-mono);font-weight:700;color:var(--text-primary)">${this.toFraction(w.total_used)} ${Utils.escapeHtml(ing.unit)} (${w.pour_count} uses)</span>
            </div>
          `).join('')}
        </div>` : ''}
      </div>`;

      UI.modal(ing.name, html, { footer: false, size: 'lg' });
    } catch (err) {
      UI.toast('Error', err.message, 'danger');
    }
  },

  // ============================================================
  // RECIPES VIEW
  // ============================================================
  async renderRecipes(container) {
    try {
      const recipes = await API.ddRecipes();

      if (recipes.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No Recipes</h3><p>Link recipes to menu items in Inventory > Recipes tab</p></div>';
        return;
      }

      container.innerHTML = `
        <div class="dd-search" style="margin-bottom:var(--space-md)">
          <input class="dd-search__input" type="text" placeholder="Search menu items..."
            oninput="DrinkDeductionModule._filterRecipes(this.value)">
        </div>
        <div class="dd-grid" id="dd-recipe-grid">
          ${recipes.map(r => this._renderRecipeCard(r)).join('')}
        </div>
      `;

      this._allRecipes = recipes;
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${Utils.escapeHtml(err.message)}</p></div>`;
    }
  },

  _renderRecipeCard(recipe) {
    const canMakeClass = recipe.can_make <= 0 ? 'zero' : recipe.can_make <= 5 ? 'low' : 'good';

    return `<div class="dd-recipe-card">
      <div class="dd-recipe-card__header">
        <div>
          <div class="dd-recipe-card__name">${Utils.escapeHtml(recipe.drink_name)}</div>
          <div style="font-size:11px;color:var(--text-muted)">${Utils.escapeHtml(recipe.category_name || recipe.station || '')}</div>
        </div>
        <div class="dd-recipe-card__can-make dd-recipe-card__can-make--${canMakeClass}" title="Can make this many">
          ${recipe.can_make} left
        </div>
      </div>
      <div class="dd-recipe-card__ingredients">
        ${recipe.ingredients.map(i => `
          <div class="dd-recipe-card__ing-row">
            <span class="dd-recipe-card__ing-name">${Utils.escapeHtml(i.name)}</span>
            <span class="dd-recipe-card__ing-qty">${this.toFraction(i.quantity)} ${Utils.escapeHtml(i.unit)}</span>
          </div>
        `).join('')}
      </div>
      <div class="dd-recipe-card__footer">
        <span>Cost: <span class="dd-recipe-card__cost">${Utils.currency(recipe.total_cost)}</span></span>
        <span>Margin: ${recipe.margin_percent}%</span>
        <span>Price: ${Utils.currency(recipe.drink_price)}</span>
      </div>
    </div>`;
  },

  _filterRecipes(term) {
    const grid = document.getElementById('dd-recipe-grid');
    if (!grid || !this._allRecipes) return;
    const s = term.toLowerCase();
    const filtered = s ? this._allRecipes.filter(r => r.drink_name.toLowerCase().includes(s)) : this._allRecipes;
    grid.innerHTML = filtered.map(r => this._renderRecipeCard(r)).join('');
  },

  // ============================================================
  // END OF NIGHT SUMMARY
  // ============================================================
  async renderNightSummary(container) {
    try {
      const data = await API.ddEndOfNight();
      const s = data.summary;

      container.innerHTML = `<div class="dd-eon">
        <div class="dd-eon__stats">
          <div class="dd-eon__stat">
            <div class="dd-eon__stat-value">${s.total_items_sold}</div>
            <div class="dd-eon__stat-label">Items Sold</div>
          </div>
          <div class="dd-eon__stat">
            <div class="dd-eon__stat-value" style="color:var(--color-success)">${Utils.currency(s.total_revenue)}</div>
            <div class="dd-eon__stat-label">Revenue</div>
          </div>
          <div class="dd-eon__stat">
            <div class="dd-eon__stat-value">${s.total_containers_opened}</div>
            <div class="dd-eon__stat-label">Containers Opened</div>
          </div>
          <div class="dd-eon__stat">
            <div class="dd-eon__stat-value">${s.total_deductions}</div>
            <div class="dd-eon__stat-label">Total Deductions</div>
          </div>
          <div class="dd-eon__stat">
            <div class="dd-eon__stat-value">${s.total_ingredients_used}</div>
            <div class="dd-eon__stat-label">Ingredients Used</div>
          </div>
          <div class="dd-eon__stat">
            <div class="dd-eon__stat-value" style="color:${s.total_variance_flags > 0 ? 'var(--color-danger)' : 'var(--text-primary)'}">${s.total_variance_flags}</div>
            <div class="dd-eon__stat-label">Variance Flags</div>
          </div>
        </div>

        ${data.top_drinks.length > 0 ? `
        <div>
          <h3 style="font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:var(--space-sm)">Top Items Sold</h3>
          <div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius-md);overflow:hidden">
            ${UI.table(
              [
                { label: 'Item', key: 'name' },
                { label: 'Qty', key: 'qty_sold', align: 'right', render: v => `<strong>${v}</strong>` },
                { label: 'Revenue', key: 'revenue', align: 'right', render: v => Utils.currency(v) },
              ],
              data.top_drinks
            )}
          </div>
        </div>` : ''}

        ${data.total_pours.length > 0 ? `
        <div>
          <h3 style="font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:var(--space-sm)">Ingredient Usage</h3>
          <div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius-md);overflow:hidden">
            ${UI.table(
              [
                { label: 'Ingredient', key: 'name' },
                { label: 'Total Used', key: 'total_poured', align: 'right', render: (v, row) => `<strong>${DrinkDeductionModule.toFraction(v)}</strong> ${Utils.escapeHtml(row.unit)}` },
                { label: 'Pours', key: 'pour_count', align: 'right' },
                { label: 'Menu Items', key: 'drink_types', align: 'right' },
                { label: 'Orders', key: 'order_count', align: 'right' },
              ],
              data.total_pours
            )}
          </div>
        </div>` : ''}

        ${data.bottles_opened.length > 0 ? `
        <div>
          <h3 style="font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:var(--space-sm)">Containers Opened Today</h3>
          <div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius-md);overflow:hidden">
            ${UI.table(
              [
                { label: 'Ingredient', key: 'ingredient_name' },
                { label: 'Size', key: 'full_quantity', align: 'right', render: (v, row) => `${DrinkDeductionModule.toFraction(v)} ${Utils.escapeHtml(row.unit)}` },
                { label: 'Location', key: 'location', render: v => Utils.statusBadge(v) },
                { label: 'Opened At', key: 'opened_at', render: v => Utils.formatTime(v) },
              ],
              data.bottles_opened
            )}
          </div>
        </div>` : ''}

        ${data.zero_stock_sales.length > 0 ? `
        <div>
          <h3 style="font-size:15px;font-weight:700;color:var(--color-danger);margin-bottom:var(--space-sm)">Variance Flags (Zero-Stock Sales)</h3>
          <div style="background:var(--bg-card);border:1px solid rgba(239,68,68,0.3);border-radius:var(--radius-md);overflow:hidden">
            ${UI.table(
              [
                { label: 'Item', key: 'drink_name' },
                { label: 'Ingredient', key: 'ingredient_name' },
                { label: 'Status', key: 'status', render: v => `<span class="dd-eon__variance-flag">${Utils.escapeHtml(v)}</span>` },
                { label: 'Order', key: 'order_number' },
                { label: 'Time', key: 'created_at', render: v => Utils.formatTime(v) },
              ],
              data.zero_stock_sales
            )}
          </div>
        </div>` : ''}
      </div>`;
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${Utils.escapeHtml(err.message)}</p></div>`;
    }
  },

  // ============================================================
  // MANUAL DEDUCT MODAL
  // ============================================================
  async showManualDeduct() {
    try {
      const recipes = await API.ddRecipes();
      if (recipes.length === 0) {
        UI.toast('No Recipes', 'Add recipes to menu items first', 'warning');
        return;
      }

      const html = `
        <div class="form-group">
          <label class="form-label">Select Menu Item</label>
          <select class="form-input" id="manual-drink-select" style="width:100%">
            ${recipes.map(r => `<option value="${r.menu_item_id}">${Utils.escapeHtml(r.drink_name)} (can make ${r.can_make})</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Quantity</label>
          <input type="number" class="form-input" id="manual-qty" value="1" min="1" max="50" style="width:100%">
        </div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:var(--space-sm)">
          This simulates a sale and deducts all recipe ingredients from stock.
        </div>
      `;

      const result = await UI.modal('Manual Deduction', html, { confirmText: 'Deduct Stock' });
      if (!result) return;

      const menuItemId = parseInt(result.querySelector('#manual-drink-select').value);
      const qty = parseInt(result.querySelector('#manual-qty').value) || 1;

      const res = await API.ddManualDeduct({ menu_item_id: menuItemId, quantity: qty });

      if (res.deductions) {
        const msgs = res.deductions.map(d => `${d.ingredient}: -${d.deducted} (${d.status})`).join('\n');
        UI.toast('Deducted', `${qty}x item deducted from stock`, 'success');
        this.refresh();
      }
    } catch (err) {
      UI.toast('Error', err.message, 'danger');
    }
  },

  // ============================================================
  // SSE HANDLER - Called from App.handleSSE
  // ============================================================
  handleStockDeduction(data) {
    if (this._view === 'stock') {
      this.refreshStockCards();
    }
  },
};
