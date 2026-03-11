/* ============================================================
   NEXUS POS - Dashboard Module
   ============================================================ */
const Dashboard = {
  refreshInterval: null,

  async render(container) {
    const [realtime, alerts] = await Promise.all([
      API.realtimeStats(),
      API.notifications({ unread_only: 'true', limit: 5 }),
    ]);

    container.innerHTML = `
      <div class="animate-fade">
        <!-- Stats Grid -->
        <div class="grid grid-4 gap-md mb-md">
          ${UI.statCard('Today\'s Sales', Utils.currency(realtime.today_sales), '$')}
          ${UI.statCard('Orders', realtime.today_orders, '#')}
          ${UI.statCard('Avg Check', Utils.currency(realtime.avg_check), '\u00F8')}
          ${UI.statCard('Tips', Utils.currency(realtime.today_tips), '+')}
        </div>

        <div class="grid grid-4 gap-md mb-md">
          ${UI.statCard('Open Orders', realtime.open_orders, '\u25A3')}
          ${UI.statCard('Tables', `${realtime.tables_occupied}/${realtime.tables_total}`, '\u25A6')}
          ${UI.statCard('Staff On', realtime.staff_clocked_in, '\u2605')}
          ${UI.statCard('Kitchen Queue', realtime.kitchen_queue, '\u2615')}
        </div>

        <div class="grid grid-2 gap-md mb-md">
          <!-- Sales Chart -->
          <div class="card">
            <div class="card-header">
              <h3>Today's Sales by Hour</h3>
            </div>
            <div class="card-body">
              <canvas id="hourly-chart" width="500" height="200"></canvas>
            </div>
          </div>

          <!-- Alerts -->
          <div class="card">
            <div class="card-header">
              <h3>Active Alerts</h3>
              <span class="badge badge-danger">${alerts.length}</span>
            </div>
            <div class="card-body" style="max-height:240px; overflow-y:auto">
              ${alerts.length === 0 ? '<p class="text-muted text-center p-md">No active alerts</p>' :
                alerts.map(a => `
                  <div class="flex items-center gap-sm p-sm" style="border-bottom:1px solid var(--border-color)">
                    <span>${a.severity === 'critical' ? '\u2716' : a.severity === 'high' ? '\u26A0' : '\u25CF'}</span>
                    <div class="flex-1">
                      <div class="font-medium text-sm">${Utils.escapeHtml(a.title)}</div>
                      <div class="text-muted text-sm">${Utils.timeAgo(a.created_at)}</div>
                    </div>
                  </div>
                `).join('')}
            </div>
          </div>
        </div>

        <div class="grid grid-2 gap-md">
          <!-- Quick Actions -->
          <div class="card">
            <div class="card-header"><h3>Quick Actions</h3></div>
            <div class="card-body">
              <div class="grid grid-2 gap-sm">
                <button class="btn btn-primary btn-lg btn-block" onclick="App.navigate('pos')">New Order</button>
                <button class="btn btn-secondary btn-lg btn-block" onclick="App.navigate('floor')">Floor Plan</button>
                <button class="btn btn-secondary btn-lg btn-block" onclick="App.navigate('kitchen')">Kitchen</button>
                <button class="btn btn-secondary btn-lg btn-block" onclick="App.navigate('reservations')">Reservations</button>
                <button class="btn btn-secondary btn-lg btn-block" onclick="App.navigate('inventory')">Inventory</button>
                <button class="btn btn-secondary btn-lg btn-block" onclick="App.navigate('ai')">AI Assistant</button>
              </div>
            </div>
          </div>

          <!-- Live Status -->
          <div class="card">
            <div class="card-header"><h3>Live Status</h3></div>
            <div class="card-body">
              <div class="flex flex-col gap-sm">
                <div class="flex justify-between p-sm">
                  <span class="text-secondary">Guests Today</span>
                  <span class="font-bold">${realtime.today_guests}</span>
                </div>
                <div class="flex justify-between p-sm">
                  <span class="text-secondary">Pending Reservations</span>
                  <span class="font-bold">${realtime.pending_reservations}</span>
                </div>
                <div class="flex justify-between p-sm">
                  <span class="text-secondary">Active Alerts</span>
                  <span class="font-bold text-warning">${realtime.active_alerts}</span>
                </div>
                <div class="flex justify-between p-sm">
                  <span class="text-secondary">Kitchen Queue</span>
                  <span class="font-bold">${realtime.kitchen_queue} items</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Load hourly chart
    try {
      const hourly = await API.hourlyAnalytics();
      const labels = hourly.filter(h => h.hour >= 8 && h.hour <= 23).map(h => `${h.hour > 12 ? h.hour - 12 : h.hour}${h.hour >= 12 ? 'p' : 'a'}`);
      const data = hourly.filter(h => h.hour >= 8 && h.hour <= 23).map(h => h.sales || 0);
      UI.barChart('hourly-chart', labels, data);
    } catch {}

    // Auto-refresh every 30 seconds
    this.refreshInterval = setInterval(() => this.render(container), 30000);
  },

  destroy() {
    if (this.refreshInterval) clearInterval(this.refreshInterval);
  }
};
