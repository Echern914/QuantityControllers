const ReportsModule = {
  async render(container) {
    container.innerHTML = `<div class="animate-fade">
      <h3 class="mb-md">Reports</h3>
      <div class="grid grid-3 gap-md mb-lg">
        <div class="card cursor-pointer" onclick="ReportsModule.runXReport()">
          <div class="card-body text-center p-lg">
            <div style="font-size:36px;margin-bottom:8px">X</div>
            <h3>X-Report</h3>
            <p class="text-muted text-sm">Mid-shift sales snapshot</p>
          </div>
        </div>
        <div class="card cursor-pointer" onclick="ReportsModule.runZReport()">
          <div class="card-body text-center p-lg">
            <div style="font-size:36px;margin-bottom:8px">Z</div>
            <h3>Z-Report</h3>
            <p class="text-muted text-sm">End-of-day final report</p>
          </div>
        </div>
        <div class="card cursor-pointer" onclick="ReportsModule.showPL()">
          <div class="card-body text-center p-lg">
            <div style="font-size:36px;margin-bottom:8px">P&amp;L</div>
            <h3>P&L Report</h3>
            <p class="text-muted text-sm">Profit & loss analysis</p>
          </div>
        </div>
      </div>
      <div id="report-output"></div>
    </div>`;
  },

  async runXReport() {
    const output = document.getElementById('report-output');
    UI.loading(output);
    const report = await API.xReport();
    output.innerHTML = `<div class="card animate-fade">
      <div class="card-header"><h3>X-Report - ${Utils.formatDate(report.date)} @ ${Utils.formatTime(report.generated_at)}</h3></div>
      <div class="card-body">
        <div class="grid grid-4 gap-md mb-md">
          ${UI.statCard('Gross Sales', Utils.currency(report.sales.gross_sales))}
          ${UI.statCard('Net Sales', Utils.currency(report.sales.net_sales))}
          ${UI.statCard('Orders', report.sales.order_count)}
          ${UI.statCard('Avg Check', Utils.currency(report.sales.avg_check))}
        </div>
        <div class="grid grid-2 gap-md">
          <div>
            <h4 class="mb-sm">Payment Breakdown</h4>
            ${report.payments.map(p => `<div class="flex justify-between p-sm" style="border-bottom:1px solid var(--border-color)"><span>${p.payment_method}</span><span class="font-bold">${Utils.currency(p.total)}</span></div>`).join('')}
          </div>
          <div>
            <h4 class="mb-sm">Summary</h4>
            <div class="flex justify-between p-sm"><span>Tax Collected</span><span>${Utils.currency(report.sales.tax_collected)}</span></div>
            <div class="flex justify-between p-sm"><span>Tips</span><span>${Utils.currency(report.sales.total_tips)}</span></div>
            <div class="flex justify-between p-sm"><span>Discounts</span><span>${Utils.currency(report.sales.total_discounts)}</span></div>
            <div class="flex justify-between p-sm"><span>Voids</span><span>${report.voids.count}</span></div>
            <div class="flex justify-between p-sm"><span>Open Orders</span><span>${report.open_orders.count} (${Utils.currency(report.open_orders.total)})</span></div>
          </div>
        </div>
        ${report.top_items.length ? `<h4 class="mt-md mb-sm">Top Items</h4>${UI.table([
          { label: 'Item', key: 'name' },
          { label: 'Qty', key: 'qty', align: 'right' },
          { label: 'Revenue', key: 'revenue', align: 'right', render: v => Utils.currency(v) },
        ], report.top_items)}` : ''}
      </div>
    </div>`;
  },

  async runZReport() {
    if (!(await UI.confirm('Generate Z-Report', 'This generates the end-of-day report. Continue?'))) return;
    const output = document.getElementById('report-output');
    UI.loading(output);
    const report = await API.zReport();
    output.innerHTML = `<div class="card animate-fade">
      <div class="card-header"><h3>Z-Report - ${Utils.formatDate(report.date)}</h3><span class="badge badge-success">FINAL</span></div>
      <div class="card-body">
        <div class="grid grid-4 gap-md mb-md">
          ${UI.statCard('Gross Sales', Utils.currency(report.gross_sales))}
          ${UI.statCard('Net Sales', Utils.currency(report.net_sales))}
          ${UI.statCard('Orders', report.order_count)}
          ${UI.statCard('Guests', report.guest_count)}
        </div>
        <div class="grid grid-3 gap-md mb-md">
          ${UI.statCard('Cash', Utils.currency(report.cash_total))}
          ${UI.statCard('Card', Utils.currency(report.card_total))}
          ${UI.statCard('Tips', Utils.currency(report.total_tips))}
        </div>
        <div class="grid grid-3 gap-md">
          ${UI.statCard('Labor Cost', `${Utils.currency(report.labor_cost)} (${report.labor_percent}%)`)}
          ${UI.statCard('Waste', Utils.currency(report.waste.total))}
          ${UI.statCard('Voids', report.voids)}
        </div>
      </div>
    </div>`;
  },

  async showPL() {
    const output = document.getElementById('report-output');
    UI.loading(output);
    const pl = await API.plReport();
    output.innerHTML = `<div class="card animate-fade">
      <div class="card-header"><h3>Profit & Loss - ${Utils.formatDate(pl.period.start)} to ${Utils.formatDate(pl.period.end)}</h3></div>
      <div class="card-body">
        <div class="flex flex-col gap-sm" style="max-width:500px">
          <div class="flex justify-between p-sm font-bold" style="border-bottom:2px solid var(--border-color)"><span>Revenue</span><span class="text-success">${Utils.currency(pl.revenue)}</span></div>
          <div class="flex justify-between p-sm"><span>Cost of Goods Sold</span><span class="text-danger">-${Utils.currency(pl.cost_of_goods)}</span></div>
          <div class="flex justify-between p-sm font-bold" style="border-bottom:1px solid var(--border-color)"><span>Gross Profit</span><span>${Utils.currency(pl.gross_profit)} (${pl.gross_margin}%)</span></div>
          <div class="flex justify-between p-sm"><span>Labor Cost</span><span class="text-danger">-${Utils.currency(pl.labor_cost)}</span></div>
          <div class="flex justify-between p-sm"><span>Waste Cost</span><span class="text-danger">-${Utils.currency(pl.waste_cost)}</span></div>
          <div class="flex justify-between p-sm font-bold text-lg" style="border-top:2px solid var(--border-color);padding-top:12px">
            <span>Net Profit</span>
            <span class="${pl.net_profit >= 0 ? 'text-success' : 'text-danger'}">${Utils.currency(pl.net_profit)} (${pl.net_margin}%)</span>
          </div>
        </div>
      </div>
    </div>`;
  },

  destroy() {}
};
