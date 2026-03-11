/* ============================================================
   NEXUS POS - API Client
   ============================================================ */
const API = {
  token: localStorage.getItem('nexus_token'),
  baseUrl: '',

  setToken(token) {
    this.token = token;
    if (token) localStorage.setItem('nexus_token', token);
    else localStorage.removeItem('nexus_token');
  },

  async request(method, path, body) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (this.token) opts.headers['Authorization'] = `Bearer ${this.token}`;
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(`${this.baseUrl}${path}`, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
    return data;
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

  // Suppliers
  suppliers() { return this.get('/api/suppliers'); },
  createSupplier(data) { return this.post('/api/suppliers', data); },
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
};
