/* ============================================================
   VENUECORE - Interactive Demo Tour
   Step-by-step guided walkthrough of every feature
   ============================================================ */
const DemoTour = {
  active: false,
  currentStep: 0,
  steps: [],
  overlay: null,
  panel: null,

  // Define all tour steps
  getAllSteps() {
    return [
      // ---- Welcome ----
      {
        id: 'welcome',
        title: 'Welcome to VenueCore',
        body: 'This guided tour will walk you through every feature of the system. VenueCore is a complete restaurant management platform — from taking orders to tracking inventory, managing staff, and analyzing your business.',
        target: null,
        route: 'dashboard',
        position: 'center',
        icon: '',
      },

      // ---- Dashboard ----
      {
        id: 'dashboard-overview',
        title: 'Dashboard - Your Command Center',
        body: 'The Dashboard gives you a real-time snapshot of your entire operation. Sales totals, open orders, table occupancy, staff on the clock, and kitchen queue — all at a glance. In a live system, these numbers update in real-time via server-sent events.',
        target: '#main-body',
        route: 'dashboard',
        position: 'top',
        icon: '',
      },
      {
        id: 'dashboard-sidebar',
        title: 'Navigation Sidebar',
        body: 'The sidebar organizes everything into sections: Operations (daily tasks), Management (menu, inventory, customers), Team (staff and scheduling), Insights (analytics and reports), and System (alerts and settings). Staff users only see Operations — admins see everything.',
        target: '.sidebar-nav',
        route: 'dashboard',
        position: 'right',
        icon: '',
      },

      // ---- POS Terminal ----
      {
        id: 'pos-overview',
        title: 'POS Terminal - Taking Orders',
        body: 'This is where your staff takes orders. Select a category on the left, tap menu items to add them to the ticket on the right. You can adjust quantities, add modifiers (like "No Ice" or "Extra Shot"), apply discounts, and split checks. Each item gets sent to the correct kitchen station automatically.',
        target: '#main-body',
        route: 'pos',
        position: 'top',
        icon: '',
      },
      {
        id: 'pos-workflow',
        title: 'POS Workflow',
        body: 'The typical flow: Open a new order (dine-in, takeout, or bar tab) -> Add items -> Send to kitchen -> Items appear on the Kitchen Display -> When ready, close the order with payment (cash, card, or split). The system automatically deducts inventory using FIFO (first-in, first-out) based on recipes you define.',
        target: '#main-body',
        route: 'pos',
        position: 'top',
        icon: '',
      },

      // ---- Kitchen Display ----
      {
        id: 'kitchen-overview',
        title: 'Kitchen Display System (KDS)',
        body: 'Orders sent from the POS appear here in real-time, organized by station (grill, fryer, bar, etc.). Kitchen staff can see what needs to be made, how long each ticket has been waiting, and bump completed items. Color coding shows urgency — green is fresh, yellow is getting old, red needs immediate attention.',
        target: '#main-body',
        route: 'kitchen',
        position: 'top',
        icon: '',
      },

      // ---- Floor Plan ----
      {
        id: 'floor-overview',
        title: 'Floor Plan - Table Management',
        body: 'A visual map of your restaurant layout. Tables show their status (open, occupied, reserved) with color coding. Drag tables to rearrange your layout, click a table to open its order, or see which server is assigned. Sections like "Main", "Bar", and "Patio" help organize the space. Admins can add, remove, and resize tables.',
        target: '#main-body',
        route: 'floor',
        position: 'top',
        icon: '',
      },

      // ---- Menu Manager ----
      {
        id: 'menu-overview',
        title: 'Menu Manager',
        body: 'Build and manage your entire menu here. Create categories (Cocktails, Entrees, etc.), add items with prices, costs, descriptions, prep times, and kitchen station assignments. You can 86 items (mark as unavailable), set up modifiers (Add Bacon, Well Done), and organize display order. The cost field is used for food cost analysis and COGS tracking.',
        target: '#main-body',
        route: 'menu',
        position: 'top',
        icon: '',
      },

      // ---- Inventory ----
      {
        id: 'inventory-overview',
        title: 'Inventory - 9 Powerful Tabs',
        body: 'The inventory system has 9 tabs covering everything you need: Stock Levels (current quantities), Low Stock (items below par), Expiration/FIFO (spoilage prevention), Recipes (link ingredients to menu items), Count Sheets (physical counts with variance), Transfers (move stock between locations), Waste Log (track and categorize waste), Forecast (predict when you\'ll run out), and Reorder (smart suggestions).',
        target: '#main-body',
        route: 'inventory',
        position: 'top',
        icon: '',
      },
      {
        id: 'inventory-recipes',
        title: 'Inventory - Recipe System',
        body: 'Recipes link menu items to ingredients with specific quantities. When an order is closed, the system automatically deducts the right amount from inventory using FIFO — oldest stock first, open containers before sealed ones. This powers accurate food cost tracking and tells you exactly when you\'ll run out of each ingredient.',
        target: '#main-body',
        route: 'inventory',
        position: 'top',
        icon: '',
      },

      // ---- Suppliers ----
      {
        id: 'suppliers-overview',
        title: 'Suppliers',
        body: 'Manage your vendor relationships. Store contact info, payment terms, and notes for each supplier. Suppliers are linked to ingredients, so the system knows who to reorder from. You can track order history and see which supplier provides which items across your inventory.',
        target: '#main-body',
        route: 'suppliers',
        position: 'top',
        icon: '',
      },

      // ---- Supply Alerts ----
      {
        id: 'supply-alerts-overview',
        title: 'Supply Alerts & Auto-Reorder',
        body: 'The system automatically monitors your inventory every 15 minutes. When items like vodka or chicken drop below par level, it creates a reorder request and notifies the owner via in-app alerts, email, or SMS. You can see pending restock requests here — each one shows the item, current stock, suggested order quantity, supplier, and estimated cost.',
        target: '#main-body',
        route: 'supply-alerts',
        position: 'top',
        icon: '',
      },
      {
        id: 'supply-alerts-approval',
        title: 'Owner Approval Workflow',
        body: 'Nothing gets ordered without the owner\'s approval. Review each reorder request, adjust the quantity if needed, then approve or reject. Approved orders automatically create a Purchase Order linked to the supplier. You can also bulk-approve multiple items at once. Set up your email and phone in the Notification Settings tab to receive alerts on your phone when stock runs low.',
        target: '#main-body',
        route: 'supply-alerts',
        position: 'top',
        icon: '',
      },

      // ---- Customers ----
      {
        id: 'customers-overview',
        title: 'Customers & Loyalty',
        body: 'Track your regular customers with contact info, birthday, visit history, and loyalty points. Customers can be linked to orders and reservations. The loyalty system has tiers (Regular, Silver, Gold, Platinum) based on spending. Use this data for targeted promotions and personalized service.',
        target: '#main-body',
        route: 'customers',
        position: 'top',
        icon: '',
      },

      // ---- Reservations ----
      {
        id: 'reservations-overview',
        title: 'Reservations',
        body: 'Manage table reservations with date, time, party size, and table assignment. Link reservations to customer profiles for repeat guests. The system shows upcoming reservations on the dashboard and can be integrated with the floor plan to show reserved tables.',
        target: '#main-body',
        route: 'reservations',
        position: 'top',
        icon: '',
      },

      // ---- Staff ----
      {
        id: 'staff-overview',
        title: 'Staff Management',
        body: 'Add and manage employees with roles (Admin, Manager, Server, Bartender, Cook, Host). Each person gets a unique PIN for login. Set hourly rates, contact info, and permissions. The role determines what they can access — staff see only Operations, admins see everything.',
        target: '#main-body',
        route: 'staff',
        position: 'top',
        icon: '',
      },

      // ---- Time Clock ----
      {
        id: 'timeclock-overview',
        title: 'Time Clock',
        body: 'Employees clock in and out here. The system tracks hours worked, calculates labor costs based on hourly rates, and records tips per shift. Managers can review timesheets, edit entries, and export payroll data. Labor cost feeds into the analytics for labor-to-sales ratio tracking.',
        target: '#main-body',
        route: 'timeclock',
        position: 'top',
        icon: '',
      },

      // ---- Scheduling ----
      {
        id: 'scheduling-overview',
        title: 'Schedule',
        body: 'Build weekly schedules by assigning employees to shifts with start/end times and station assignments. Publish schedules so staff can see their upcoming shifts. The calendar view makes it easy to spot coverage gaps and balance labor across the week.',
        target: '#main-body',
        route: 'scheduling',
        position: 'top',
        icon: '',
      },

      // ---- Analytics ----
      {
        id: 'analytics-overview',
        title: 'Analytics',
        body: 'Deep insights into your business. View sales trends by day/week/month, product mix (what sells most), hourly sales patterns (peak hours), labor cost analysis, food cost breakdown, and COGS (cost of goods sold) by category. Use this data to optimize pricing, staffing, and menu composition.',
        target: '#main-body',
        route: 'analytics',
        position: 'top',
        icon: '',
      },

      // ---- Reports ----
      {
        id: 'reports-overview',
        title: 'Reports',
        body: 'Generate structured reports: Daily Sales Summary, Product Mix, Labor, Inventory Valuation, and more. Reports can be viewed on screen with tables and charts. Use these for end-of-day reconciliation, weekly reviews, and accounting.',
        target: '#main-body',
        route: 'reports',
        position: 'top',
        icon: '',
      },

      // ---- AI Assistant ----
      {
        id: 'ai-overview',
        title: 'AI Assistant',
        body: 'Ask natural language questions about your business data. "What were my top sellers last week?" or "Show me labor costs for March." The AI queries your actual database and provides insights, summaries, and recommendations. Requires an Anthropic API key in settings.',
        target: '#main-body',
        route: 'ai',
        position: 'top',
        icon: '',
      },

      // ---- Notifications ----
      {
        id: 'notifications-overview',
        title: 'Alerts & Notifications',
        body: 'System alerts appear here — low stock warnings, expiring inventory, 86\'d items, and custom notifications. Critical alerts show a badge count on the bell icon in the header. Acknowledge alerts to clear them. The system generates alerts automatically based on inventory thresholds.',
        target: '#main-body',
        route: 'notifications',
        position: 'top',
        icon: '',
      },

      // ---- Settings ----
      {
        id: 'settings-overview',
        title: 'Settings',
        body: 'Configure your restaurant name, tax rate, order number prefix, currency, receipt footer, loyalty program settings, and more. API keys for integrations (Anthropic AI, Stripe, Clover) are also configured here. These settings apply system-wide.',
        target: '#main-body',
        route: 'settings',
        position: 'top',
        icon: '',
      },

      // ---- Accounting ----
      {
        id: 'accounting-overview',
        title: 'Accounting',
        body: 'Full general ledger, chart of accounts, journal entries, and financial statements (P&L, Balance Sheet). Track revenue, expenses, COGS, and equity accounts. Automatically syncs with sales data from the POS for accurate financial reporting.',
        target: '#main-body',
        route: 'accounting',
        position: 'top',
        icon: '',
      },

      // ---- Payroll ----
      {
        id: 'payroll-overview',
        title: 'Payroll',
        body: 'Run payroll based on time clock data. Calculate gross pay, deductions, taxes, and net pay for each employee. View pay history, generate pay stubs, and export payroll reports. Integrates with the time clock and staff modules for seamless wage management.',
        target: '#main-body',
        route: 'payroll',
        position: 'top',
        icon: '',
      },

      // ---- AP Automation ----
      {
        id: 'ap-overview',
        title: 'AP Automation',
        body: 'Accounts Payable automation for managing vendor invoices and payments. Track outstanding bills, schedule payments, and maintain a clear audit trail. Linked to your suppliers for streamlined purchasing workflows.',
        target: '#main-body',
        route: 'ap',
        position: 'top',
        icon: '',
      },

      // ---- Banking ----
      {
        id: 'banking-overview',
        title: 'Banking',
        body: 'Connect and manage bank accounts, reconcile transactions, and track cash flow. View balances across accounts and match bank transactions to your internal records for accurate bookkeeping.',
        target: '#main-body',
        route: 'banking',
        position: 'top',
        icon: '',
      },

      // ---- Locations ----
      {
        id: 'locations-overview',
        title: 'Locations',
        body: 'Multi-location management for restaurant groups. Track performance, inventory, and staff across multiple venues from a single dashboard. Compare metrics between locations to identify top performers and areas for improvement.',
        target: '#main-body',
        route: 'locations',
        position: 'top',
        icon: '',
      },

      // ---- Training ----
      {
        id: 'training-overview',
        title: 'Training',
        body: 'Create and assign training programs for your team. Track completion, certifications, and compliance requirements. Onboard new hires with structured learning paths covering food safety, service standards, and POS operation.',
        target: '#main-body',
        route: 'training',
        position: 'top',
        icon: '',
      },

      // ---- Catering ----
      {
        id: 'catering-overview',
        title: 'Catering',
        body: 'Manage catering orders and events. Build custom menus for large parties, track deposits and payments, coordinate delivery logistics, and manage event timelines. Separate from regular POS orders for clean accounting.',
        target: '#main-body',
        route: 'catering',
        position: 'top',
        icon: '',
      },

      // ---- Marketing ----
      {
        id: 'marketing-overview',
        title: 'Marketing',
        body: 'Plan and track marketing campaigns, promotions, and loyalty rewards. Segment customers, create targeted offers, and measure ROI on your marketing spend. Integrates with the customer database for personalized outreach.',
        target: '#main-body',
        route: 'marketing',
        position: 'top',
        icon: '',
      },

      // ---- Forecasting ----
      {
        id: 'forecasting-overview',
        title: 'Forecasting',
        body: 'Predict future sales, labor needs, and inventory requirements using historical data and trends. Plan staffing levels, prep quantities, and purchasing based on forecasted demand. Helps reduce waste and optimize costs.',
        target: '#main-body',
        route: 'forecasting',
        position: 'top',
        icon: '',
      },

      // ---- Wrap Up ----
      {
        id: 'tour-complete',
        title: 'Tour Complete!',
        body: 'You\'ve seen every section of VenueCore. Feel free to explore on your own — all the data you see is demo data and will be cleaned up when you exit. To start fresh with your own real data, click "Exit Demo" in the header and log in with your admin PIN (1234).',
        target: null,
        route: 'dashboard',
        position: 'center',
        icon: '',
      },
    ];
  },

  start() {
    this.active = true;
    this.steps = this.getAllSteps();
    this.currentStep = 0;
    this.createOverlay();
    this.showStep();
  },

  stop() {
    this.active = false;
    this.currentStep = 0;
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
    if (this.panel) {
      this.panel.remove();
      this.panel = null;
    }
    document.querySelectorAll('.demo-highlight').forEach(el => el.classList.remove('demo-highlight'));
  },

  createOverlay() {
    // Remove old overlay
    const old = document.getElementById('demo-tour-overlay');
    if (old) old.remove();
    const oldPanel = document.getElementById('demo-tour-panel');
    if (oldPanel) oldPanel.remove();

    // Overlay backdrop
    this.overlay = document.createElement('div');
    this.overlay.id = 'demo-tour-overlay';
    this.overlay.className = 'demo-overlay';
    document.body.appendChild(this.overlay);

    // Tour panel
    this.panel = document.createElement('div');
    this.panel.id = 'demo-tour-panel';
    this.panel.className = 'demo-panel';
    document.body.appendChild(this.panel);
  },

  async showStep() {
    const step = this.steps[this.currentStep];
    if (!step) { this.stop(); return; }

    // Navigate to the right page if needed
    const currentRoute = location.hash.slice(2) || 'dashboard';
    if (step.route && step.route !== currentRoute) {
      await App.navigate(step.route);
      // Small delay for render
      await new Promise(r => setTimeout(r, 400));
    }

    // Remove previous highlights
    document.querySelectorAll('.demo-highlight').forEach(el => el.classList.remove('demo-highlight'));

    // Highlight target element
    let targetEl = null;
    if (step.target) {
      targetEl = document.querySelector(step.target);
      if (targetEl) {
        targetEl.classList.add('demo-highlight');
      }
    }

    // Position the panel
    const isCenter = step.position === 'center' || !targetEl;
    const total = this.steps.length;
    const cur = this.currentStep + 1;
    const progressPct = Math.round((cur / total) * 100);

    this.overlay.style.display = isCenter ? 'block' : 'block';
    this.overlay.style.opacity = isCenter ? '1' : '0.4';
    this.overlay.className = `demo-overlay ${isCenter ? 'demo-overlay-center' : 'demo-overlay-dim'}`;

    this.panel.className = `demo-panel ${isCenter ? 'demo-panel-center' : 'demo-panel-bottom'}`;
    this.panel.innerHTML = `
      <div class="demo-panel-header">
        <div class="demo-panel-icon">${step.icon}</div>
        <div class="demo-panel-title">${step.title}</div>
        <button class="demo-panel-close" onclick="DemoTour.stop(); App.exitDemo();" title="Exit Tour">X</button>
      </div>
      <div class="demo-panel-body">${step.body}</div>
      <div class="demo-panel-footer">
        <div class="demo-panel-progress">
          <div class="demo-progress-bar">
            <div class="demo-progress-fill" style="width:${progressPct}%"></div>
          </div>
          <span class="demo-progress-text">${cur} of ${total}</span>
        </div>
        <div class="demo-panel-buttons">
          ${this.currentStep > 0 ? '<button class="demo-btn demo-btn-secondary" onclick="DemoTour.prev()">Back</button>' : ''}
          ${this.currentStep < total - 1
            ? '<button class="demo-btn demo-btn-primary" onclick="DemoTour.next()">Next</button>'
            : '<button class="demo-btn demo-btn-primary" onclick="DemoTour.stop()">Finish</button>'
          }
        </div>
      </div>
      <div class="demo-panel-skip">
        <button class="demo-link" onclick="DemoTour.stop()">Skip tour - explore on my own</button>
      </div>
    `;

    // Scroll target into view
    if (targetEl && !isCenter) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  },

  next() {
    if (this.currentStep < this.steps.length - 1) {
      this.currentStep++;
      this.showStep();
    }
  },

  prev() {
    if (this.currentStep > 0) {
      this.currentStep--;
      this.showStep();
    }
  },

  goToStep(index) {
    if (index >= 0 && index < this.steps.length) {
      this.currentStep = index;
      this.showStep();
    }
  },
};
