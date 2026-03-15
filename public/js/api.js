/* ============================================================
   VENUECORE - API Client
   ============================================================ */
const API = {
  token: localStorage.getItem('venuecore_token'),
  baseUrl: '',

  setToken(token) {
    this.token = token;
    if (token) localStorage.setItem('venuecore_token', token);
    else localStorage.removeItem('venuecore_token');
  },

  async request(method, path, body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    };
    if (this.token) opts.headers['Authorization'] = `Bearer ${this.token}`;
    if (body) opts.body = JSON.stringify(body);

    try {
      const res = await fetch(`${this.baseUrl}${path}`, opts);
      clearTimeout(timeout);

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        return {};
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
      return data;
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') throw new Error('Request timed out');
      throw err;
    }
  },

  get(path) { return this.request('GET', path); },
  post(path, body) { return this.request('POST', path, body); },
  put(path, body) { return this.request('PUT', path, body); },
  patch(path, body) { return this.request('PATCH', path, body); },
  del(path) { return this.request('DELETE', path); },

  // Auth
  login(pin) { return this.post('/api/auth/login', { pin }); },
  logout() { return this.post('/api/auth/logout'); },
  me() { return this.get('/api/auth/me'); },
  verifyPin(pin, requiredRole) { return this.post('/api/auth/verify-pin', { pin, requiredRole }); },

  // Menu
  menuCategories() { return this.get('/api/menu/categories'); },
  menuItems(params) { return this.get('/api/menu/items' + (params ? '?' + new URLSearchParams(params) : '')); },
  menuActivePrices() { return this.get('/api/menu/active-prices'); },
  createMenuItem(data) { return this.post('/api/menu/items', data); },
  updateMenuItem(id, data) { return this.put(`/api/menu/items/${id}`, data); },
  toggle86(id, is86d) { return this.post(`/api/menu/items/${id}/${is86d ? '86' : 'un86'}`); },
  menuModifiers() { return this.get('/api/menu/modifiers'); },
  menuPricingRules() { return this.get('/api/menu/pricing-rules'); },
  createPricingRule(data) { return this.post('/api/menu/pricing-rules', data); },

  // POS / Orders
  createOrder(data) { return this.post('/api/pos/orders', data); },
  getOrders(params) { return this.get('/api/pos/orders' + (params ? '?' + new URLSearchParams(params) : '')); },
  getOrder(id) { return this.get(`/api/pos/orders/${id}`); },
  addOrderItems(orderId, items) { return this.post(`/api/pos/orders/${orderId}/items`, { items }); },
  updateOrderItem(orderId, itemId, data) { return this.patch(`/api/pos/orders/${orderId}/items/${itemId}`, data); },
  sendToKitchen(orderId) { return this.post(`/api/pos/orders/${orderId}/send`); },
  payOrder(orderId, payments) { return this.post(`/api/pos/orders/${orderId}/pay`, { payments }); },
  splitOrder(orderId, splitType, splits) { return this.post(`/api/pos/orders/${orderId}/split`, { split_type: splitType, splits }); },
  voidOrder(orderId, reason) { return this.post(`/api/pos/orders/${orderId}/void`, { reason }); },
  discountOrder(orderId, type, value, reason) { return this.post(`/api/pos/orders/${orderId}/discount`, { discount_type: type, discount_value: value, reason }); },
  getTabs() { return this.get('/api/pos/tabs'); },
  openTab(data) { return this.post('/api/pos/tabs', data); },
  closeTab(id, payments) { return this.post(`/api/pos/tabs/${id}/close`, { payments }); },

  // Inventory
  inventory(params) { return this.get('/api/inventory' + (params ? '?' + new URLSearchParams(params) : '')); },
  inventorySummary() { return this.get('/api/inventory/summary'); },
  lowStock() { return this.get('/api/inventory/low-stock'); },
  addStock(data) { return this.post('/api/inventory', data); },
  updateStock(id, data) { return this.patch(`/api/inventory/${id}`, data); },
  ingredients() { return this.get('/api/inventory/ingredients'); },
  addIngredient(data) { return this.post('/api/inventory/ingredients', data); },
  inventoryCategories() { return this.get('/api/inventory/categories'); },
  logWaste(data) { return this.post('/api/inventory/waste', data); },
  getWaste(params) { return this.get('/api/inventory/waste' + (params ? '?' + new URLSearchParams(params) : '')); },
  inventoryForecast(days) { return this.get(`/api/inventory/forecast?days=${days || 7}`); },
  inventoryVariance(days) { return this.get(`/api/inventory/variance?days=${days || 7}`); },
  receiveDelivery(data) { return this.post('/api/inventory/receive', data); },
  // Recipes
  inventoryRecipes() { return this.get('/api/inventory/recipes'); },
  recipeForItem(menuItemId) { return this.get(`/api/inventory/recipes/${menuItemId}`); },
  saveRecipe(menuItemId, ingredients) { return this.post(`/api/inventory/recipes/${menuItemId}`, { ingredients }); },
  // Expiration / FIFO
  expiringItems(days) { return this.get(`/api/inventory/expiring?days=${days || 7}`); },
  fifoOrder() { return this.get('/api/inventory/fifo'); },
  // Counts
  inventoryCounts() { return this.get('/api/inventory/counts'); },
  inventoryCount(id) { return this.get(`/api/inventory/counts/${id}`); },
  submitCount(data) { return this.post('/api/inventory/count', data); },
  // Transfers
  stockTransfers() { return this.get('/api/inventory/transfers'); },
  transferStock(data) { return this.post('/api/inventory/transfer', data); },
  approveTransfer(id, approvedBy) { return this.patch(`/api/inventory/transfers/${id}/approve`, { approved_by: approvedBy }); },
  rejectTransfer(id) { return this.patch(`/api/inventory/transfers/${id}/reject`); },
  // Reorder suggestions
  reorderSuggestions() { return this.get('/api/inventory/reorder-suggestions'); },
  // Profitability
  profitability(days) { return this.get(`/api/inventory/profitability?days=${days || 30}`); },
  profitabilityAnalyze(menuItemId) { return this.post('/api/inventory/profitability/analyze', { menu_item_id: menuItemId }); },

  // Reorder & Supply Alerts
  reorderRequests(params) { return this.get('/api/reorder/requests' + (params ? '?' + new URLSearchParams(params) : '')); },
  reorderPending() { return this.get('/api/reorder/requests/pending'); },
  reorderRequest(id) { return this.get(`/api/reorder/requests/${id}`); },
  approveReorder(id, data) { return this.patch(`/api/reorder/requests/${id}/approve`, data); },
  rejectReorder(id, data) { return this.patch(`/api/reorder/requests/${id}/reject`, data); },
  modifyReorder(id, data) { return this.patch(`/api/reorder/requests/${id}/modify`, data); },
  bulkApproveReorder(data) { return this.post('/api/reorder/bulk-approve', data); },
  triggerSupplyCheck() { return this.post('/api/reorder/check'); },
  reorderDashboard() { return this.get('/api/reorder/dashboard'); },
  notificationPrefs(employeeId) { return this.get(`/api/reorder/preferences/${employeeId}`); },
  updateNotificationPrefs(employeeId, data) { return this.put(`/api/reorder/preferences/${employeeId}`, data); },

  // Suppliers
  suppliers() { return this.get('/api/suppliers'); },
  createSupplier(data) { return this.post('/api/suppliers', data); },
  updateSupplier(id, data) { return this.put(`/api/suppliers/${id}`, data); },
  purchaseOrders(params) { return this.get('/api/suppliers/purchase-orders' + (params ? '?' + new URLSearchParams(params) : '')); },
  createPO(data) { return this.post('/api/suppliers/purchase-orders', data); },
  receivePO(id, items) { return this.patch(`/api/suppliers/purchase-orders/${id}/receive`, { items }); },

  // Staff
  staff() { return this.get('/api/staff'); },
  createStaff(data) { return this.post('/api/staff', data); },
  updateStaff(id, data) { return this.put(`/api/staff/${id}`, data); },
  roles() { return this.get('/api/staff/roles'); },

  // Timeclock
  clockIn(pin) { return this.post('/api/timeclock/clock-in', { pin }); },
  clockOut(pin, tips) { return this.post('/api/timeclock/clock-out', { pin, tips }); },
  clockedIn() { return this.get('/api/timeclock/current'); },
  timesheet(params) { return this.get('/api/timeclock/timesheet' + (params ? '?' + new URLSearchParams(params) : '')); },
  tipSummary(params) { return this.get('/api/timeclock/tips' + (params ? '?' + new URLSearchParams(params) : '')); },

  // Scheduling
  shifts(params) { return this.get('/api/scheduling/shifts' + (params ? '?' + new URLSearchParams(params) : '')); },
  createShift(data) { return this.post('/api/scheduling/shifts', data); },
  updateShift(id, data) { return this.put(`/api/scheduling/shifts/${id}`, data); },
  deleteShift(id) { return this.del(`/api/scheduling/shifts/${id}`); },
  publishShifts(start, end) { return this.post('/api/scheduling/shifts/publish', { start_date: start, end_date: end }); },
  weekView(weekStart) { return this.get(`/api/scheduling/week-view?week_start=${weekStart}`); },

  // Customers
  customers(params) { return this.get('/api/customers' + (params ? '?' + new URLSearchParams(params) : '')); },
  customer(id) { return this.get(`/api/customers/${id}`); },
  createCustomer(data) { return this.post('/api/customers', data); },
  updateCustomer(id, data) { return this.put(`/api/customers/${id}`, data); },
  addLoyalty(id, points) { return this.post(`/api/customers/${id}/loyalty/add`, { points }); },
  redeemLoyalty(id, points) { return this.post(`/api/customers/${id}/loyalty/redeem`, { points }); },
  upcomingBirthdays(days) { return this.get(`/api/customers/upcoming/birthdays?days=${days || 7}`); },

  // Tables
  floorPlan() { return this.get('/api/tables/floor-plan'); },
  tables() { return this.get('/api/tables'); },
  createTable(data) { return this.post('/api/tables', data); },
  updateTable(id, data) { return this.put(`/api/tables/${id}`, data); },
  setTableStatus(id, status) { return this.patch(`/api/tables/${id}/status`, { status }); },
  assignServer(id, serverId) { return this.patch(`/api/tables/${id}/assign`, { server_id: serverId }); },
  seatTable(id, data) { return this.post(`/api/tables/${id}/seat`, data); },

  // Reservations
  reservations(params) { return this.get('/api/reservations' + (params ? '?' + new URLSearchParams(params) : '')); },
  createReservation(data) { return this.post('/api/reservations', data); },
  updateReservation(id, data) { return this.patch(`/api/reservations/${id}`, data); },

  // Kitchen
  kitchenQueue(station) { return this.get('/api/kitchen/queue' + (station ? `?station=${station}` : '')); },
  kitchenOrders(station) { return this.get('/api/kitchen/orders' + (station ? `?station=${station}` : '')); },
  startPreparing(id) { return this.patch(`/api/kitchen/queue/${id}/start`); },
  markReady(id) { return this.patch(`/api/kitchen/queue/${id}/ready`); },
  markServed(id) { return this.patch(`/api/kitchen/queue/${id}/served`); },
  bumpOrder(orderId) { return this.post(`/api/kitchen/bump/${orderId}`); },
  kitchenStats() { return this.get('/api/kitchen/stats'); },

  // Analytics
  salesAnalytics(params) { return this.get('/api/analytics/sales' + (params ? '?' + new URLSearchParams(params) : '')); },
  productMix(days) { return this.get(`/api/analytics/product-mix?days=${days || 7}`); },
  hourlyAnalytics(date) { return this.get(`/api/analytics/hourly${date ? '?date=' + date : ''}`); },
  laborAnalytics(days) { return this.get(`/api/analytics/labor?days=${days || 7}`); },
  foodCostAnalytics(days) { return this.get(`/api/analytics/food-cost?days=${days || 7}`); },
  trends(weeks) { return this.get(`/api/analytics/trends?weeks=${weeks || 4}`); },
  realtimeStats() { return this.get('/api/analytics/realtime'); },
  cogsAnalytics(days) { return this.get(`/api/analytics/cogs?days=${days || 7}`); },
  wasteSummary(days) { return this.get(`/api/analytics/waste-summary?days=${days || 7}`); },
  inventoryHealth() { return this.get('/api/analytics/inventory-health'); },

  // Reports
  xReport() { return this.post('/api/reports/x-report'); },
  zReport() { return this.post('/api/reports/z-report'); },
  dailyReport(date) { return this.get(`/api/reports/daily/${date}`); },
  weeklyReports(weeks) { return this.get(`/api/reports/weekly?weeks=${weeks || 4}`); },
  plReport(params) { return this.get('/api/reports/pl' + (params ? '?' + new URLSearchParams(params) : '')); },

  // AI
  aiQuery(query, employeeId) { return this.post('/api/ai/query', { query, employee_id: employeeId }); },
  aiMenuSuggestions() { return this.get('/api/ai/menu-suggestions'); },
  aiCostOptimization() { return this.get('/api/ai/cost-optimization'); },
  aiDemandForecast() { return this.get('/api/ai/demand-forecast'); },
  aiInsights() { return this.get('/api/ai/insights'); },
  aiHistory() { return this.get('/api/ai/history'); },

  // Notifications
  notifications(params) { return this.get('/api/notifications' + (params ? '?' + new URLSearchParams(params) : '')); },
  readNotification(id, employeeId) { return this.patch(`/api/notifications/${id}/read`, { employee_id: employeeId }); },
  readAllNotifications() { return this.post('/api/notifications/read-all'); },

  // Settings
  settings() { return this.get('/api/settings'); },
  updateSetting(key, value) { return this.put(`/api/settings/${key}`, { value }); },
  openRegister(data) { return this.post('/api/settings/registers/open', data); },
  closeRegister(data) { return this.post('/api/settings/registers/close', data); },

  // Demo
  startDemo() { return this.post('/api/demo/start'); },
  cleanupDemo() { return this.post('/api/demo/cleanup'); },

  // ============================================================
  // BACK OFFICE & BUSINESS INTELLIGENCE
  // ============================================================

  // Accounting
  chartOfAccounts(params) { return this.get('/api/accounting/accounts' + (params ? '?' + new URLSearchParams(params) : '')); },
  createAccount(data) { return this.post('/api/accounting/accounts', data); },
  updateAccount(id, data) { return this.put(`/api/accounting/accounts/${id}`, data); },
  trialBalance(asOf) { return this.get(`/api/accounting/trial-balance${asOf ? '?as_of_date=' + asOf : ''}`); },
  journalEntries(params) { return this.get('/api/accounting/journal-entries' + (params ? '?' + new URLSearchParams(params) : '')); },
  createJournalEntry(data) { return this.post('/api/accounting/journal-entries', data); },
  postJournalEntry(id, postedBy) { return this.post(`/api/accounting/journal-entries/${id}/post`, { posted_by: postedBy }); },
  reverseJournalEntry(id, createdBy) { return this.post(`/api/accounting/journal-entries/${id}/reverse`, { created_by: createdBy }); },
  incomeStatement(params) { return this.get('/api/accounting/income-statement' + (params ? '?' + new URLSearchParams(params) : '')); },
  balanceSheet(asOf) { return this.get(`/api/accounting/balance-sheet${asOf ? '?as_of_date=' + asOf : ''}`); },
  cashFlow(params) { return this.get('/api/accounting/cash-flow' + (params ? '?' + new URLSearchParams(params) : '')); },
  fiscalPeriods() { return this.get('/api/accounting/fiscal-periods'); },
  createFiscalPeriod(data) { return this.post('/api/accounting/fiscal-periods', data); },
  closeFiscalPeriod(id, closedBy) { return this.post(`/api/accounting/fiscal-periods/${id}/close`, { closed_by: closedBy }); },
  budgets() { return this.get('/api/accounting/budgets'); },
  createBudget(data) { return this.post('/api/accounting/budgets', data); },
  budgetVsActual(params) { return this.get('/api/accounting/budget-vs-actual' + (params ? '?' + new URLSearchParams(params) : '')); },
  autoJournalDailySales(date) { return this.post('/api/accounting/auto-journal/daily-sales', { date }); },

  // Payroll
  payrollRuns(params) { return this.get('/api/payroll/runs' + (params ? '?' + new URLSearchParams(params) : '')); },
  payrollRun(id) { return this.get(`/api/payroll/runs/${id}`); },
  createPayrollRun(data) { return this.post('/api/payroll/runs', data); },
  approvePayroll(id, approvedBy) { return this.post(`/api/payroll/runs/${id}/approve`, { approved_by: approvedBy }); },
  processPayroll(id, processedBy) { return this.post(`/api/payroll/runs/${id}/process`, { processed_by: processedBy }); },
  tipPools() { return this.get('/api/payroll/tip-pools'); },
  createTipPool(data) { return this.post('/api/payroll/tip-pools', data); },
  tipPool(id) { return this.get(`/api/payroll/tip-pools/${id}`); },
  taxRates() { return this.get('/api/payroll/tax-rates'); },
  updateTaxRate(id, data) { return this.put(`/api/payroll/tax-rates/${id}`, data); },
  payrollSummary(params) { return this.get('/api/payroll/summary' + (params ? '?' + new URLSearchParams(params) : '')); },
  employeePayHistory(id) { return this.get(`/api/payroll/employee/${id}`); },

  // AP Automation
  apInvoices(params) { return this.get('/api/ap/invoices' + (params ? '?' + new URLSearchParams(params) : '')); },
  apInvoice(id) { return this.get(`/api/ap/invoices/${id}`); },
  createApInvoice(data) { return this.post('/api/ap/invoices', data); },
  approveApInvoice(id, approvedBy) { return this.post(`/api/ap/invoices/${id}/approve`, { approved_by: approvedBy }); },
  rejectApInvoice(id, reason) { return this.post(`/api/ap/invoices/${id}/reject`, { reason }); },
  payApInvoice(id, data) { return this.post(`/api/ap/invoices/${id}/pay`, data); },
  apAging() { return this.get('/api/ap/aging'); },
  apDashboard() { return this.get('/api/ap/dashboard'); },
  apWorkflows() { return this.get('/api/ap/workflows'); },
  createApWorkflow(data) { return this.post('/api/ap/workflows', data); },

  // Banking
  bankAccounts() { return this.get('/api/banking/accounts'); },
  createBankAccount(data) { return this.post('/api/banking/accounts', data); },
  updateBankAccount(id, data) { return this.put(`/api/banking/accounts/${id}`, data); },
  bankTransactions(accountId, params) { return this.get(`/api/banking/accounts/${accountId}/transactions` + (params ? '?' + new URLSearchParams(params) : '')); },
  addBankTransaction(accountId, data) { return this.post(`/api/banking/accounts/${accountId}/transactions`, data); },
  importBankTransactions(accountId, transactions) { return this.post(`/api/banking/accounts/${accountId}/import`, { transactions }); },
  matchBankTransaction(txId, entityType, entityId) { return this.post(`/api/banking/transactions/${txId}/match`, { entity_type: entityType, entity_id: entityId }); },
  autoMatchBank(accountId) { return this.get(`/api/banking/auto-match/${accountId}`); },
  reconcileBank(accountId, data) { return this.post(`/api/banking/accounts/${accountId}/reconcile`, data); },
  bankReconciliations(accountId) { return this.get(`/api/banking/accounts/${accountId}/reconciliations`); },
  bankingDashboard() { return this.get('/api/banking/dashboard'); },

  // Multi-Location
  locations() { return this.get('/api/locations'); },
  location(id) { return this.get(`/api/locations/${id}`); },
  createLocation(data) { return this.post('/api/locations', data); },
  updateLocation(id, data) { return this.put(`/api/locations/${id}`, data); },
  assignLocationStaff(locId, data) { return this.post(`/api/locations/${locId}/staff`, data); },
  removeLocationStaff(locId, empId) { return this.del(`/api/locations/${locId}/staff/${empId}`); },
  compareLocationSales(params) { return this.get('/api/locations/compare/sales' + (params ? '?' + new URLSearchParams(params) : '')); },
  compareLocationInventory() { return this.get('/api/locations/compare/inventory'); },
  locationTransfers() { return this.get('/api/locations/transfers'); },
  createLocationTransfer(data) { return this.post('/api/locations/transfers', data); },

  // Training LMS
  trainingCourses(params) { return this.get('/api/training/courses' + (params ? '?' + new URLSearchParams(params) : '')); },
  trainingCourse(id) { return this.get(`/api/training/courses/${id}`); },
  createTrainingCourse(data) { return this.post('/api/training/courses', data); },
  updateTrainingCourse(id, data) { return this.put(`/api/training/courses/${id}`, data); },
  createLesson(courseId, data) { return this.post(`/api/training/courses/${courseId}/lessons`, data); },
  updateLesson(id, data) { return this.put(`/api/training/lessons/${id}`, data); },
  lessonQuiz(lessonId) { return this.get(`/api/training/lessons/${lessonId}/quiz`); },
  addQuizQuestion(lessonId, data) { return this.post(`/api/training/lessons/${lessonId}/quiz`, data); },
  trainingEnrollments(params) { return this.get('/api/training/enrollments' + (params ? '?' + new URLSearchParams(params) : '')); },
  enrollEmployee(data) { return this.post('/api/training/enroll', data); },
  bulkEnroll(data) { return this.post('/api/training/enroll/bulk', data); },
  completeLesson(enrollmentId, data) { return this.post(`/api/training/enrollments/${enrollmentId}/complete-lesson`, data); },
  certifications(params) { return this.get('/api/training/certifications' + (params ? '?' + new URLSearchParams(params) : '')); },
  trainingDashboard() { return this.get('/api/training/dashboard'); },

  // Catering & Events
  cateringEvents(params) { return this.get('/api/catering/events' + (params ? '?' + new URLSearchParams(params) : '')); },
  cateringEvent(id) { return this.get(`/api/catering/events/${id}`); },
  createCateringEvent(data) { return this.post('/api/catering/events', data); },
  updateCateringEvent(id, data) { return this.put(`/api/catering/events/${id}`, data); },
  addCateringItems(eventId, items) { return this.post(`/api/catering/events/${eventId}/items`, { items }); },
  assignCateringStaff(eventId, assignments) { return this.post(`/api/catering/events/${eventId}/staff`, { assignments }); },
  cateringPackages() { return this.get('/api/catering/packages'); },
  createCateringPackage(data) { return this.post('/api/catering/packages', data); },
  cateringDashboard() { return this.get('/api/catering/dashboard'); },
  cateringCalendar(month, year) { return this.get(`/api/catering/calendar?month=${month}&year=${year}`); },

  // Marketing
  marketingCampaigns(params) { return this.get('/api/marketing/campaigns' + (params ? '?' + new URLSearchParams(params) : '')); },
  marketingCampaign(id) { return this.get(`/api/marketing/campaigns/${id}`); },
  createCampaign(data) { return this.post('/api/marketing/campaigns', data); },
  updateCampaign(id, data) { return this.put(`/api/marketing/campaigns/${id}`, data); },
  sendCampaign(id) { return this.post(`/api/marketing/campaigns/${id}/send`); },
  promotions(params) { return this.get('/api/marketing/promotions' + (params ? '?' + new URLSearchParams(params) : '')); },
  createPromotion(data) { return this.post('/api/marketing/promotions', data); },
  validatePromo(data) { return this.post('/api/marketing/promotions/validate', data); },
  applyPromo(id, data) { return this.post(`/api/marketing/promotions/${id}/apply`, data); },
  emailLists() { return this.get('/api/marketing/email-lists'); },
  createEmailList(data) { return this.post('/api/marketing/email-lists', data); },
  subscribeToList(listId, data) { return this.post(`/api/marketing/email-lists/${listId}/subscribe`, data); },
  autoPopulateList(listId, segment) { return this.post(`/api/marketing/email-lists/${listId}/auto-populate`, { segment }); },
  marketingDashboard() { return this.get('/api/marketing/dashboard'); },

  // Drink Deduction
  ddStockCards() { return this.get('/api/drink-deduction/stock-cards'); },
  ddIngredientDetail(id) { return this.get(`/api/drink-deduction/ingredient/${id}`); },
  ddRecipes() { return this.get('/api/drink-deduction/recipes'); },
  ddEndOfNight(date) { return this.get(`/api/drink-deduction/end-of-night${date ? '?date=' + date : ''}`); },
  ddManualDeduct(data) { return this.post('/api/drink-deduction/manual', data); },
  ddProcessCloverOrder(data) { return this.post('/api/drink-deduction/process-clover-order', data); },

  // Forecasting & Intelligence
  salesForecast(days) { return this.get(`/api/forecasting/sales?days_ahead=${days || 7}`); },
  forecastAccuracy() { return this.get('/api/forecasting/sales/accuracy'); },
  laborForecast(date) { return this.get(`/api/forecasting/labor${date ? '?date=' + date : ''}`); },
  detectAnomalies() { return this.post('/api/forecasting/detect-anomalies'); },
  anomalies(params) { return this.get('/api/forecasting/anomalies' + (params ? '?' + new URLSearchParams(params) : '')); },
  acknowledgeAnomaly(id, by) { return this.patch(`/api/forecasting/anomalies/${id}/acknowledge`, { acknowledged_by: by }); },
  forecastingDashboard() { return this.get('/api/forecasting/dashboard'); },
};
