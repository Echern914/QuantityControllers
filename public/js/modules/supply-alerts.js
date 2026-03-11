const SupplyAlertsModule = {
  _activeTab: 'pending',
  _cache: {},

  async render(container) {
    this._container = container;
    this._cache = {};

    try {
      const [dashboard, pending, allRequests] = await Promise.all([
        API.reorderDashboard(),
        API.reorderPending(),
        API.reorderRequests()
      ]);
      this._cache.dashboard = dashboard;
      this._cache.pending = pending;
      this._cache.allRequests = allRequests;
    } catch (err) {
      container.innerHTML = `<div class="empty-state"><h3>Error loading supply alerts</h3><p>${Utils.escapeHtml(err.message)}</p></div>`;
      return;
    }

    const d = this._cache.dashboard;

    container.innerHTML = `<div class="animate-fade">
      <!-- Summary Cards -->
      <div class="grid grid-4 mb-md">
        <div class="card">
          <div class="card-body text-center">
            <div class="text-2xl font-bold ${d.critical_count > 0 ? 'text-danger' : ''}">${d.pending_count}</div>
            <div class="text-sm text-secondary">Pending Approvals</div>
            ${d.critical_count > 0 ? `<div class="text-sm text-danger">${d.critical_count} Critical</div>` : ''}
          </div>
        </div>
        <div class="card">
          <div class="card-body text-center">
            <div class="text-2xl font-bold">${d.ordered_count}</div>
            <div class="text-sm text-secondary">On Order</div>
          </div>
        </div>
        <div class="card">
          <div class="card-body text-center">
            <div class="text-2xl font-bold">$${d.pending_est_cost.toFixed(2)}</div>
            <div class="text-sm text-secondary">Pending Cost</div>
          </div>
        </div>
        <div class="card">
          <div class="card-body text-center">
            <button class="btn btn-primary" onclick="SupplyAlertsModule.runSupplyCheck()">Run Supply Check</button>
            <div class="text-sm text-secondary mt-sm">Scan inventory now</div>
          </div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex justify-between items-center mb-md">
        <div class="tabs" id="supply-tabs">
          <button class="tab ${this._activeTab === 'pending' ? 'active' : ''}" onclick="SupplyAlertsModule.showTab('pending')">
            Pending Approval ${d.pending_count > 0 ? `<span class="nav-badge">${d.pending_count}</span>` : ''}
          </button>
          <button class="tab ${this._activeTab === 'all' ? 'active' : ''}" onclick="SupplyAlertsModule.showTab('all')">All Requests</button>
          <button class="tab ${this._activeTab === 'preferences' ? 'active' : ''}" onclick="SupplyAlertsModule.showTab('preferences')">Notification Settings</button>
        </div>
        ${this._activeTab === 'pending' && d.pending_count > 1 ? `
          <button class="btn btn-primary" onclick="SupplyAlertsModule.bulkApproveAll()">Approve All (${d.pending_count})</button>
        ` : ''}
      </div>

      <div id="supply-tab-content"></div>
    </div>`;

    this.showTab(this._activeTab);
  },

  showTab(tab) {
    this._activeTab = tab;
    document.querySelectorAll('#supply-tabs .tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('#supply-tabs .tab').forEach(t => {
      if ((tab === 'pending' && t.textContent.includes('Pending')) ||
          (tab === 'all' && t.textContent.includes('All')) ||
          (tab === 'preferences' && t.textContent.includes('Notification'))) {
        t.classList.add('active');
      }
    });

    const content = document.getElementById('supply-tab-content');
    if (!content) return;

    switch (tab) {
      case 'pending': this.renderPending(content); break;
      case 'all': this.renderAll(content); break;
      case 'preferences': this.renderPreferences(content); break;
    }
  },

  renderPending(container) {
    const requests = this._cache.pending?.requests || [];

    if (requests.length === 0) {
      container.innerHTML = `<div class="card"><div class="card-body">
        <div class="empty-state">
          <h3>No Pending Reorders</h3>
          <p>All supply levels are good! The system automatically monitors inventory and will alert you when items need restocking.</p>
        </div>
      </div></div>`;
      return;
    }

    container.innerHTML = `<div class="card"><div class="card-body p-0">
      <table class="table">
        <thead>
          <tr>
            <th><input type="checkbox" id="select-all-reorders" onchange="SupplyAlertsModule.toggleSelectAll(this)"></th>
            <th>Item</th>
            <th>Urgency</th>
            <th>Current Stock</th>
            <th>Par Level</th>
            <th>Suggested Order</th>
            <th>Supplier</th>
            <th>Est. Cost</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${requests.map(r => `
            <tr class="${r.urgency === 'critical' ? 'row-critical' : r.urgency === 'high' ? 'row-warning' : ''}">
              <td><input type="checkbox" class="reorder-checkbox" value="${r.id}"></td>
              <td>
                <div class="font-medium">${Utils.escapeHtml(r.ingredient_name)}</div>
                <div class="text-sm text-muted">${Utils.escapeHtml(r.reason || '')}</div>
              </td>
              <td>${this.urgencyBadge(r.urgency)}</td>
              <td>${r.current_stock.toFixed(1)} ${Utils.escapeHtml(r.unit)}</td>
              <td>${r.par_level > 0 ? r.par_level + ' ' + Utils.escapeHtml(r.unit) : '-'}</td>
              <td>
                <input type="number" class="input input-sm" style="width:80px" id="qty-${r.id}" value="${r.suggested_qty}" min="1" step="0.1">
                ${Utils.escapeHtml(r.unit)}
              </td>
              <td>${r.supplier_name ? Utils.escapeHtml(r.supplier_name) : '<span class="text-muted">None</span>'}</td>
              <td class="font-medium">$${r.est_total.toFixed(2)}</td>
              <td>
                <div class="flex gap-sm">
                  <button class="btn btn-primary btn-sm" onclick="SupplyAlertsModule.approveRequest(${r.id})">Approve</button>
                  <button class="btn btn-ghost btn-sm" onclick="SupplyAlertsModule.rejectRequest(${r.id})">Reject</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div></div>
    <style>
      .row-critical { border-left: 4px solid var(--danger) !important; background: rgba(239,68,68,0.05); }
      .row-warning { border-left: 4px solid var(--warning) !important; background: rgba(245,158,11,0.05); }
      .input-sm { padding: 4px 8px; font-size: 13px; }
    </style>`;
  },

  renderAll(container) {
    const requests = this._cache.allRequests || [];

    if (requests.length === 0) {
      container.innerHTML = `<div class="card"><div class="card-body">
        <div class="empty-state"><h3>No Reorder History</h3><p>Reorder requests will appear here once the supply monitor detects low stock levels.</p></div>
      </div></div>`;
      return;
    }

    container.innerHTML = `<div class="card"><div class="card-body p-0">
      <table class="table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Urgency</th>
            <th>Qty</th>
            <th>Est. Cost</th>
            <th>Supplier</th>
            <th>Status</th>
            <th>Date</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${requests.map(r => `
            <tr>
              <td>
                <div class="font-medium">${Utils.escapeHtml(r.ingredient_name)}</div>
                <div class="text-sm text-muted">${Utils.escapeHtml(r.reason || '')}</div>
              </td>
              <td>${this.urgencyBadge(r.urgency)}</td>
              <td>${r.suggested_qty} ${Utils.escapeHtml(r.unit)}</td>
              <td>$${r.est_total.toFixed(2)}</td>
              <td>${r.supplier_name ? Utils.escapeHtml(r.supplier_name) : '-'}</td>
              <td>${this.statusBadge(r.status)}</td>
              <td class="text-sm">${Utils.timeAgo(r.created_at)}</td>
              <td>
                ${r.status === 'pending' ? `
                  <button class="btn btn-primary btn-sm" onclick="SupplyAlertsModule.approveRequest(${r.id})">Approve</button>
                  <button class="btn btn-ghost btn-sm" onclick="SupplyAlertsModule.rejectRequest(${r.id})">Reject</button>
                ` : r.status === 'ordered' && r.purchase_order_id ? `
                  <span class="text-sm text-muted">PO #${r.purchase_order_id}</span>
                ` : r.status === 'rejected' ? `
                  <span class="text-sm text-muted" title="${Utils.escapeHtml(r.rejection_reason || '')}">${Utils.escapeHtml(r.rejected_by_name || 'Rejected')}</span>
                ` : ''}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div></div>`;
  },

  async renderPreferences(container) {
    const employeeId = App.employee?.id;
    if (!employeeId) return;

    let prefs;
    try {
      prefs = await API.notificationPrefs(employeeId);
    } catch {
      prefs = { email: '', phone: '', email_enabled: 0, sms_enabled: 0, push_enabled: 1, notify_low_stock: 1, notify_out_of_stock: 1, notify_reorder_ready: 1, notify_expiring: 0, low_stock_threshold: 0.20 };
    }

    container.innerHTML = `<div class="grid grid-2 gap-md">
      <!-- Contact Info -->
      <div class="card">
        <div class="card-header"><h3>Contact Information</h3></div>
        <div class="card-body">
          <p class="text-sm text-secondary mb-md">Set your email and phone number to receive restock alerts outside the app.</p>
          <div class="form-group">
            <label>Email Address</label>
            <input type="email" class="input" id="pref-email" value="${Utils.escapeHtml(prefs.email || '')}" placeholder="owner@restaurant.com">
          </div>
          <div class="form-group">
            <label>Phone Number (SMS)</label>
            <input type="tel" class="input" id="pref-phone" value="${Utils.escapeHtml(prefs.phone || '')}" placeholder="+1 (555) 123-4567">
          </div>
          <div class="form-group">
            <label>Low Stock Threshold</label>
            <div class="flex items-center gap-sm">
              <input type="range" id="pref-threshold" min="5" max="50" value="${Math.round(prefs.low_stock_threshold * 100)}" oninput="document.getElementById('threshold-val').textContent = this.value + '%'" style="flex:1">
              <span id="threshold-val" class="font-medium">${Math.round(prefs.low_stock_threshold * 100)}%</span>
            </div>
            <div class="text-sm text-muted">Alert when stock drops below this percentage of capacity</div>
          </div>
        </div>
      </div>

      <!-- Notification Channels -->
      <div class="card">
        <div class="card-header"><h3>Notification Channels</h3></div>
        <div class="card-body">
          <p class="text-sm text-secondary mb-md">Choose how you want to be notified about supply alerts.</p>
          <div class="form-group">
            <label class="flex items-center gap-sm">
              <input type="checkbox" id="pref-push" ${prefs.push_enabled ? 'checked' : ''}>
              <span>In-App Notifications</span>
            </label>
            <div class="text-sm text-muted" style="margin-left:24px">Real-time alerts in the VenueCore dashboard</div>
          </div>
          <div class="form-group">
            <label class="flex items-center gap-sm">
              <input type="checkbox" id="pref-email-enabled" ${prefs.email_enabled ? 'checked' : ''}>
              <span>Email Notifications</span>
            </label>
            <div class="text-sm text-muted" style="margin-left:24px">Receive email alerts for critical stock levels</div>
          </div>
          <div class="form-group">
            <label class="flex items-center gap-sm">
              <input type="checkbox" id="pref-sms-enabled" ${prefs.sms_enabled ? 'checked' : ''}>
              <span>SMS / Text Notifications</span>
            </label>
            <div class="text-sm text-muted" style="margin-left:24px">Text message alerts for urgent restock needs</div>
          </div>
        </div>
      </div>

      <!-- Alert Types -->
      <div class="card">
        <div class="card-header"><h3>Alert Types</h3></div>
        <div class="card-body">
          <p class="text-sm text-secondary mb-md">Select which types of supply alerts you want to receive.</p>
          <div class="form-group">
            <label class="flex items-center gap-sm">
              <input type="checkbox" id="pref-low-stock" ${prefs.notify_low_stock ? 'checked' : ''}>
              <span>Low Stock Alerts</span>
            </label>
            <div class="text-sm text-muted" style="margin-left:24px">When items drop below par level or threshold</div>
          </div>
          <div class="form-group">
            <label class="flex items-center gap-sm">
              <input type="checkbox" id="pref-out-of-stock" ${prefs.notify_out_of_stock ? 'checked' : ''}>
              <span>Out of Stock Alerts</span>
            </label>
            <div class="text-sm text-muted" style="margin-left:24px">When items are completely depleted</div>
          </div>
          <div class="form-group">
            <label class="flex items-center gap-sm">
              <input type="checkbox" id="pref-reorder-ready" ${prefs.notify_reorder_ready ? 'checked' : ''}>
              <span>Reorder Ready Notifications</span>
            </label>
            <div class="text-sm text-muted" style="margin-left:24px">When new reorder requests need your approval</div>
          </div>
          <div class="form-group">
            <label class="flex items-center gap-sm">
              <input type="checkbox" id="pref-expiring" ${prefs.notify_expiring ? 'checked' : ''}>
              <span>Expiration Warnings</span>
            </label>
            <div class="text-sm text-muted" style="margin-left:24px">When items are approaching expiration date</div>
          </div>
        </div>
      </div>

      <!-- Save Button -->
      <div class="card">
        <div class="card-header"><h3>Integration Status</h3></div>
        <div class="card-body">
          <div class="mb-md">
            <div class="flex items-center gap-sm mb-sm">
              <span style="color: var(--success)">&#10003;</span>
              <span>In-App Alerts: Active</span>
            </div>
            <div class="flex items-center gap-sm mb-sm">
              <span style="color: var(--warning)">&#9679;</span>
              <span>Email: ${prefs.email_enabled && prefs.email ? 'Configured' : 'Not configured'}</span>
            </div>
            <div class="flex items-center gap-sm mb-sm">
              <span style="color: var(--warning)">&#9679;</span>
              <span>SMS: ${prefs.sms_enabled && prefs.phone ? 'Configured' : 'Not configured'}</span>
            </div>
          </div>
          <div class="text-sm text-muted mb-md">
            Email and SMS require external service integration (SendGrid, Twilio, etc). Contact your system administrator to enable these features.
          </div>
          <button class="btn btn-primary btn-block" onclick="SupplyAlertsModule.savePreferences()">Save Notification Settings</button>
        </div>
      </div>
    </div>`;
  },

  urgencyBadge(urgency) {
    const colors = {
      critical: 'background:var(--danger);color:white',
      high: 'background:var(--warning);color:white',
      medium: 'background:var(--primary);color:white',
      low: 'background:var(--border-color);color:var(--text-primary)'
    };
    return `<span class="badge" style="padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;text-transform:uppercase;${colors[urgency] || colors.medium}">${urgency}</span>`;
  },

  statusBadge(status) {
    const map = {
      pending: { label: 'Pending', color: 'var(--warning)' },
      approved: { label: 'Approved', color: 'var(--primary)' },
      ordered: { label: 'Ordered', color: 'var(--success)' },
      rejected: { label: 'Rejected', color: 'var(--danger)' },
      received: { label: 'Received', color: 'var(--success)' }
    };
    const s = map[status] || { label: status, color: 'var(--text-muted)' };
    return `<span class="badge" style="padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;color:${s.color};border:1px solid ${s.color}">${s.label}</span>`;
  },

  toggleSelectAll(checkbox) {
    document.querySelectorAll('.reorder-checkbox').forEach(cb => cb.checked = checkbox.checked);
  },

  getSelectedIds() {
    return Array.from(document.querySelectorAll('.reorder-checkbox:checked')).map(cb => parseInt(cb.value));
  },

  async approveRequest(id) {
    const qtyInput = document.getElementById(`qty-${id}`);
    const quantity_override = qtyInput ? parseFloat(qtyInput.value) : undefined;

    try {
      const result = await API.approveReorder(id, {
        approved_by: App.employee?.id,
        quantity_override,
        auto_create_po: true
      });

      UI.toast('Approved', result.message, 'success');
      if (result.purchase_order) {
        UI.toast('PO Created', `Purchase Order ${result.purchase_order.order_number} created ($${result.purchase_order.total_cost.toFixed(2)})`, 'info');
      }
      this.render(this._container);
    } catch (err) {
      UI.toast('Error', err.message, 'danger');
    }
  },

  async rejectRequest(id) {
    const reason = prompt('Reason for rejection (optional):');
    if (reason === null) return; // Cancelled

    try {
      await API.rejectReorder(id, {
        rejected_by: App.employee?.id,
        reason: reason || 'No reason provided'
      });
      UI.toast('Rejected', 'Reorder request rejected', 'info');
      this.render(this._container);
    } catch (err) {
      UI.toast('Error', err.message, 'danger');
    }
  },

  async bulkApproveAll() {
    const selected = this.getSelectedIds();
    const ids = selected.length > 0 ? selected : (this._cache.pending?.requests || []).map(r => r.id);

    if (!ids.length) return;
    if (!confirm(`Approve ${ids.length} reorder request(s) and create purchase orders?`)) return;

    try {
      const result = await API.bulkApproveReorder({
        request_ids: ids,
        approved_by: App.employee?.id
      });

      UI.toast('Bulk Approved', `${result.approved_count} requests approved. ${result.purchase_orders.length} PO(s) created.`, 'success');
      this.render(this._container);
    } catch (err) {
      UI.toast('Error', err.message, 'danger');
    }
  },

  async runSupplyCheck() {
    try {
      UI.toast('Scanning', 'Running inventory supply check...', 'info');
      await API.triggerSupplyCheck();
      UI.toast('Complete', 'Supply check finished. Refreshing...', 'success');
      setTimeout(() => this.render(this._container), 500);
    } catch (err) {
      UI.toast('Error', err.message, 'danger');
    }
  },

  async savePreferences() {
    const employeeId = App.employee?.id;
    if (!employeeId) return;

    const data = {
      email: document.getElementById('pref-email')?.value || '',
      phone: document.getElementById('pref-phone')?.value || '',
      email_enabled: document.getElementById('pref-email-enabled')?.checked ? 1 : 0,
      sms_enabled: document.getElementById('pref-sms-enabled')?.checked ? 1 : 0,
      push_enabled: document.getElementById('pref-push')?.checked ? 1 : 0,
      notify_low_stock: document.getElementById('pref-low-stock')?.checked ? 1 : 0,
      notify_out_of_stock: document.getElementById('pref-out-of-stock')?.checked ? 1 : 0,
      notify_reorder_ready: document.getElementById('pref-reorder-ready')?.checked ? 1 : 0,
      notify_expiring: document.getElementById('pref-expiring')?.checked ? 1 : 0,
      low_stock_threshold: (parseInt(document.getElementById('pref-threshold')?.value || '20')) / 100
    };

    try {
      await API.updateNotificationPrefs(employeeId, data);
      UI.toast('Saved', 'Notification preferences updated', 'success');
    } catch (err) {
      UI.toast('Error', err.message, 'danger');
    }
  },

  destroy() {}
};
