const AnalyticsModule = {
  async render(container) {
    const [realtime, sales, mix] = await Promise.all([
      API.realtimeStats(),
      API.salesAnalytics({ start_date: Utils.today(), end_date: Utils.today() }),
      API.productMix(7),
    ]);

    container.innerHTML = `<div class="animate-fade">
      <div class="grid grid-4 gap-md mb-md">
        ${UI.statCard("Today's Revenue", Utils.currency(realtime.today_sales), '$')}
        ${UI.statCard('Orders', realtime.today_orders, '#')}
        ${UI.statCard('Avg Check', Utils.currency(realtime.avg_check), '\u00F8')}
        ${UI.statCard('Guests', realtime.today_guests, '\u2637')}
      </div>

      <div class="tabs mb-md">
        <button class="tab active" onclick="AnalyticsModule.showTab('overview')">Overview</button>
        <button class="tab" onclick="AnalyticsModule.showTab('product-mix')">Product Mix</button>
        <button class="tab" onclick="AnalyticsModule.showTab('labor')">Labor</button>
        <button class="tab" onclick="AnalyticsModule.showTab('food-cost')">Food Cost</button>
        <button class="tab" onclick="AnalyticsModule.showTab('trends')">Trends</button>
      </div>

      <div id="analytics-content">
        <div class="grid grid-2 gap-md">
          <div class="card">
            <div class="card-header"><h3>Hourly Sales Today</h3></div>
            <div class="card-body"><canvas id="analytics-hourly" width="500" height="200"></canvas></div>
          </div>
          <div class="card">
            <div class="card-header"><h3>Top Sellers (7 days)</h3></div>
            <div class="card-body" style="max-height:280px;overflow-y:auto">
              ${mix.slice(0, 10).map((item, i) => `
                <div class="flex items-center gap-sm p-sm" style="border-bottom:1px solid var(--border-color)">
                  <span class="text-muted font-bold" style="width:20px">${i + 1}</span>
                  <div class="flex-1"><div class="font-medium text-sm">${Utils.escapeHtml(item.name)}</div><div class="text-muted" style="font-size:10px">${item.total_qty} sold</div></div>
                  <div class="text-right"><div class="font-bold text-sm">${Utils.currency(item.total_revenue)}</div><div class="text-muted" style="font-size:10px">${item.revenue_percent}%</div></div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>`;

    const hourly = await API.hourlyAnalytics();
    const labels = hourly.filter(h => h.hour >= 8 && h.hour <= 23).map(h => `${h.hour > 12 ? h.hour - 12 : h.hour}${h.hour >= 12 ? 'p' : 'a'}`);
    const data = hourly.filter(h => h.hour >= 8 && h.hour <= 23).map(h => h.sales || 0);
    UI.barChart('analytics-hourly', labels, data);
  },

  async showTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    event.target.classList.add('active');
    const content = document.getElementById('analytics-content');
    UI.loading(content);

    if (tab === 'product-mix') {
      const mix = await API.productMix(7);
      content.innerHTML = `<div class="card"><div class="card-body">${UI.table([
        { label: '#', key: (_, i) => i, render: (_, r, i) => `<strong>${mix.indexOf(r) + 1}</strong>` },
        { label: 'Item', key: 'name', render: (v, r) => `<div class="font-medium">${Utils.escapeHtml(v)}</div><div class="text-sm text-muted">${Utils.escapeHtml(r.category_name || '')}</div>` },
        { label: 'Qty Sold', key: 'total_qty', align: 'right' },
        { label: 'Revenue', key: 'total_revenue', align: 'right', render: v => `<strong>${Utils.currency(v)}</strong>` },
        { label: 'Rev %', key: 'revenue_percent', align: 'right', render: v => `${v}%` },
        { label: 'Avg Price', key: 'avg_price', align: 'right', render: v => Utils.currency(v) },
        { label: 'Orders', key: 'order_count', align: 'right' },
      ], mix, { emptyMessage: 'No sales data' })}</div></div>`;
    } else if (tab === 'labor') {
      const labor = await API.laborAnalytics(7);
      content.innerHTML = `
        <div class="grid grid-3 gap-md mb-md">
          ${UI.statCard('Total Labor Cost', Utils.currency(labor.total_labor_cost), '$')}
          ${UI.statCard('Labor %', Utils.percent(labor.labor_cost_percent), '%')}
          ${UI.statCard('Total Sales', Utils.currency(labor.total_sales), '\u2211')}
        </div>
        <div class="card"><div class="card-body">${UI.table([
          { label: 'Employee', key: r => r, render: (_, r) => `${r.first_name} ${r.last_name}` },
          { label: 'Role', key: 'role' },
          { label: 'Hours', key: 'total_hours', render: v => v ? `${v.toFixed(1)}h` : '0h' },
          { label: 'Labor Cost', key: 'labor_cost', render: v => Utils.currency(v || 0) },
          { label: 'Tips', key: 'total_tips', render: v => Utils.currency(v || 0) },
          { label: 'Shifts', key: 'shift_count' },
        ], labor.employees)}</div></div>`;
    } else if (tab === 'food-cost') {
      const fc = await API.foodCostAnalytics(7);
      content.innerHTML = `
        <div class="grid grid-3 gap-md mb-md">
          ${UI.statCard('Total Revenue', Utils.currency(fc.total_revenue), '$')}
          ${UI.statCard('Total Food Cost', Utils.currency(fc.total_food_cost), '\u25A4')}
          ${UI.statCard('Food Cost %', Utils.percent(fc.overall_food_cost_percent), `<span class="${fc.overall_food_cost_percent > 35 ? 'text-danger' : 'text-success'}">${fc.overall_food_cost_percent > 35 ? '\u26A0' : '\u2713'}</span>`)}
        </div>
        <div class="card"><div class="card-body">${UI.table([
          { label: 'Item', key: 'name' },
          { label: 'Price', key: 'price', render: v => Utils.currency(v) },
          { label: 'Cost', key: 'cost', render: v => Utils.currency(v) },
          { label: 'Food Cost %', key: 'food_cost_percent', render: v => `<span class="${v > 35 ? 'text-danger font-bold' : ''}">${v}%</span>` },
          { label: 'Qty Sold', key: 'qty_sold' },
          { label: 'Revenue', key: 'revenue', render: v => Utils.currency(v) },
          { label: 'Total Cost', key: 'total_cost', render: v => Utils.currency(v) },
        ], fc.items)}</div></div>`;
    } else if (tab === 'trends') {
      const trends = await API.trends(4);
      content.innerHTML = `<div class="card"><div class="card-body">${UI.table([
        { label: 'Week', key: 'week' },
        { label: 'Orders', key: 'orders' },
        { label: 'Sales', key: 'sales', render: v => Utils.currency(v) },
        { label: 'Avg Check', key: 'avg_check', render: v => Utils.currency(v) },
        { label: 'Guests', key: 'guests' },
      ], trends, { emptyMessage: 'No trend data' })}</div></div>`;
    } else {
      this.render(document.getElementById('main-body'));
    }
  },

  destroy() {}
};
