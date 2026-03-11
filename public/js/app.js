/* ============================================================
   VENUECORE - Main Application Router & State
   Role-based: Admin vs Staff
   ============================================================ */
const App = {
  employee: null,
  currentModule: null,
  sseConnection: null,
  clockInterval: null,
  alertCount: 0,
  demoMode: false,

  // Role helpers
  isAdmin() {
    return this.employee && ['admin', 'manager'].includes(this.employee.role);
  },

  async init() {
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

  async showLogin() {
    this.demoMode = false;
    document.body.classList.remove('demo-mode');
    const banner = document.getElementById('demo-banner');
    if (banner) banner.remove();

    // Check if any real employees exist
    let hasEmployees = true;
    try {
      const status = await API.get('/api/auth/status');
      hasEmployees = status.hasEmployees;
    } catch {}

    const app = document.getElementById('app');

    if (!hasEmployees) {
      // First-time setup — no employees exist yet
      app.innerHTML = `
        <div class="login-screen">
          <div class="login-container animate-fade">
            <div class="login-logo">VENUECORE</div>
            <div class="login-subtitle">Point of Sale System</div>
            <div class="setup-section">
              <h2 style="color:#fff;margin:0 0 4px;font-size:1.1rem;">Welcome! Set up your admin account</h2>
              <p style="color:#94a3b8;margin:0 0 18px;font-size:.85rem;">Create your first employee to get started.</p>
              <input id="setup-first" type="text" placeholder="First Name" class="setup-input" />
              <input id="setup-last" type="text" placeholder="Last Name (optional)" class="setup-input" />
              <input id="setup-pin" type="password" inputmode="numeric" maxlength="4" placeholder="4-Digit PIN" class="setup-input" />
              <div class="login-error" id="login-error"></div>
              <button class="setup-btn" onclick="App.submitSetup()">Create Admin Account</button>
            </div>
            <div class="demo-section">
              <div class="demo-section-label">Just exploring?</div>
              <button class="demo-start-btn" onclick="App.startDemo()">
                <span class="demo-play-icon">></span>
                <span>Try Interactive Demo</span>
              </button>
            </div>
          </div>
        </div>
      `;
    } else {
      // Normal PIN login
      app.innerHTML = `
        <div class="login-screen">
          <div class="login-container animate-fade">
            <div class="login-logo">VENUECORE</div>
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
            <div class="demo-section">
              <div class="demo-section-label">First time here?</div>
              <button class="demo-start-btn" onclick="App.startDemo()">
                <span class="demo-play-icon">></span>
                <span>Try Interactive Demo</span>
              </button>
            </div>
          </div>
        </div>
      `;
    }
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

  async submitSetup() {
    const first_name = document.getElementById('setup-first').value.trim();
    const last_name = document.getElementById('setup-last').value.trim();
    const pin = document.getElementById('setup-pin').value.trim();
    const errEl = document.getElementById('login-error');

    if (!first_name) { errEl.textContent = 'First name is required'; return; }
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) { errEl.textContent = 'Enter a 4-digit PIN'; return; }

    try {
      const data = await API.post('/api/auth/setup', { first_name, last_name, pin });
      API.setToken(data.token);
      this.employee = data.employee;
      this.showApp();
    } catch (err) {
      errEl.textContent = err.message;
    }
  },

  quickLogin(pin) {
    this._pin = pin;
    for (let i = 0; i < 4; i++) document.getElementById(`dot-${i}`).classList.add('filled');
    setTimeout(() => this.pinSubmit(), 200);
  },

  // ---- Demo Mode ----
  async startDemo() {
    const btn = document.querySelector('.demo-start-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="demo-play-icon">...</span><span>Loading demo data...</span>';
    }

    try {
      const data = await API.startDemo();
      API.setToken(data.token);
      this.employee = data.employee;
      this.demoMode = true;
      this.showApp();
      this.showDemoBanner();
      // Start the guided tour after a brief pause
      setTimeout(() => DemoTour.start(), 600);
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span class="demo-play-icon">></span><span>Try Interactive Demo</span>';
      }
      const errEl = document.getElementById('login-error');
      if (errEl) errEl.textContent = 'Failed to start demo: ' + err.message;
    }
  },

  showDemoBanner() {
    // Remove old banner if exists
    const old = document.getElementById('demo-banner');
    if (old) old.remove();

    document.body.classList.add('demo-mode');

    const banner = document.createElement('div');
    banner.id = 'demo-banner';
    banner.className = 'demo-banner';
    banner.innerHTML = `
      <div class="demo-banner-text">
        <div class="demo-banner-dot"></div>
        DEMO MODE - All data is temporary
      </div>
      <div class="demo-banner-actions">
        <button class="demo-banner-btn" onclick="DemoTour.start()">Restart Tour</button>
        <button class="demo-banner-btn demo-banner-btn-exit" onclick="App.exitDemo()">Exit Demo</button>
      </div>
    `;
    document.body.insertBefore(banner, document.body.firstChild);
  },

  async exitDemo() {
    // Stop the tour if running
    if (DemoTour.active) DemoTour.stop();

    // Cleanup demo data on the server
    try { await API.cleanupDemo(); } catch {}

    // Clear session and go back to login
    API.setToken(null);
    this.employee = null;
    this.demoMode = false;
    document.body.classList.remove('demo-mode');
    const banner = document.getElementById('demo-banner');
    if (banner) banner.remove();

    if (this.clockInterval) clearInterval(this.clockInterval);
    if (this.sseConnection) this.sseConnection.close();
    this.showLogin();
  },

  showApp() {
    const nav = this.getNavItems();
    const app = document.getElementById('app');
    const initials = (this.employee.firstName[0] + (this.employee.lastName?.[0] || '')).toUpperCase();
    const roleLabel = this.isAdmin() ? 'ADMIN' : 'STAFF';

    app.innerHTML = `
      <div class="sidebar">
        <div class="sidebar-header">
          <div class="sidebar-logo">VENUECORE</div>
          <div class="sidebar-version">${roleLabel}</div>
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
            <button class="sidebar-logout" onclick="${this.demoMode ? 'App.exitDemo()' : 'App.logout()'}" title="${this.demoMode ? 'Exit Demo' : 'Logout'}">OUT</button>
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

    this.updateClock();
    this.clockInterval = setInterval(() => this.updateClock(), 1000);
    this.connectSSE();
    this.updateAlertCount();
    if (this.isAdmin()) this.updateReorderBadge();

    const hash = location.hash.slice(2) || 'dashboard';
    // Validate route access
    const allowedRoutes = this._getAllowedRoutes();
    this.navigate(allowedRoutes.includes(hash) ? hash : 'dashboard');
  },

  _getAllowedRoutes() {
    const nav = this.getNavItems();
    const routes = [];
    for (const section of nav) {
      for (const item of section.items) {
        routes.push(item.route);
      }
    }
    return routes;
  },

  getNavItems() {
    const admin = this.isAdmin();

    // Staff operations - everyone gets these
    const sections = [
      {
        title: 'Operations',
        items: [
          { route: 'dashboard', label: 'Dashboard', icon: '' },
          { route: 'pos', label: 'POS Terminal', icon: '' },
          { route: 'kitchen', label: 'Kitchen', icon: '', badgeId: 'badge-kitchen' },
          { route: 'floor', label: 'Floor Plan', icon: '' },
          { route: 'timeclock', label: 'Time Clock', icon: '' },
        ]
      },
    ];

    // Admin-only sections
    if (admin) {
      sections.push(
        {
          title: 'Management',
          items: [
            { route: 'menu', label: 'Menu Manager', icon: '' },
            { route: 'drink-deduction', label: 'Recipe Deduction', icon: '' },
            { route: 'inventory', label: 'Inventory', icon: '', badgeId: 'badge-inventory' },
            { route: 'supply-alerts', label: 'Supply Alerts', icon: '', badgeId: 'badge-reorder' },
            { route: 'suppliers', label: 'Suppliers', icon: '' },
            { route: 'customers', label: 'Customers', icon: '' },
            { route: 'reservations', label: 'Reservations', icon: '' },
          ]
        },
        {
          title: 'Team',
          items: [
            { route: 'staff', label: 'Staff', icon: '' },
            { route: 'scheduling', label: 'Schedule', icon: '' },
          ]
        },
        {
          title: 'Insights',
          items: [
            { route: 'analytics', label: 'Analytics', icon: '' },
            { route: 'reports', label: 'Reports', icon: '' },
            { route: 'ai', label: 'AI Assistant', icon: '' },
          ]
        },
        {
          title: 'Finance',
          items: [
            { route: 'accounting', label: 'Accounting', icon: '' },
            { route: 'payroll', label: 'Payroll', icon: '' },
            { route: 'ap', label: 'AP Automation', icon: '' },
            { route: 'banking', label: 'Banking', icon: '' },
          ]
        },
        {
          title: 'Business',
          items: [
            { route: 'locations', label: 'Locations', icon: '' },
            { route: 'training', label: 'Training', icon: '' },
            { route: 'catering', label: 'Catering', icon: '' },
            { route: 'marketing', label: 'Marketing', icon: '' },
            { route: 'forecasting', label: 'Forecasting', icon: '' },
            { route: 'clover', label: 'Clover', icon: '' },
          ]
        },
        {
          title: 'System',
          items: [
            { route: 'notifications', label: 'Alerts', icon: '', badgeId: 'badge-alerts' },
            { route: 'settings', label: 'Settings', icon: '' },
          ]
        },
      );
    } else {
      // Staff gets minimal system access
      sections.push({
        title: 'System',
        items: [
          { route: 'notifications', label: 'Alerts', icon: '', badgeId: 'badge-alerts' },
        ]
      });
    }

    return sections;
  },

  async navigate(route) {
    // Check route access
    const allowedRoutes = this._getAllowedRoutes();
    if (!allowedRoutes.includes(route)) {
      route = 'dashboard';
    }

    location.hash = '#/' + route;

    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.route === route);
    });

    const body = document.getElementById('main-body');
    const title = document.getElementById('page-title');
    body.className = 'main-body';

    if (this.currentModule && this.currentModule.destroy) {
      this.currentModule.destroy();
    }

    const modules = {
      dashboard: { title: 'Dashboard', module: Dashboard },
      pos: { title: 'POS Terminal', module: POSTerminal, nopad: true },
      kitchen: { title: 'Kitchen Display', module: KitchenDisplay, nopad: true },
      floor: { title: 'Floor Plan', module: FloorPlan, nopad: true },
      menu: { title: 'Menu Manager', module: MenuManager },
      'drink-deduction': { title: 'Recipe Deduction', module: DrinkDeductionModule, nopad: true },
      inventory: { title: 'Inventory', module: InventoryModule },
      'supply-alerts': { title: 'Supply Alerts', module: SupplyAlertsModule },
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
      accounting: { title: 'Accounting', module: AccountingModule },
      payroll: { title: 'Payroll', module: PayrollModule },
      ap: { title: 'AP Automation', module: APModule },
      banking: { title: 'Banking', module: BankingModule },
      locations: { title: 'Locations', module: LocationsModule },
      training: { title: 'Training', module: TrainingModule },
      catering: { title: 'Catering', module: CateringModule },
      marketing: { title: 'Marketing', module: MarketingModule },
      forecasting: { title: 'Forecasting', module: ForecastingModule },
      clover: { title: 'Clover Integration', module: CloverModule },
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
      case 'reorder_request':
        UI.toast('Restock Needed', `${data.request.ingredient_name} - ${data.request.urgency}`, data.request.urgency === 'critical' ? 'danger' : 'warning');
        this.updateReorderBadge();
        break;
      case 'stock_deduction':
        UI.toast('Stock Deducted', `Order ${data.order_number}: ${data.deductions?.length || 0} ingredients updated`, 'info');
        if (this.currentModule === DrinkDeductionModule) {
          DrinkDeductionModule.handleStockDeduction(data);
        }
        break;
      case 'reorder_approved':
      case 'reorder_bulk_approved':
        this.updateReorderBadge();
        break;
      case 'clock_in':
      case 'clock_out':
        UI.toast(data.type === 'clock_in' ? 'Clock In' : 'Clock Out', data.employee, 'info');
        break;
    }
  },

  async updateReorderBadge() {
    try {
      const { count } = await API.reorderPending();
      const badge = document.getElementById('badge-reorder');
      if (badge) {
        badge.textContent = count;
        badge.classList.toggle('hidden', count === 0);
      }
    } catch {}
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
