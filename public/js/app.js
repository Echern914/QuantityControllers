/* ============================================================
   NEXUS POS - Main Application Router & State
   ============================================================ */
const App = {
  employee: null,
  currentModule: null,
  sseConnection: null,
  clockInterval: null,
  alertCount: 0,

  async init() {
    // Check for existing session
    if (API.token) {
      try {
        const data = await API.me();
        this.employee = data.employee;
        this.showApp();
      } catch {
        API.setToken(null);
        this.showLogin();
      }
    } else {
      this.showLogin();
    }
  },

  showLogin() {
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="login-screen">
        <div class="login-container animate-fade">
          <div class="login-logo">NEXUS</div>
          <div class="login-subtitle">Point of Sale System</div>
          <div class="pin-display">
            <div class="pin-dot" id="dot-0"></div>
            <div class="pin-dot" id="dot-1"></div>
            <div class="pin-dot" id="dot-2"></div>
            <div class="pin-dot" id="dot-3"></div>
          </div>
          <div class="pin-pad">
            <button class="pin-btn" onclick="App.pinInput('1')">1</button>
            <button class="pin-btn" onclick="App.pinInput('2')">2</button>
            <button class="pin-btn" onclick="App.pinInput('3')">3</button>
            <button class="pin-btn" onclick="App.pinInput('4')">4</button>
            <button class="pin-btn" onclick="App.pinInput('5')">5</button>
            <button class="pin-btn" onclick="App.pinInput('6')">6</button>
            <button class="pin-btn" onclick="App.pinInput('7')">7</button>
            <button class="pin-btn" onclick="App.pinInput('8')">8</button>
            <button class="pin-btn" onclick="App.pinInput('9')">9</button>
            <button class="pin-btn clear" onclick="App.pinClear()">CLR</button>
            <button class="pin-btn" onclick="App.pinInput('0')">0</button>
            <button class="pin-btn enter" onclick="App.pinSubmit()">GO</button>
          </div>
          <div class="login-error" id="login-error"></div>
          <div class="login-quick-access">
            <h4>Quick Access</h4>
            <div class="quick-login-btns">
              <button class="quick-login-btn" onclick="App.quickLogin('1234')">Admin (1234)</button>
              <button class="quick-login-btn" onclick="App.quickLogin('1111')">Manager (1111)</button>
              <button class="quick-login-btn" onclick="App.quickLogin('2222')">Server (2222)</button>
            </div>
          </div>
        </div>
      </div>
    `;
    this._pin = '';
  },

  _pin: '',

  pinInput(digit) {
    if (this._pin.length >= 4) return;
    this._pin += digit;
    for (let i = 0; i < 4; i++) {
      document.getElementById(`dot-${i}`).classList.toggle('filled', i < this._pin.length);
    }
    if (this._pin.length === 4) setTimeout(() => this.pinSubmit(), 200);
  },

  pinClear() {
    this._pin = '';
    for (let i = 0; i < 4; i++) document.getElementById(`dot-${i}`).classList.remove('filled');
    document.getElementById('login-error').textContent = '';
  },

  async pinSubmit() {
    if (!this._pin) return;
    try {
      const data = await API.login(this._pin);
      API.setToken(data.token);
      this.employee = data.employee;
      this.showApp();
    } catch (err) {
      document.getElementById('login-error').textContent = err.message;
      this.pinClear();
    }
  },

  quickLogin(pin) {
    this._pin = pin;
    for (let i = 0; i < 4; i++) document.getElementById(`dot-${i}`).classList.add('filled');
    setTimeout(() => this.pinSubmit(), 200);
  },

  showApp() {
    const nav = this.getNavItems();
    const app = document.getElementById('app');
    const initials = (this.employee.firstName[0] + (this.employee.lastName?.[0] || '')).toUpperCase();

    app.innerHTML = `
      <div class="sidebar">
        <div class="sidebar-header">
          <div class="sidebar-logo">NEXUS</div>
          <div class="sidebar-version">POS v1.0</div>
        </div>
        <nav class="sidebar-nav" id="sidebar-nav">
          ${nav.map(section => `
            <div class="nav-section">
              <div class="nav-section-title">${section.title}</div>
              ${section.items.map(item => `
                <div class="nav-item" data-route="${item.route}" onclick="App.navigate('${item.route}')">
                  <span class="nav-icon">${item.icon}</span>
                  <span>${item.label}</span>
                  ${item.badgeId ? `<span class="nav-badge hidden" id="${item.badgeId}">0</span>` : ''}
                </div>
              `).join('')}
            </div>
          `).join('')}
        </nav>
        <div class="sidebar-footer">
          <div class="sidebar-user">
            <div class="sidebar-avatar" style="background:${this.employee.color || '#6366f1'}">${initials}</div>
            <div class="sidebar-user-info">
              <div class="sidebar-user-name">${Utils.escapeHtml(this.employee.firstName)} ${Utils.escapeHtml(this.employee.lastName || '')}</div>
              <div class="sidebar-user-role">${Utils.escapeHtml(this.employee.role)}</div>
            </div>
            <button class="sidebar-logout" onclick="App.logout()" title="Logout">\u23FB</button>
          </div>
        </div>
      </div>
      <div class="main-content">
        <div class="main-header" id="main-header">
          <h1 id="page-title">Dashboard</h1>
          <div class="header-actions">
            <div class="header-clock" id="header-clock"></div>
            <button class="notification-bell" onclick="App.navigate('notifications')" id="notification-bell">
              <span class="bell-icon">ALERTS</span>
              <span class="bell-count hidden" id="bell-count">0</span>
            </button>
          </div>
        </div>
        <div class="main-body" id="main-body"></div>
      </div>
    `;

    // Start clock
    this.updateClock();
    this.clockInterval = setInterval(() => this.updateClock(), 1000);

    // Start SSE
    this.connectSSE();

    // Load alert count
    this.updateAlertCount();

    // Navigate to default route or hash
    const hash = location.hash.slice(2) || 'dashboard';
    this.navigate(hash);
  },

  getNavItems() {
    return [
      {
        title: 'Operations',
        items: [
          { route: 'dashboard', label: 'Dashboard', icon: '\u25A6' },
          { route: 'pos', label: 'POS Terminal', icon: '$' },
          { route: 'kitchen', label: 'Kitchen (KDS)', icon: '\u2615', badgeId: 'badge-kitchen' },
          { route: 'floor', label: 'Floor Plan', icon: '\u25A3' },
        ]
      },
      {
        title: 'Management',
        items: [
          { route: 'menu', label: 'Menu Manager', icon: '\u2630' },
          { route: 'inventory', label: 'Inventory', icon: '\u25A4', badgeId: 'badge-inventory' },
          { route: 'suppliers', label: 'Suppliers', icon: '\u2192' },
          { route: 'customers', label: 'Customers', icon: '\u2637' },
          { route: 'reservations', label: 'Reservations', icon: '\u2316' },
        ]
      },
      {
        title: 'Team',
        items: [
          { route: 'staff', label: 'Staff', icon: '\u2605' },
          { route: 'timeclock', label: 'Time Clock', icon: '\u23F0' },
          { route: 'scheduling', label: 'Schedule', icon: '\u2750' },
        ]
      },
      {
        title: 'Insights',
        items: [
          { route: 'analytics', label: 'Analytics', icon: '\u2197' },
          { route: 'reports', label: 'Reports', icon: '\u2261' },
          { route: 'ai', label: 'AI Assistant', icon: '\u25C8' },
        ]
      },
      {
        title: 'System',
        items: [
          { route: 'notifications', label: 'Alerts', icon: '\u26A0', badgeId: 'badge-alerts' },
          { route: 'settings', label: 'Settings', icon: '\u2699' },
        ]
      },
    ];
  },

  async navigate(route) {
    location.hash = '#/' + route;

    // Update active nav
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.route === route);
    });

    const body = document.getElementById('main-body');
    const title = document.getElementById('page-title');
    body.className = 'main-body';

    // Clean up current module
    if (this.currentModule && this.currentModule.destroy) {
      this.currentModule.destroy();
    }

    const modules = {
      dashboard: { title: 'Dashboard', module: Dashboard },
      pos: { title: 'POS Terminal', module: POSTerminal, nopad: true },
      kitchen: { title: 'Kitchen Display', module: KitchenDisplay, nopad: true },
      floor: { title: 'Floor Plan', module: FloorPlan, nopad: true },
      menu: { title: 'Menu Manager', module: MenuManager },
      inventory: { title: 'Inventory', module: InventoryModule },
      suppliers: { title: 'Suppliers', module: SuppliersModule },
      customers: { title: 'Customers', module: CustomersModule },
      reservations: { title: 'Reservations', module: ReservationsModule },
      staff: { title: 'Staff', module: StaffModule },
      timeclock: { title: 'Time Clock', module: TimeClockModule },
      scheduling: { title: 'Schedule', module: SchedulingModule },
      analytics: { title: 'Analytics', module: AnalyticsModule },
      reports: { title: 'Reports', module: ReportsModule },
      ai: { title: 'AI Assistant', module: AIAssistant, nopad: true },
      notifications: { title: 'Alerts', module: NotificationsModule },
      settings: { title: 'Settings', module: SettingsModule },
    };

    const page = modules[route] || modules.dashboard;
    title.textContent = page.title;
    if (page.nopad) body.classList.add('no-padding');

    this.currentModule = page.module;
    UI.loading(body);

    try {
      await page.module.render(body);
    } catch (err) {
      console.error(`Error loading ${route}:`, err);
      body.innerHTML = `<div class="empty-state"><h3>Error loading page</h3><p>${Utils.escapeHtml(err.message)}</p></div>`;
    }
  },

  updateClock() {
    const el = document.getElementById('header-clock');
    if (el) el.textContent = Utils.clockTime();
  },

  async updateAlertCount() {
    try {
      const alerts = await API.notifications({ unread_only: 'true', limit: 100 });
      this.alertCount = alerts.length;
      const bellCount = document.getElementById('bell-count');
      const badgeAlerts = document.getElementById('badge-alerts');
      if (bellCount) {
        bellCount.textContent = alerts.length;
        bellCount.classList.toggle('hidden', alerts.length === 0);
      }
      if (badgeAlerts) {
        badgeAlerts.textContent = alerts.length;
        badgeAlerts.classList.toggle('hidden', alerts.length === 0);
      }
    } catch {}
  },

  connectSSE() {
    if (this.sseConnection) this.sseConnection.close();
    this.sseConnection = new EventSource('/api/events');
    this.sseConnection.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleSSE(data);
      } catch {}
    };
    this.sseConnection.onerror = () => {
      setTimeout(() => this.connectSSE(), 5000);
    };
  },

  handleSSE(data) {
    switch (data.type) {
      case 'notification':
        UI.toast(data.notification.title, data.notification.message, data.notification.severity === 'critical' ? 'danger' : 'info');
        this.updateAlertCount();
        break;
      case 'order_ready':
        UI.toast('Order Ready', `${data.orderNumber} ${data.table ? '- ' + data.table : ''}`, 'success');
        break;
      case 'item_86d':
        UI.toast('86\'d', `${data.item} is now 86'd`, 'warning');
        break;
      case 'kitchen_order':
        const badge = document.getElementById('badge-kitchen');
        if (badge) { badge.textContent = parseInt(badge.textContent || '0') + 1; badge.classList.remove('hidden'); }
        break;
      case 'clock_in':
      case 'clock_out':
        UI.toast(data.type === 'clock_in' ? 'Clock In' : 'Clock Out', data.employee, 'info');
        break;
    }
  },

  async logout() {
    try { await API.logout(); } catch {}
    API.setToken(null);
    this.employee = null;
    if (this.clockInterval) clearInterval(this.clockInterval);
    if (this.sseConnection) this.sseConnection.close();
    this.showLogin();
  },
};

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
