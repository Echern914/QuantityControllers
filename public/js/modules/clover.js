/* ============================================================
   VENUECORE - Clover App Market Integration Module
   ============================================================ */
const CloverModule = {
  status: null,
  config: null,
  activeTab: 'overview',
  activeMerchant: null,

  async render(container) {
    UI.loading(container);
    try {
      const [status, config] = await Promise.all([
        API.get('/api/clover/status'),
        API.get('/api/clover/config')
      ]);
      this.status = status;
      this.config = config;
      this.activeMerchant = config.devMerchantId || (status.merchants?.[0]?.merchant_id);
    } catch (err) {
      this.status = { connected: false, configured: false };
      this.config = {};
    }

    container.innerHTML = `<div class="animate-fade">
      <div class="flex items-center justify-between mb-lg">
        <div>
          <div class="flex items-center gap-md">
            <span style="font-size:1.5rem;font-weight:800;color:#4caf50">CLOVER</span>
            <span class="badge ${this.status.connected ? 'badge-success' : 'badge-danger'}">${this.status.connected ? 'Connected' : 'Disconnected'}</span>
            <span class="badge badge-info">${(this.status.environment || 'sandbox').toUpperCase()}</span>
          </div>
          ${this.status.merchant ? `<div class="text-sm text-muted mt-xs">Merchant: ${Utils.escapeHtml(this.status.merchant)}</div>` : ''}
        </div>
        <div class="flex gap-sm">
          <button class="btn btn-sm btn-outline" onclick="CloverModule.testConnection()">Test Connection</button>
          ${this.status.connected ? `<button class="btn btn-sm btn-primary" onclick="CloverModule.fullSync()">Full Sync</button>` : ''}
        </div>
      </div>

      <div class="tabs mb-lg">
        ${['overview', 'menu-sync', 'orders', 'sync-log', 'settings'].map(t =>
          `<button class="tab ${this.activeTab === t ? 'active' : ''}" onclick="CloverModule.switchTab('${t}')">${this._tabLabel(t)}</button>`
        ).join('')}
      </div>

      <div id="clover-content"></div>
    </div>`;

    this._renderTab();
  },

  _tabLabel(t) {
    const labels = { overview: 'Overview', 'menu-sync': 'Menu Sync', orders: 'Orders', 'sync-log': 'Sync Log', settings: 'Configuration' };
    return labels[t] || t;
  },

  switchTab(tab) {
    this.activeTab = tab;
    document.querySelectorAll('.tabs .tab').forEach(el => el.classList.toggle('active', el.textContent === this._tabLabel(tab)));
    this._renderTab();
  },

  _renderTab() {
    const el = document.getElementById('clover-content');
    if (!el) return;
    switch (this.activeTab) {
      case 'overview': this._renderOverview(el); break;
      case 'menu-sync': this._renderMenuSync(el); break;
      case 'orders': this._renderOrders(el); break;
      case 'sync-log': this._renderSyncLog(el); break;
      case 'settings': this._renderSettings(el); break;
    }
  },

  // ---- Overview Tab ----
  _renderOverview(el) {
    const s = this.status;
    const c = this.config;
    const merchants = s.merchants || [];

    el.innerHTML = `
      <div class="grid grid-3 gap-lg mb-lg">
        <div class="card">
          <div class="card-body text-center">
            <div class="text-2xl font-bold" style="color:${s.connected ? '#4caf50' : '#ef4444'}">${s.connected ? 'ONLINE' : 'OFFLINE'}</div>
            <div class="text-sm text-muted mt-xs">Connection Status</div>
          </div>
        </div>
        <div class="card">
          <div class="card-body text-center">
            <div class="text-2xl font-bold">${merchants.length}</div>
            <div class="text-sm text-muted mt-xs">Merchants Connected</div>
          </div>
        </div>
        <div class="card">
          <div class="card-body text-center">
            <div class="text-2xl font-bold">${(s.environment || 'sandbox').toUpperCase()}</div>
            <div class="text-sm text-muted mt-xs">Environment</div>
          </div>
        </div>
      </div>

      ${!s.connected && !c.devMerchantId ? `
        <div class="card mb-lg">
          <div class="card-body text-center" style="padding:2rem">
            <h3>Connect Your Clover Account</h3>
            <p class="text-muted mt-sm mb-lg">Install VenueCore on your Clover merchant account to start syncing.</p>
            <button class="btn btn-primary btn-lg" onclick="CloverModule.startOAuth()">Connect with Clover</button>
            <div class="text-sm text-muted mt-md">Or configure dev credentials in Settings tab</div>
          </div>
        </div>
      ` : ''}

      ${merchants.length > 0 ? `
        <div class="card">
          <div class="card-header"><h3>Connected Merchants</h3></div>
          <div class="card-body">
            <table class="table">
              <thead><tr><th>Merchant</th><th>ID</th><th>Environment</th><th>Status</th><th>Last Sync</th><th>Actions</th></tr></thead>
              <tbody>
                ${merchants.map(m => `
                  <tr>
                    <td><strong>${Utils.escapeHtml(m.name || 'Unknown')}</strong></td>
                    <td><code>${Utils.escapeHtml(m.merchant_id)}</code></td>
                    <td><span class="badge badge-info">${m.environment}</span></td>
                    <td><span class="badge ${m.status === 'active' ? 'badge-success' : 'badge-danger'}">${m.status}</span></td>
                    <td>${m.last_sync_at ? Utils.timeAgo(m.last_sync_at) : 'Never'}</td>
                    <td>
                      <button class="btn btn-xs btn-outline" onclick="CloverModule.syncMerchant('${m.merchant_id}')">Sync</button>
                      <button class="btn btn-xs btn-danger" onclick="CloverModule.disconnectMerchant('${m.merchant_id}')">Disconnect</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}

      ${s.connected ? `
        <div class="grid grid-2 gap-lg mt-lg">
          <div class="card">
            <div class="card-header"><h3>Quick Actions</h3></div>
            <div class="card-body">
              <div class="flex flex-col gap-sm">
                <button class="btn btn-block btn-outline" onclick="CloverModule.switchTab('menu-sync')">Sync Menu Items</button>
                <button class="btn btn-block btn-outline" onclick="CloverModule.switchTab('orders')">View Clover Orders</button>
                <button class="btn btn-block btn-outline" onclick="CloverModule.viewCloverEmployees()">View Clover Employees</button>
                <button class="btn btn-block btn-primary" onclick="CloverModule.fullSync()">Run Full Sync</button>
              </div>
            </div>
          </div>
          <div class="card">
            <div class="card-header"><h3>Integration Health</h3></div>
            <div class="card-body">
              <div class="flex flex-col gap-sm">
                <div class="flex justify-between"><span>OAuth</span><span class="badge badge-success">Active</span></div>
                <div class="flex justify-between"><span>API Connection</span><span class="badge ${s.connected ? 'badge-success' : 'badge-danger'}">${s.connected ? 'OK' : 'Failed'}</span></div>
                <div class="flex justify-between"><span>Menu Sync</span><span class="badge badge-info">Ready</span></div>
                <div class="flex justify-between"><span>Order Sync</span><span class="badge badge-info">Ready</span></div>
                <div class="flex justify-between"><span>Webhooks</span><span class="badge badge-info">Configured</span></div>
              </div>
            </div>
          </div>
        </div>
      ` : ''}
    `;
  },

  // ---- Menu Sync Tab ----
  async _renderMenuSync(el) {
    el.innerHTML = `<div class="flex items-center gap-md"><div class="spinner"></div> Loading menu data...</div>`;

    const db = getDb();
    let cloverItems = [];
    let localItems = [];

    try {
      [cloverItems, localItems] = await Promise.all([
        this.status.connected ? API.get('/api/clover/items') : [],
        API.menuItems()
      ]);
    } catch (err) {
      cloverItems = [];
      localItems = await API.menuItems();
    }

    // Get mappings
    let mappings = [];
    try {
      mappings = await API.get('/api/clover/sync/mappings');
    } catch {}

    const mappedLocalIds = new Set(mappings.filter(m => m.entity_type === 'menu_item').map(m => m.local_id));
    const unmappedLocal = localItems.filter(i => !mappedLocalIds.has(i.id));
    const mappedLocal = localItems.filter(i => mappedLocalIds.has(i.id));

    el.innerHTML = `
      <div class="grid grid-3 gap-lg mb-lg">
        <div class="card">
          <div class="card-body text-center">
            <div class="text-2xl font-bold">${localItems.length}</div>
            <div class="text-sm text-muted">VenueCore Items</div>
          </div>
        </div>
        <div class="card">
          <div class="card-body text-center">
            <div class="text-2xl font-bold">${cloverItems.length}</div>
            <div class="text-sm text-muted">Clover Items</div>
          </div>
        </div>
        <div class="card">
          <div class="card-body text-center">
            <div class="text-2xl font-bold" style="color:#4caf50">${mappedLocal.length}</div>
            <div class="text-sm text-muted">Synced Items</div>
          </div>
        </div>
      </div>

      <div class="flex gap-sm mb-lg">
        <button class="btn btn-primary" onclick="CloverModule.pushAllItems()">Push All to Clover</button>
        <button class="btn btn-outline" onclick="CloverModule.pullAllItems()">Pull from Clover</button>
      </div>

      ${unmappedLocal.length > 0 ? `
        <div class="card mb-lg">
          <div class="card-header"><h3>Unsynced VenueCore Items (${unmappedLocal.length})</h3></div>
          <div class="card-body">
            <table class="table">
              <thead><tr><th>Item</th><th>Price</th><th>Category</th><th>Action</th></tr></thead>
              <tbody>
                ${unmappedLocal.map(i => `
                  <tr>
                    <td>${Utils.escapeHtml(i.name)}</td>
                    <td>${Utils.currency(i.price)}</td>
                    <td>${Utils.escapeHtml(i.category_name || '-')}</td>
                    <td><button class="btn btn-xs btn-primary" onclick="CloverModule.pushItem(${i.id})">Push to Clover</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}

      ${mappedLocal.length > 0 ? `
        <div class="card">
          <div class="card-header"><h3>Synced Items (${mappedLocal.length})</h3></div>
          <div class="card-body">
            <table class="table">
              <thead><tr><th>Item</th><th>Price</th><th>Clover ID</th><th>Last Synced</th></tr></thead>
              <tbody>
                ${mappedLocal.map(i => {
                  const m = mappings.find(mp => mp.entity_type === 'menu_item' && mp.local_id === i.id);
                  return `<tr>
                    <td>${Utils.escapeHtml(i.name)}</td>
                    <td>${Utils.currency(i.price)}</td>
                    <td><code>${m?.clover_id || '-'}</code></td>
                    <td>${m?.last_synced_at ? Utils.timeAgo(m.last_synced_at) : '-'}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}
    `;
  },

  // ---- Orders Tab ----
  async _renderOrders(el) {
    el.innerHTML = `<div class="flex items-center gap-md"><div class="spinner"></div> Loading Clover orders...</div>`;

    if (!this.status.connected) {
      el.innerHTML = `<div class="empty-state"><h3>Not Connected</h3><p>Connect to Clover to view orders.</p></div>`;
      return;
    }

    try {
      const orders = await API.get('/api/clover/orders');
      if (!orders.length) {
        el.innerHTML = `<div class="empty-state"><h3>No Orders</h3><p>No orders found in your Clover account.</p></div>`;
        return;
      }

      el.innerHTML = `
        <div class="card">
          <div class="card-header"><h3>Clover Orders (${orders.length})</h3></div>
          <div class="card-body">
            <table class="table">
              <thead><tr><th>Order ID</th><th>State</th><th>Total</th><th>Items</th><th>Created</th></tr></thead>
              <tbody>
                ${orders.map(o => `
                  <tr>
                    <td><code>${o.id}</code></td>
                    <td><span class="badge ${o.state === 'open' ? 'badge-warning' : 'badge-success'}">${o.state || 'unknown'}</span></td>
                    <td>${Utils.currency((o.total || 0) / 100)}</td>
                    <td>${o.lineItems?.elements?.length || 0}</td>
                    <td>${o.createdTime ? new Date(o.createdTime).toLocaleString() : '-'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } catch (err) {
      el.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${Utils.escapeHtml(err.message)}</p></div>`;
    }
  },

  // ---- Sync Log Tab ----
  async _renderSyncLog(el) {
    el.innerHTML = `<div class="flex items-center gap-md"><div class="spinner"></div> Loading sync log...</div>`;

    try {
      const log = await API.get('/api/clover/sync/log');
      if (!log.length) {
        el.innerHTML = `<div class="empty-state"><h3>No Sync History</h3><p>Run a sync to see activity here.</p></div>`;
        return;
      }

      el.innerHTML = `
        <div class="card">
          <div class="card-header flex justify-between items-center">
            <h3>Sync Log</h3>
            <button class="btn btn-sm btn-outline" onclick="CloverModule._renderSyncLog(document.getElementById('clover-content'))">Refresh</button>
          </div>
          <div class="card-body">
            <table class="table">
              <thead><tr><th>Time</th><th>Type</th><th>Entity</th><th>Direction</th><th>Status</th><th>Detail</th></tr></thead>
              <tbody>
                ${log.map(l => `
                  <tr>
                    <td>${Utils.timeAgo(l.created_at)}</td>
                    <td>${Utils.escapeHtml(l.sync_type)}</td>
                    <td>${Utils.escapeHtml(l.entity_type)}</td>
                    <td><span class="badge badge-info">${l.direction || l.sync_type}</span></td>
                    <td><span class="badge ${l.status === 'success' ? 'badge-success' : l.status === 'error' ? 'badge-danger' : 'badge-warning'}">${l.status}</span></td>
                    <td class="text-sm">${l.error_message ? Utils.escapeHtml(l.error_message).slice(0, 80) : '-'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } catch (err) {
      el.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${Utils.escapeHtml(err.message)}</p></div>`;
    }
  },

  // ---- Settings Tab ----
  _renderSettings(el) {
    const c = this.config || {};
    el.innerHTML = `
      <div class="grid grid-2 gap-lg">
        <div class="card">
          <div class="card-header"><h3>App Configuration</h3></div>
          <div class="card-body">
            <div class="form-group">
              <label class="form-label">Environment</label>
              <div class="text-lg font-bold">${(c.environment || 'sandbox').toUpperCase()}</div>
              <div class="text-sm text-muted">Set CLOVER_ENVIRONMENT in .env</div>
            </div>
            <div class="form-group">
              <label class="form-label">App ID</label>
              <div>${c.appId || '<span class="text-danger">Not configured</span>'}</div>
              <div class="text-sm text-muted">Set CLOVER_APP_ID in .env</div>
            </div>
            <div class="form-group">
              <label class="form-label">App Secret</label>
              <div>${c.appSecret || '<span class="text-danger">Not configured</span>'}</div>
              <div class="text-sm text-muted">Set CLOVER_APP_SECRET in .env</div>
            </div>
            <div class="form-group">
              <label class="form-label">OAuth Redirect URI</label>
              <code class="text-sm">${Utils.escapeHtml(c.redirectUri || '')}</code>
              <div class="text-sm text-muted mt-xs">Add this URL in your Clover app settings</div>
            </div>
            <div class="form-group">
              <label class="form-label">Webhook URL</label>
              <code class="text-sm">${Utils.escapeHtml(c.webhookUrl || '')}</code>
              <div class="text-sm text-muted mt-xs">Add this URL in your Clover app webhook settings</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h3>Dev Mode</h3></div>
          <div class="card-body">
            <div class="form-group">
              <label class="form-label">Dev Merchant ID</label>
              <div>${c.devMerchantId ? `<code>${Utils.escapeHtml(c.devMerchantId)}</code>` : '<span class="text-muted">Not set</span>'}</div>
            </div>
            <div class="form-group">
              <label class="form-label">Dev API Token</label>
              <div>${c.hasDevToken ? '<span class="badge badge-success">Configured</span>' : '<span class="badge badge-danger">Not set</span>'}</div>
            </div>
            <div class="text-sm text-muted mt-md" style="padding:1rem;background:var(--bg-secondary);border-radius:8px">
              <strong>Dev Mode</strong> uses CLOVER_MERCHANT_ID and CLOVER_API_TOKEN from .env for testing without OAuth.
              For production, merchants install through the Clover App Market and authenticate via OAuth 2.0.
            </div>
          </div>
        </div>

        <div class="card" style="grid-column: span 2">
          <div class="card-header"><h3>Environment Variables Required</h3></div>
          <div class="card-body">
            <div style="padding:1rem;background:var(--bg-secondary);border-radius:8px;font-family:'JetBrains Mono',monospace;font-size:0.85rem;line-height:1.8">
              <div># Clover App Market (required for OAuth)</div>
              <div>CLOVER_APP_ID=your_app_id</div>
              <div>CLOVER_APP_SECRET=your_app_secret</div>
              <div>CLOVER_REDIRECT_URI=http://localhost:4000/api/clover/oauth/callback</div>
              <div>CLOVER_WEBHOOK_SECRET=your_webhook_secret</div>
              <div style="margin-top:0.5rem"># Dev/Testing (bypass OAuth)</div>
              <div>CLOVER_MERCHANT_ID=${c.devMerchantId || 'your_merchant_id'}</div>
              <div>CLOVER_API_TOKEN=your_api_token</div>
              <div>CLOVER_ENVIRONMENT=sandbox</div>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  // ---- Actions ----

  async testConnection() {
    UI.toast('Testing...', 'Connecting to Clover API', 'info');
    try {
      const result = await API.post('/api/clover/test', { merchant_id: this.activeMerchant });
      if (result.connected) {
        UI.toast('Connected', `Merchant: ${result.merchant}`, 'success');
        this.status.connected = true;
        this.status.merchant = result.merchant;
      } else {
        UI.toast('Failed', result.error || 'Connection failed', 'danger');
      }
    } catch (err) {
      UI.toast('Error', err.message, 'danger');
    }
  },

  async fullSync() {
    if (!confirm('Run a full sync? This will push all VenueCore categories and menu items to Clover.')) return;
    UI.toast('Syncing...', 'Running full Clover sync', 'info');
    try {
      const results = await API.post('/api/clover/sync/full', { merchant_id: this.activeMerchant });
      const msg = `Items pushed: ${results.items.pushed}, Categories: ${results.categories.pushed}`;
      UI.toast('Sync Complete', msg, 'success');
      this._renderTab();
    } catch (err) {
      UI.toast('Sync Failed', err.message, 'danger');
    }
  },

  async pushAllItems() {
    if (!confirm('Push all VenueCore menu items to Clover?')) return;
    UI.toast('Pushing...', 'Sending items to Clover', 'info');
    try {
      const results = await API.post('/api/clover/sync/items/push', { merchant_id: this.activeMerchant });
      UI.toast('Done', `Pushed ${results.pushed} items${results.errors.length ? `, ${results.errors.length} errors` : ''}`, results.errors.length ? 'warning' : 'success');
      this._renderTab();
    } catch (err) {
      UI.toast('Error', err.message, 'danger');
    }
  },

  async pullAllItems() {
    if (!confirm('Pull items from Clover? New items will be created locally, existing items will be updated.')) return;
    UI.toast('Pulling...', 'Fetching items from Clover', 'info');
    try {
      const results = await API.post('/api/clover/sync/items/pull', { merchant_id: this.activeMerchant });
      UI.toast('Done', `Created: ${results.created}, Updated: ${results.updated}`, 'success');
      this._renderTab();
    } catch (err) {
      UI.toast('Error', err.message, 'danger');
    }
  },

  async pushItem(itemId) {
    try {
      await API.post(`/api/clover/sync/items/${itemId}/push`, { merchant_id: this.activeMerchant });
      UI.toast('Pushed', 'Item synced to Clover', 'success');
      this._renderTab();
    } catch (err) {
      UI.toast('Error', err.message, 'danger');
    }
  },

  async syncMerchant(merchantId) {
    UI.toast('Syncing...', `Syncing merchant ${merchantId}`, 'info');
    try {
      const results = await API.post('/api/clover/sync/full', { merchant_id: merchantId });
      UI.toast('Done', `Sync complete for ${merchantId}`, 'success');
      this.render(document.getElementById('main-body'));
    } catch (err) {
      UI.toast('Error', err.message, 'danger');
    }
  },

  async disconnectMerchant(merchantId) {
    if (!confirm(`Disconnect merchant ${merchantId}? This will remove the OAuth connection.`)) return;
    try {
      await API.post('/api/clover/oauth/disconnect', { merchant_id: merchantId });
      UI.toast('Disconnected', 'Merchant removed', 'success');
      this.render(document.getElementById('main-body'));
    } catch (err) {
      UI.toast('Error', err.message, 'danger');
    }
  },

  async startOAuth() {
    try {
      const { url } = await API.get('/api/clover/oauth/authorize');
      window.open(url, '_blank');
    } catch (err) {
      UI.toast('Error', 'OAuth not configured. Set CLOVER_APP_ID and CLOVER_APP_SECRET in .env', 'danger');
    }
  },

  async viewCloverEmployees() {
    try {
      const employees = await API.get('/api/clover/employees');
      const list = employees.map(e => `${e.name || 'Unknown'} (${e.role || 'staff'})`).join(', ');
      UI.toast('Clover Employees', list || 'No employees found', 'info');
    } catch (err) {
      UI.toast('Error', err.message, 'danger');
    }
  },

  destroy() {}
};
