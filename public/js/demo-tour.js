/* ============================================================
   VENUECORE - Interactive Demo Tour v2
   Guided walkthrough with interactive steps, keyboard nav,
   smooth transitions, and progress persistence
   ============================================================ */
const DemoTour = {
  active: false,
  currentStep: 0,
  steps: [],
  overlay: null,
  panel: null,
  _keyHandler: null,

  // Define all tour steps
  getAllSteps() {
    return [
      // ---- Welcome ----
      {
        id: 'welcome',
        title: 'Welcome to VenueCore',
        body: 'This guided tour will walk you through every feature of the system. VenueCore is a complete restaurant management platform — from taking orders to tracking inventory, managing staff, and analyzing your business.<br><br><strong>Use arrow keys or the buttons below to navigate.</strong>',
        target: null,
        route: 'dashboard',
        position: 'center',
        icon: '&#9733;',
      },

      // ---- Dashboard ----
      {
        id: 'dashboard-overview',
        title: 'Dashboard - Your Command Center',
        body: 'The Dashboard gives you a real-time snapshot of your entire operation. Sales totals, open orders, table occupancy, staff on the clock, and kitchen queue — all at a glance. These numbers update in real-time via server-sent events.',
        target: '#main-body',
        route: 'dashboard',
        position: 'bottom-right',
        icon: '&#9635;',
      },
      {
        id: 'dashboard-sidebar',
        title: 'Navigation Sidebar',
        body: 'The sidebar organizes everything into sections: <strong>Operations</strong> (daily tasks), <strong>Management</strong> (menu, inventory, customers), <strong>Team</strong> (staff and scheduling), <strong>Insights</strong> (analytics and reports), and <strong>Business</strong> (accounting, integrations).<br><br>Staff users only see Operations — admins see everything.',
        target: '.sidebar-nav',
        route: 'dashboard',
        position: 'right',
        icon: '&#9776;',
        interactive: 'Try clicking different sections in the sidebar to see how they expand!',
      },

      // ---- POS Terminal ----
      {
        id: 'pos-overview',
        title: 'POS Terminal - Taking Orders',
        body: 'This is where your staff takes orders. Select a category on the left, tap menu items to add them to the ticket on the right. You can adjust quantities, add modifiers, apply discounts, and split checks. Each item gets sent to the correct kitchen station automatically.',
        target: '#main-body',
        route: 'pos',
        position: 'bottom-right',
        icon: '&#9634;',
        interactive: 'Try tapping a menu item to add it to the current order!',
      },
      {
        id: 'pos-workflow',
        title: 'POS Workflow',
        body: 'The typical flow:<br><strong>1.</strong> Open a new order (dine-in, takeout, or bar tab)<br><strong>2.</strong> Add items from the menu<br><strong>3.</strong> Send to kitchen — items appear on KDS<br><strong>4.</strong> Close with payment (cash, card, or split)<br><br>The system automatically deducts inventory using FIFO based on recipes.',
        target: '#main-body',
        route: 'pos',
        position: 'bottom-right',
        icon: '&#8635;',
      },

      // ---- Kitchen Display ----
      {
        id: 'kitchen-overview',
        title: 'Kitchen Display System (KDS)',
        body: 'Orders sent from the POS appear here in real-time, organized by station (grill, fryer, bar, etc.). Kitchen staff see what needs to be made, how long each ticket has been waiting, and can bump completed items.<br><br>Color coding shows urgency — <span style="color:#22c55e">green</span> is fresh, <span style="color:#f59e0b">yellow</span> is getting old, <span style="color:#ef4444">red</span> needs immediate attention.',
        target: '#main-body',
        route: 'kitchen',
        position: 'bottom-right',
        icon: '&#9832;',
        interactive: 'Try clicking a ticket to mark items as complete!',
      },

      // ---- Floor Plan ----
      {
        id: 'floor-overview',
        title: 'Floor Plan - Table Management',
        body: 'A visual map of your restaurant layout. Tables show their status with color coding:<br><span style="color:#22c55e">&#9679; Open</span> &nbsp; <span style="color:#6366f1">&#9679; Occupied</span> &nbsp; <span style="color:#f59e0b">&#9679; Reserved</span> &nbsp; <span style="color:#ef4444">&#9679; Dirty</span><br><br>Drag tables to rearrange, click to open an order, or see which server is assigned. Admins can add, remove, and resize tables.',
        target: '#main-body',
        route: 'floor',
        position: 'bottom-right',
        icon: '&#9638;',
        interactive: 'Try clicking a table to see its details!',
      },

      // ---- Menu Manager ----
      {
        id: 'menu-overview',
        title: 'Menu Manager',
        body: 'Build and manage your entire menu here. Create categories (Cocktails, Entrees, etc.), add items with prices, costs, descriptions, prep times, and kitchen station assignments.<br><br>You can <strong>86 items</strong> (mark as unavailable), set up modifiers, and organize display order. The cost field powers food cost analysis and COGS tracking.',
        target: '#main-body',
        route: 'menu',
        position: 'bottom-right',
        icon: '&#9733;',
        interactive: 'Try clicking an item to edit its details or price!',
      },

      // ---- Recipe Deduction ----
      {
        id: 'drink-deduction-overview',
        title: 'Recipe Deduction',
        body: 'Track exactly how ingredients are used across your menu. When orders are closed, the system automatically deducts ingredient quantities based on the recipes you\'ve defined.<br><br>This ensures your inventory stays accurate without manual counting after every order.',
        target: '#main-body',
        route: 'drink-deduction',
        position: 'bottom-right',
        icon: '&#9878;',
      },

      // ---- Inventory ----
      {
        id: 'inventory-overview',
        title: 'Inventory - 9 Powerful Tabs',
        body: '<strong>Stock Levels</strong> — current quantities<br><strong>Low Stock</strong> — items below par<br><strong>Expiration/FIFO</strong> — spoilage prevention<br><strong>Recipes</strong> — link ingredients to menu items<br><strong>Count Sheets</strong> — physical counts with variance<br><strong>Transfers</strong> — move stock between locations<br><strong>Waste Log</strong> — track and categorize waste<br><strong>Forecast</strong> — predict when you\'ll run out<br><strong>Reorder</strong> — smart suggestions',
        target: '#main-body',
        route: 'inventory',
        position: 'bottom-right',
        icon: '&#9881;',
        interactive: 'Try switching between the tabs to explore each section!',
      },
      {
        id: 'inventory-recipes',
        title: 'Inventory - Recipe System',
        body: 'Recipes link menu items to ingredients with specific quantities. When an order is closed, the system automatically deducts the right amount using <strong>FIFO</strong> — oldest stock first, open containers before sealed ones.<br><br>This powers accurate food cost tracking and tells you exactly when you\'ll run out of each ingredient.',
        target: '#main-body',
        route: 'inventory',
        position: 'bottom-right',
        icon: '&#9998;',
      },

      // ---- Supply Alerts ----
      {
        id: 'supply-alerts-overview',
        title: 'Supply Alerts & Auto-Reorder',
        body: 'The system monitors your inventory every 15 minutes. When items drop below par level, it creates a reorder request and notifies the owner via in-app alerts, email, or SMS.<br><br>Each request shows the item, current stock, suggested order quantity, supplier, and estimated cost.',
        target: '#main-body',
        route: 'supply-alerts',
        position: 'bottom-right',
        icon: '&#9888;',
      },
      {
        id: 'supply-alerts-approval',
        title: 'Owner Approval Workflow',
        body: 'Nothing gets ordered without the owner\'s approval. Review each reorder request, adjust the quantity if needed, then approve or reject.<br><br>Approved orders automatically create a <strong>Purchase Order</strong> linked to the supplier. You can also bulk-approve multiple items at once.',
        target: '#main-body',
        route: 'supply-alerts',
        position: 'bottom-right',
        icon: '&#10003;',
      },

      // ---- Suppliers ----
      {
        id: 'suppliers-overview',
        title: 'Suppliers',
        body: 'Manage your vendor relationships. Store contact info, payment terms, and notes for each supplier. Suppliers are linked to ingredients, so the system knows who to reorder from.<br><br>Track order history and see which supplier provides which items.',
        target: '#main-body',
        route: 'suppliers',
        position: 'bottom-right',
        icon: '&#9879;',
      },

      // ---- Customers ----
      {
        id: 'customers-overview',
        title: 'Customers & Loyalty',
        body: 'Track your regulars with contact info, birthday, visit history, and loyalty points. The loyalty system has tiers:<br><br>&#9679; Regular &rarr; &#9679; Silver &rarr; &#9679; Gold &rarr; &#9679; Platinum<br><br>Use this data for targeted promotions and personalized service.',
        target: '#main-body',
        route: 'customers',
        position: 'bottom-right',
        icon: '&#9829;',
        interactive: 'Try clicking a customer to see their profile and visit history!',
      },

      // ---- Reservations ----
      {
        id: 'reservations-overview',
        title: 'Reservations',
        body: 'Manage table reservations with date, time, party size, and table assignment. Link reservations to customer profiles for repeat guests.<br><br>Upcoming reservations show on the dashboard and integrate with the floor plan.',
        target: '#main-body',
        route: 'reservations',
        position: 'bottom-right',
        icon: '&#128197;',
      },

      // ---- Staff ----
      {
        id: 'staff-overview',
        title: 'Staff Management',
        body: 'Add and manage employees with roles: <strong>Admin, Manager, Server, Bartender, Cook, Host</strong>. Each person gets a unique PIN for login.<br><br>Set hourly rates, contact info, and permissions. The role determines what they can access — staff see only Operations, admins see everything.',
        target: '#main-body',
        route: 'staff',
        position: 'bottom-right',
        icon: '&#9975;',
      },

      // ---- Time Clock ----
      {
        id: 'timeclock-overview',
        title: 'Time Clock',
        body: 'Employees clock in and out here. The system tracks hours worked, calculates labor costs based on hourly rates, and records tips per shift.<br><br>Managers can review timesheets, edit entries, and export payroll data. Labor cost feeds into analytics for labor-to-sales ratio tracking.',
        target: '#main-body',
        route: 'timeclock',
        position: 'bottom-right',
        icon: '&#9200;',
      },

      // ---- Scheduling ----
      {
        id: 'scheduling-overview',
        title: 'Schedule',
        body: 'Build weekly schedules by assigning employees to shifts with start/end times and station assignments. Publish schedules so staff can see their upcoming shifts.<br><br>The calendar view makes it easy to spot coverage gaps and balance labor across the week.',
        target: '#main-body',
        route: 'scheduling',
        position: 'bottom-right',
        icon: '&#128467;',
      },

      // ---- Analytics ----
      {
        id: 'analytics-overview',
        title: 'Analytics',
        body: 'Deep insights into your business:<br><strong>&#8226;</strong> Sales trends by day/week/month<br><strong>&#8226;</strong> Product mix — what sells most<br><strong>&#8226;</strong> Hourly sales patterns (peak hours)<br><strong>&#8226;</strong> Labor cost analysis<br><strong>&#8226;</strong> Food cost breakdown<br><strong>&#8226;</strong> COGS by category',
        target: '#main-body',
        route: 'analytics',
        position: 'bottom-right',
        icon: '&#128200;',
        interactive: 'Try changing the date range to see how trends shift!',
      },

      // ---- Reports ----
      {
        id: 'reports-overview',
        title: 'Reports',
        body: 'Generate structured reports: Daily Sales Summary, Product Mix, Labor, Inventory Valuation, and more.<br><br>Reports display with tables and charts. Use these for end-of-day reconciliation, weekly reviews, and accounting.',
        target: '#main-body',
        route: 'reports',
        position: 'bottom-right',
        icon: '&#128196;',
      },

      // ---- AI Assistant ----
      {
        id: 'ai-overview',
        title: 'AI Assistant',
        body: 'Ask natural language questions about your business data. The AI has <strong>14 tools</strong> — it can query your database, create menu items, adjust inventory, manage staff, generate reports, and more.<br><br>Try: <em>"What were my top sellers this week?"</em> or <em>"Create a new appetizer called Loaded Nachos at $14.99"</em>',
        target: '#main-body',
        route: 'ai',
        position: 'bottom-right',
        icon: '&#9889;',
        interactive: 'Try asking the AI a question about your demo data!',
      },

      // ---- Accounting ----
      {
        id: 'accounting-overview',
        title: 'Accounting',
        body: 'Full general ledger, chart of accounts, journal entries, and financial statements (P&L, Balance Sheet).<br><br>Track revenue, expenses, COGS, and equity accounts. Automatically syncs with sales data from the POS for accurate financial reporting.',
        target: '#main-body',
        route: 'accounting',
        position: 'bottom-right',
        icon: '&#128181;',
      },

      // ---- Payroll ----
      {
        id: 'payroll-overview',
        title: 'Payroll',
        body: 'Run payroll based on time clock data. Calculate gross pay, deductions, taxes, and net pay for each employee.<br><br>View pay history, generate pay stubs, and export payroll reports. Integrates with the time clock and staff modules.',
        target: '#main-body',
        route: 'payroll',
        position: 'bottom-right',
        icon: '&#128176;',
      },

      // ---- AP Automation ----
      {
        id: 'ap-overview',
        title: 'AP Automation',
        body: 'Accounts Payable automation for managing vendor invoices and payments. Track outstanding bills, schedule payments, and maintain a clear audit trail.<br><br>Linked to your suppliers for streamlined purchasing workflows.',
        target: '#main-body',
        route: 'ap',
        position: 'bottom-right',
        icon: '&#128179;',
      },

      // ---- Banking ----
      {
        id: 'banking-overview',
        title: 'Banking',
        body: 'Connect and manage bank accounts, reconcile transactions, and track cash flow. View balances across accounts and match bank transactions to your internal records for accurate bookkeeping.',
        target: '#main-body',
        route: 'banking',
        position: 'bottom-right',
        icon: '&#127974;',
      },

      // ---- Locations ----
      {
        id: 'locations-overview',
        title: 'Locations',
        body: 'Multi-location management for restaurant groups. Track performance, inventory, and staff across multiple venues from a single dashboard.<br><br>Compare metrics between locations to identify top performers and areas for improvement.',
        target: '#main-body',
        route: 'locations',
        position: 'bottom-right',
        icon: '&#127759;',
      },

      // ---- Training ----
      {
        id: 'training-overview',
        title: 'Training',
        body: 'Create and assign training programs for your team. Track completion, certifications, and compliance requirements.<br><br>Onboard new hires with structured learning paths covering food safety, service standards, and POS operation.',
        target: '#main-body',
        route: 'training',
        position: 'bottom-right',
        icon: '&#127891;',
      },

      // ---- Catering ----
      {
        id: 'catering-overview',
        title: 'Catering',
        body: 'Manage catering orders and events. Build custom menus for large parties, track deposits and payments, coordinate delivery logistics, and manage event timelines.<br><br>Separate from regular POS orders for clean accounting.',
        target: '#main-body',
        route: 'catering',
        position: 'bottom-right',
        icon: '&#127860;',
      },

      // ---- Marketing ----
      {
        id: 'marketing-overview',
        title: 'Marketing',
        body: 'Plan and track marketing campaigns, promotions, and loyalty rewards. Segment customers, create targeted offers, and measure ROI on your marketing spend.<br><br>Integrates with the customer database for personalized outreach.',
        target: '#main-body',
        route: 'marketing',
        position: 'bottom-right',
        icon: '&#128227;',
      },

      // ---- Forecasting ----
      {
        id: 'forecasting-overview',
        title: 'Forecasting',
        body: 'Predict future sales, labor needs, and inventory requirements using historical data and trends.<br><br>Plan staffing levels, prep quantities, and purchasing based on forecasted demand. Helps reduce waste and optimize costs.',
        target: '#main-body',
        route: 'forecasting',
        position: 'bottom-right',
        icon: '&#128202;',
      },

      // ---- Clover Integration ----
      {
        id: 'clover-overview',
        title: 'Clover Integration',
        body: 'Full Clover POS integration designed for the <strong>Clover App Market</strong>. Features include:<br><strong>&#8226;</strong> OAuth 2.0 multi-tenant merchant connection<br><strong>&#8226;</strong> Bidirectional menu, order, and payment sync<br><strong>&#8226;</strong> Real-time webhook processing<br><strong>&#8226;</strong> 5-tab management UI (Overview, Menu Sync, Orders, Sync Log, Config)',
        target: '#main-body',
        route: 'clover',
        position: 'bottom-right',
        icon: '&#9741;',
      },

      // ---- Notifications ----
      {
        id: 'notifications-overview',
        title: 'Alerts & Notifications',
        body: 'System alerts appear here — low stock warnings, expiring inventory, 86\'d items, and custom notifications.<br><br>Critical alerts show a badge count on the bell icon in the header. Acknowledge alerts to clear them.',
        target: '#main-body',
        route: 'notifications',
        position: 'bottom-right',
        icon: '&#128276;',
      },

      // ---- Settings ----
      {
        id: 'settings-overview',
        title: 'Settings',
        body: 'Configure your restaurant name, tax rate, order number prefix, currency, receipt footer, loyalty settings, and more.<br><br>API keys for integrations (Anthropic AI, Stripe, Clover) are also configured here. These settings apply system-wide.',
        target: '#main-body',
        route: 'settings',
        position: 'bottom-right',
        icon: '&#9881;',
      },

      // ---- Wrap Up ----
      {
        id: 'tour-complete',
        title: 'Tour Complete!',
        body: 'You\'ve seen every section of VenueCore. Feel free to explore on your own — all the data you see is demo data and will be cleaned up when you exit.<br><br>To start fresh with your own real data, click <strong>"Exit Demo"</strong> in the header and log in with your admin PIN.',
        target: null,
        route: 'dashboard',
        position: 'center',
        icon: '&#127942;',
      },
    ];
  },

  async start(fromStep) {
    this.active = true;
    this.steps = this.getAllSteps();
    this.currentStep = typeof fromStep === 'number' ? fromStep : 0;
    this.createOverlay();
    this._bindKeyboard();
    await this.showStep();
  },

  stop() {
    this.active = false;
    this.currentStep = 0;
    this._unbindKeyboard();
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
    if (this.panel) {
      this.panel.remove();
      this.panel = null;
    }
    document.querySelectorAll('.demo-highlight').forEach(el => el.classList.remove('demo-highlight'));
    // Clear saved progress
    this._saveProgress(0);
  },

  // ---- Keyboard Navigation ----
  _bindKeyboard() {
    this._unbindKeyboard();
    this._keyHandler = (e) => {
      if (!this.active) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        this.next();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        this.prev();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.stop();
        if (typeof App !== 'undefined') App.exitDemo();
      }
    };
    document.addEventListener('keydown', this._keyHandler);
  },

  _unbindKeyboard() {
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }
  },

  // ---- Progress Persistence ----
  async _saveProgress(step) {
    try {
      await fetch('/api/demo/tour-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${typeof API !== 'undefined' ? API.token : ''}` },
        body: JSON.stringify({ step }),
      });
    } catch {}
  },

  async _loadProgress() {
    try {
      const res = await fetch('/api/demo/tour-progress', {
        headers: { 'Authorization': `Bearer ${typeof API !== 'undefined' ? API.token : ''}` },
      });
      const data = await res.json();
      return data.step || 0;
    } catch { return 0; }
  },

  // Resume from last saved step
  async resume() {
    const step = await this._loadProgress();
    if (step > 0) {
      await this.start(step);
    } else {
      await this.start(0);
    }
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

    // Save progress
    this._saveProgress(this.currentStep);

    // Navigate to the right page if needed
    const currentRoute = location.hash.slice(2) || 'dashboard';
    if (step.route && step.route !== currentRoute) {
      await App.navigate(step.route);
      // Wait for render
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

    this.overlay.className = `demo-overlay ${isCenter ? 'demo-overlay-center' : 'demo-overlay-dim'}`;

    // Build interactive hint
    const interactiveHint = step.interactive
      ? `<div class="demo-interactive-hint"><span class="demo-hint-icon">&#9758;</span> ${step.interactive}</div>`
      : '';

    // Build step dots for mini-map (show nearby steps)
    const dotStart = Math.max(0, this.currentStep - 3);
    const dotEnd = Math.min(total, this.currentStep + 4);
    let dots = '';
    for (let i = dotStart; i < dotEnd; i++) {
      const cls = i === this.currentStep ? 'demo-dot active' : 'demo-dot';
      dots += `<span class="${cls}" onclick="DemoTour.goToStep(${i})" title="${this.steps[i].title}"></span>`;
    }

    // Apply transition class
    this.panel.classList.add('demo-panel-transitioning');

    // Small delay for transition effect
    await new Promise(r => setTimeout(r, 50));

    this.panel.className = `demo-panel ${isCenter ? 'demo-panel-center' : 'demo-panel-positioned'}`;
    this.panel.innerHTML = `
      <div class="demo-panel-header">
        <div class="demo-panel-icon">${step.icon}</div>
        <div class="demo-panel-title">${step.title}</div>
        <button class="demo-panel-close" onclick="DemoTour.stop(); App.exitDemo();" title="Exit Tour (Esc)">&#10005;</button>
      </div>
      <div class="demo-panel-body">
        ${step.body}
        ${interactiveHint}
      </div>
      <div class="demo-panel-footer">
        <div class="demo-panel-progress">
          <div class="demo-progress-bar">
            <div class="demo-progress-fill" style="width:${progressPct}%"></div>
          </div>
          <div class="demo-dots">${dots}</div>
          <span class="demo-progress-text">${cur} / ${total}</span>
        </div>
        <div class="demo-panel-buttons">
          ${this.currentStep > 0 ? '<button class="demo-btn demo-btn-secondary" onclick="DemoTour.prev()">&#8592; Back</button>' : ''}
          ${this.currentStep < total - 1
            ? '<button class="demo-btn demo-btn-primary" onclick="DemoTour.next()">Next &#8594;</button>'
            : '<button class="demo-btn demo-btn-primary demo-btn-finish" onclick="DemoTour.stop()">&#10003; Finish</button>'
          }
        </div>
      </div>
      <div class="demo-panel-skip">
        <button class="demo-link" onclick="DemoTour.stop()">Skip tour &mdash; explore on my own</button>
        <span class="demo-kb-hint">&#8592; &#8594; Arrow keys &nbsp;&bull;&nbsp; Esc to exit</span>
      </div>
    `;

    // Position panel near target if not centered
    if (!isCenter && targetEl) {
      this._positionNearTarget(targetEl, step.position);
    }

    // Scroll target into view
    if (targetEl && !isCenter) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Animate in
    requestAnimationFrame(() => {
      this.panel.classList.add('demo-panel-visible');
    });
  },

  _positionNearTarget(el, position) {
    const rect = el.getBoundingClientRect();
    const panelW = this.panel.offsetWidth;
    const panelH = this.panel.offsetHeight;
    const margin = 16;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let top, left;

    switch (position) {
      case 'right':
        top = rect.top;
        left = rect.right + margin;
        if (left + panelW > vw) { left = rect.left - panelW - margin; }
        break;
      case 'left':
        top = rect.top;
        left = rect.left - panelW - margin;
        if (left < 0) { left = rect.right + margin; }
        break;
      case 'top':
        top = rect.top - panelH - margin;
        left = rect.left;
        if (top < 0) { top = rect.bottom + margin; }
        break;
      case 'bottom':
        top = rect.bottom + margin;
        left = rect.left;
        break;
      case 'bottom-right':
      default:
        top = vh - panelH - margin - 36; // 36 for demo banner
        left = vw - panelW - margin;
        break;
    }

    // Clamp to viewport
    top = Math.max(margin, Math.min(top, vh - panelH - margin));
    left = Math.max(margin, Math.min(left, vw - panelW - margin));

    this.panel.style.top = `${top}px`;
    this.panel.style.left = `${left}px`;
    this.panel.style.right = 'auto';
    this.panel.style.bottom = 'auto';
    this.panel.style.transform = 'none';
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
