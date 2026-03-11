/* ============================================================
   VENUECORE - Dashboard Module (Enhanced)
   ============================================================ */
const Dashboard = {
  refreshInterval: null,

  async render(container) {
    // Fetch all data in parallel
    const [realtime, alerts, hourly, cogs, waste, health, reorder] = await Promise.all([
      API.realtimeStats(),
      API.notifications({ unread_only: 'true', limit: 5 }),
      API.hourlyAnalytics().catch(() => []),
      API.cogsAnalytics(7).catch(() => null),
      API.wasteSummary(7).catch(() => null),
      API.inventoryHealth().catch(() => null),
      API.reorderSuggestions().catch(() => []),
    ]);

    const cogsPercent = cogs ? cogs.cogs_percent : 0;
    const tablePercent = realtime.tables_total > 0
      ? Math.round((realtime.tables_occupied / realtime.tables_total) * 100)
      : 0;

    container.innerHTML = `
      <div class="animate-fade">

        ${this._renderInlineStyles()}

        <!-- ====== TOP STATS ROW ====== -->
        <div class="grid grid-4 gap-md mb-md">
          ${UI.statCard("Today's Sales", Utils.currency(realtime.today_sales), '$')}
          ${UI.statCard('Orders', realtime.today_orders, '#')}
          ${UI.statCard('Avg Check', Utils.currency(realtime.avg_check), '')}
          ${UI.statCard('COGS %', Utils.percent(cogsPercent), '%',
            cogsPercent > 35 ? 'high' : cogsPercent > 28 ? 'mid' : 'low')}
        </div>

        <!-- ====== SECOND STATS ROW ====== -->
        <div class="grid grid-4 gap-md mb-md">
          ${UI.statCard('Open Orders', realtime.open_orders, '',
            realtime.open_orders > 10 ? 'high' : null)}
          ${UI.statCard('Tables', realtime.tables_occupied + '/' + realtime.tables_total, '')}
          ${UI.statCard('Staff On', realtime.staff_clocked_in, '')}
          ${UI.statCard('Kitchen Queue', realtime.kitchen_queue, '',
            realtime.kitchen_queue > 8 ? 'high' : null)}
        </div>

        <!-- ====== TABLE OCCUPANCY BAR ====== -->
        <div class="card mb-md">
          <div class="card-body" style="padding:12px 20px">
            <div class="flex items-center justify-between mb-sm">
              <span class="text-sm font-bold" style="text-transform:uppercase;letter-spacing:1px;opacity:.7">
                Table Occupancy
              </span>
              <span class="text-sm font-bold">${tablePercent}%</span>
            </div>
            <div class="progress-bar" style="height:8px;border-radius:4px">
              <div class="progress-fill" style="width:${tablePercent}%;background:${
                tablePercent > 85 ? 'var(--danger,#e74c3c)' :
                tablePercent > 60 ? 'var(--warning,#f39c12)' :
                'var(--success,#27ae60)'
              };border-radius:4px;transition:width .6s ease"></div>
            </div>
          </div>
        </div>

        <!-- ====== MAIN TWO-COLUMN LAYOUT ====== -->
        <div class="grid grid-2 gap-md mb-md">

          <!-- LEFT COLUMN -->
          <div class="dash-col-left">

            <!-- Hourly Sales Chart -->
            <div class="card mb-md">
              <div class="card-header flex items-center justify-between">
                <h3>Hourly Sales</h3>
                <span class="badge badge-info">${hourly.length} hrs tracked</span>
              </div>
              <div class="card-body">
                <canvas id="hourly-chart" width="500" height="220"></canvas>
              </div>
            </div>

            <!-- COGS by Category -->
            <div class="card mb-md">
              <div class="card-header flex items-center justify-between">
                <h3>COGS by Category</h3>
                ${cogs ? `<span class="text-sm text-muted">Gross Profit: ${Utils.currency(cogs.gross_profit)}</span>` : ''}
              </div>
              <div class="card-body">
                ${this._renderCogsBars(cogs)}
              </div>
            </div>

          </div>

          <!-- RIGHT COLUMN -->
          <div class="dash-col-right">

            <!-- Inventory Health -->
            <div class="card mb-md">
              <div class="card-header flex items-center justify-between">
                <h3>Inventory Health</h3>
                ${health ? `<span class="badge badge-${health.below_par_count > 0 ? 'danger' : 'success'}">${health.total_items} items</span>` : ''}
              </div>
              <div class="card-body">
                ${this._renderInventoryHealth(health)}
              </div>
            </div>

            <!-- Top Wasted Items -->
            <div class="card mb-md">
              <div class="card-header flex items-center justify-between">
                <h3>Waste Report</h3>
                ${waste ? `<span class="text-sm" style="color:var(--danger,#e74c3c);font-weight:600">${Utils.currency(waste.total_waste_cost)} lost</span>` : ''}
              </div>
              <div class="card-body" style="max-height:280px;overflow-y:auto">
                ${this._renderWasteTable(waste)}
              </div>
            </div>

          </div>

        </div>

        <!-- ====== BOTTOM ROW ====== -->
        <div class="grid grid-2 gap-md mb-md">

          <!-- Reorder Suggestions -->
          <div class="card">
            <div class="card-header flex items-center justify-between">
              <h3>Reorder Suggestions</h3>
              <span class="badge badge-warning">${reorder.length} items</span>
            </div>
            <div class="card-body" style="max-height:340px;overflow-y:auto">
              ${this._renderReorderCards(reorder)}
            </div>
          </div>

          <!-- Quick Actions + Alerts -->
          <div>
            <!-- Quick Actions -->
            <div class="card mb-md">
              <div class="card-header"><h3>Quick Actions</h3></div>
              <div class="card-body">
                <div class="grid grid-3 gap-sm">
                  ${this._renderQuickAction('New Order', 'pos', '$', 'primary')}
                  ${this._renderQuickAction('Floor Plan', 'floor', '', 'secondary')}
                  ${this._renderQuickAction('Kitchen', 'kitchen', '', 'secondary')}
                  ${this._renderQuickAction('Reservations', 'reservations', '', 'secondary')}
                  ${this._renderQuickAction('Inventory', 'inventory', '', 'secondary')}
                  ${this._renderQuickAction('AI Assistant', 'ai', '', 'secondary')}
                </div>
              </div>
            </div>

            <!-- Active Alerts -->
            <div class="card">
              <div class="card-header flex items-center justify-between">
                <h3>Alerts</h3>
                <span class="badge badge-danger">${alerts.length}</span>
              </div>
              <div class="card-body" style="max-height:180px;overflow-y:auto">
                ${alerts.length === 0
                  ? '<p class="text-muted text-sm" style="text-align:center;padding:20px 0">All clear - no active alerts</p>'
                  : alerts.map(a => `
                    <div class="flex items-center gap-sm" style="padding:8px 4px;border-bottom:1px solid var(--border-color,#eee)">
                      <span class="dash-alert-icon dash-alert-${a.severity}">
                        ${a.severity === 'critical' ? 'CRIT' : a.severity === 'high' ? 'HIGH' : 'MED'}
                      </span>
                      <div style="flex:1;min-width:0">
                        <div class="text-sm font-bold" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                          ${Utils.escapeHtml(a.title)}
                        </div>
                        <div class="text-muted text-sm">${Utils.escapeHtml(a.message || '')} &middot; ${Utils.timeAgo(a.created_at)}</div>
                      </div>
                    </div>
                  `).join('')
                }
              </div>
            </div>
          </div>

        </div>

        <!-- Refresh indicator -->
        <div class="flex items-center justify-between" style="padding:8px 0;opacity:.45">
          <span class="text-sm text-muted">Auto-refreshes every 30s</span>
          <span class="text-sm text-muted" id="dash-last-refresh">Updated just now</span>
        </div>

      </div>
    `;

    // Render hourly chart
    try {
      const filtered = hourly.filter(h => h.hour >= 6 && h.hour <= 23);
      const labels = filtered.map(h =>
        `${h.hour === 0 ? 12 : h.hour > 12 ? h.hour - 12 : h.hour}${h.hour >= 12 ? 'p' : 'a'}`
      );
      const data = filtered.map(h => h.sales || 0);
      UI.barChart('hourly-chart', labels, data);
    } catch (e) { /* chart unavailable */ }

    // Bind click handlers for below-par items
    const belowParLink = container.querySelector('#dash-below-par-link');
    if (belowParLink) {
      belowParLink.addEventListener('click', () => App.navigate('inventory'));
    }

    // Auto-refresh every 30 seconds
    if (this.refreshInterval) clearInterval(this.refreshInterval);
    this.refreshInterval = setInterval(() => this.render(container), 30000);
  },

  destroy() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  },

  // -- Private rendering helpers -------------------------------------------

  _renderInlineStyles() {
    return `
      <style>
        .dash-col-left, .dash-col-right { display:flex; flex-direction:column; }
        .dash-cogs-row { display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid var(--border-color,#eee); }
        .dash-cogs-row:last-child { border-bottom:none; }
        .dash-cogs-label { width:110px; font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .dash-cogs-bar-wrap { flex:1; height:22px; background:var(--bg-secondary,#f5f5f5); border-radius:4px; overflow:hidden; position:relative; }
        .dash-cogs-bar-rev { height:100%; border-radius:4px; position:absolute; top:0; left:0; opacity:.25; }
        .dash-cogs-bar-cost { height:100%; border-radius:4px; position:absolute; top:0; left:0; }
        .dash-cogs-pct { width:55px; text-align:right; font-size:12px; font-weight:700; }

        .dash-inv-metrics { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px; }
        .inv-metric { background:var(--bg-secondary,#f8f9fa); border-radius:8px; padding:14px; text-align:center; }
        .inv-metric .inv-metric-val { font-size:22px; font-weight:800; line-height:1.1; }
        .inv-metric .inv-metric-lbl { font-size:11px; text-transform:uppercase; letter-spacing:.8px; opacity:.6; margin-top:4px; }

        .dash-loc-row { display:flex; align-items:center; gap:8px; padding:6px 0; }
        .location-tag { font-size:12px; font-weight:600; width:90px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .dash-loc-bar { flex:1; height:14px; background:var(--bg-secondary,#f0f0f0); border-radius:3px; overflow:hidden; }
        .dash-loc-fill { height:100%; border-radius:3px; transition:width .4s ease; }
        .dash-loc-val { font-size:11px; width:70px; text-align:right; font-weight:600; }

        .reorder-card { border-left:4px solid var(--border-color,#ccc); border-radius:6px; padding:10px 14px; margin-bottom:8px; background:var(--bg-secondary,#fafafa); transition:transform .15s ease, box-shadow .15s ease; }
        .reorder-card:hover { transform:translateY(-1px); box-shadow:0 2px 8px rgba(0,0,0,.08); }
        .urgency-critical { border-left-color:var(--danger,#e74c3c) !important; }
        .urgency-high { border-left-color:var(--warning,#f39c12) !important; }
        .urgency-medium { border-left-color:var(--info,#3498db) !important; }
        .urgency-low { border-left-color:var(--success,#27ae60) !important; }

        .dash-qa-btn { display:flex; flex-direction:column; align-items:center; gap:6px; padding:14px 8px; border-radius:8px; border:1px solid var(--border-color,#ddd); background:var(--bg-secondary,#fafafa); cursor:pointer; transition:all .15s ease; font-size:13px; font-weight:600; }
        .dash-qa-btn:hover { background:var(--primary,#4361ee); color:#fff; transform:translateY(-2px); box-shadow:0 4px 12px rgba(67,97,238,.3); }
        .dash-qa-btn .dash-qa-icon { font-size:22px; line-height:1; }
        .dash-qa-btn.dash-qa-primary { background:var(--primary,#4361ee); color:#fff; border-color:var(--primary,#4361ee); }
        .dash-qa-btn.dash-qa-primary:hover { opacity:.9; }

        .dash-alert-icon { width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:13px; flex-shrink:0; }
        .dash-alert-critical { background:rgba(231,76,60,.15); color:var(--danger,#e74c3c); }
        .dash-alert-high { background:rgba(243,156,18,.15); color:var(--warning,#f39c12); }
        .dash-alert-low, .dash-alert-info, .dash-alert-medium { background:rgba(52,152,219,.12); color:var(--info,#3498db); }

        .expiry-badge { display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:700; padding:3px 8px; border-radius:10px; background:rgba(243,156,18,.14); color:var(--warning,#f39c12); }

        .dash-waste-row { display:flex; align-items:center; gap:8px; padding:8px 4px; border-bottom:1px solid var(--border-color,#eee); }
        .dash-waste-row:last-child { border-bottom:none; }
        .dash-waste-rank { width:22px; height:22px; border-radius:50%; background:var(--danger,#e74c3c); color:#fff; font-size:10px; font-weight:800; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
      </style>
    `;
  },

  _renderCogsBars(cogs) {
    if (!cogs || !cogs.by_category || cogs.by_category.length === 0) {
      return '<p class="text-muted text-sm" style="text-align:center;padding:16px 0">No COGS data available</p>';
    }

    const maxRevenue = Math.max(...cogs.by_category.map(c => c.revenue), 1);

    const summary = `
      <div class="flex items-center justify-between mb-md" style="padding:4px 0">
        <div>
          <span class="text-sm text-muted">Revenue</span>
          <div class="font-bold">${Utils.currency(cogs.total_revenue)}</div>
        </div>
        <div style="text-align:center">
          <span class="text-sm text-muted">COGS</span>
          <div class="font-bold" style="color:var(--danger,#e74c3c)">${Utils.percent(cogs.cogs_percent)}</div>
        </div>
        <div style="text-align:right">
          <span class="text-sm text-muted">Gross Profit</span>
          <div class="font-bold" style="color:var(--success,#27ae60)">${Utils.currency(cogs.gross_profit)}</div>
        </div>
      </div>
    `;

    const bars = cogs.by_category.map(cat => {
      const revWidth = Math.round((cat.revenue / maxRevenue) * 100);
      const costWidth = Math.round((cat.cogs / maxRevenue) * 100);
      const color = cat.color || '#4361ee';
      const cogsColor = cat.cogs_percent > 35 ? 'var(--danger,#e74c3c)' :
                         cat.cogs_percent > 28 ? 'var(--warning,#f39c12)' :
                         'var(--success,#27ae60)';

      return `
        <div class="dash-cogs-row">
          <div class="dash-cogs-label" title="${Utils.escapeHtml(cat.category_name)}">
            <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${color};margin-right:6px"></span>
            ${Utils.escapeHtml(cat.category_name)}
          </div>
          <div class="dash-cogs-bar-wrap">
            <div class="dash-cogs-bar-rev" style="width:${revWidth}%;background:${color}"></div>
            <div class="dash-cogs-bar-cost" style="width:${costWidth}%;background:${color}"></div>
          </div>
          <div class="dash-cogs-pct" style="color:${cogsColor}">${Utils.percent(cat.cogs_percent)}</div>
        </div>
      `;
    }).join('');

    const legend = `
      <div class="flex items-center gap-md" style="padding:8px 0 0;font-size:11px;opacity:.6">
        <span>Solid = Cost, Light = Revenue</span>
      </div>
    `;

    return summary + bars + legend;
  },

  _renderInventoryHealth(health) {
    if (!health) {
      return '<p class="text-muted text-sm" style="text-align:center;padding:16px 0">Inventory data unavailable</p>';
    }

    const maxLocValue = Math.max(...(health.location_breakdown || []).map(l => l.value), 1);
    const locColors = ['#4361ee', '#f39c12', '#27ae60', '#e74c3c', '#9b59b6', '#1abc9c'];

    const metrics = `
      <div class="dash-inv-metrics">
        <div class="inv-metric">
          <div class="inv-metric-val">${Utils.currency(health.total_inventory_value)}</div>
          <div class="inv-metric-lbl">Total Value</div>
        </div>
        <div class="inv-metric">
          <div class="inv-metric-val">${health.total_items}</div>
          <div class="inv-metric-lbl">Total Items</div>
        </div>
        <div class="inv-metric" style="cursor:pointer" id="dash-below-par-link">
          <div class="inv-metric-val" style="color:${health.below_par_count > 0 ? 'var(--danger,#e74c3c)' : 'var(--success,#27ae60)'}">
            ${health.below_par_count}
          </div>
          <div class="inv-metric-lbl">Below Par</div>
        </div>
        <div class="inv-metric">
          <div class="inv-metric-val">
            <span class="expiry-badge">${health.expiring_soon} expiring</span>
          </div>
          <div class="inv-metric-lbl">Soon</div>
        </div>
      </div>
    `;

    const locations = (health.location_breakdown || []).map((loc, i) => {
      const pct = Math.round((loc.value / maxLocValue) * 100);
      const color = locColors[i % locColors.length];
      return `
        <div class="dash-loc-row">
          <span class="location-tag" title="${Utils.escapeHtml(loc.location)}">${Utils.escapeHtml(loc.location)}</span>
          <div class="dash-loc-bar">
            <div class="dash-loc-fill" style="width:${pct}%;background:${color}"></div>
          </div>
          <span class="dash-loc-val">${Utils.currency(loc.value)}</span>
        </div>
      `;
    }).join('');

    const locSection = locations
      ? `<div style="margin-top:4px">
           <div class="text-sm font-bold" style="opacity:.6;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">By Location</div>
           ${locations}
         </div>`
      : '';

    return metrics + locSection;
  },

  _renderWasteTable(waste) {
    if (!waste || !waste.top_wasted || waste.top_wasted.length === 0) {
      return '<p class="text-muted text-sm" style="text-align:center;padding:16px 0">No waste data this period</p>';
    }

    // Waste by reason summary
    const reasonSummary = (waste.by_reason || []).map(r => `
      <span class="badge badge-${r.count > 5 ? 'danger' : 'warning'}" style="margin-right:4px;margin-bottom:4px;font-size:11px">
        ${Utils.escapeHtml(r.reason)}: ${r.count} (${Utils.currency(r.total_cost)})
      </span>
    `).join('');

    const reasons = reasonSummary
      ? `<div style="padding:4px 0 10px;display:flex;flex-wrap:wrap;gap:4px">${reasonSummary}</div>`
      : '';

    const rows = waste.top_wasted.slice(0, 6).map((item, i) => `
      <div class="dash-waste-row">
        <span class="dash-waste-rank">${i + 1}</span>
        <div style="flex:1;min-width:0">
          <div class="text-sm font-bold" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${Utils.escapeHtml(item.name)}
          </div>
          <div class="text-muted text-sm">${item.total_qty} ${Utils.escapeHtml(item.unit)} &middot; ${item.incident_count} incidents</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div class="text-sm font-bold" style="color:var(--danger,#e74c3c)">${Utils.currency(item.total_cost)}</div>
        </div>
      </div>
    `).join('');

    return reasons + rows;
  },

  _renderReorderCards(reorder) {
    if (!reorder || reorder.length === 0) {
      return '<p class="text-muted text-sm" style="text-align:center;padding:20px 0">All stock levels healthy</p>';
    }

    // Sort by urgency: critical first, then high, medium, low
    const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const sorted = [...reorder].sort((a, b) =>
      (urgencyOrder[a.urgency] ?? 99) - (urgencyOrder[b.urgency] ?? 99)
    );

    return sorted.slice(0, 8).map(item => {
      const urgencyClass = `urgency-${item.urgency || 'medium'}`;
      const urgencyLabel = (item.urgency || 'medium').toUpperCase();
      const badgeType = item.urgency === 'critical' ? 'danger' :
                        item.urgency === 'high' ? 'warning' :
                        item.urgency === 'medium' ? 'info' : 'success';

      return `
        <div class="reorder-card ${urgencyClass}">
          <div class="flex items-center justify-between">
            <div class="font-bold text-sm">${Utils.escapeHtml(item.name)}</div>
            <span class="badge badge-${badgeType}" style="font-size:10px">${urgencyLabel}</span>
          </div>
          <div class="text-muted text-sm" style="margin:4px 0">
            Stock: ${item.current_stock} / ${item.par_level} ${Utils.escapeHtml(item.unit)}
            &middot; ~${item.days_left != null ? item.days_left + 'd left' : 'N/A'}
          </div>
          <div class="flex items-center justify-between text-sm">
            <span style="opacity:.7">${Utils.escapeHtml(item.supplier_name || 'No supplier')}</span>
            <span class="font-bold">Order ${item.suggested_order_qty} ${Utils.escapeHtml(item.unit)} &middot; ${Utils.currency(item.est_cost)}</span>
          </div>
          ${item.reason ? `<div class="text-muted text-sm" style="margin-top:2px;font-style:italic">${Utils.escapeHtml(item.reason)}</div>` : ''}
        </div>
      `;
    }).join('');
  },

  _renderQuickAction(label, route, icon, variant) {
    const cls = variant === 'primary' ? 'dash-qa-btn dash-qa-primary' : 'dash-qa-btn';
    return `
      <button class="${cls}" onclick="App.navigate('${route}')">
        <span class="dash-qa-icon">${icon}</span>
        <span>${label}</span>
      </button>
    `;
  },
};
