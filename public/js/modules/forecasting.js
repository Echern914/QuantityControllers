/* ============================================================
   VENUECORE - Forecasting & Intelligence Module
   ============================================================ */
const ForecastingModule = {
  tab: 'dashboard',

  async render(container) {
    container.innerHTML = `
      <div class="animate-fade">
        <div class="module-tabs" id="fc-tabs">
          <button class="tab-btn active" data-tab="dashboard">Dashboard</button>
          <button class="tab-btn" data-tab="sales">Sales Forecast</button>
          <button class="tab-btn" data-tab="labor">Labor Forecast</button>
          <button class="tab-btn" data-tab="anomalies">Anomalies</button>
        </div>
        <div id="fc-content"></div>
      </div>`;
    container.querySelector('#fc-tabs').addEventListener('click', e => {
      if (e.target.classList.contains('tab-btn')) {
        container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.tab = e.target.dataset.tab;
        this.loadTab(container.querySelector('#fc-content'));
      }
    });
    this.loadTab(container.querySelector('#fc-content'));
  },

  async loadTab(el) {
    UI.loading(el);
    try {
      switch (this.tab) {
        case 'dashboard': return await this.renderDashboard(el);
        case 'sales': return await this.renderSales(el);
        case 'labor': return await this.renderLabor(el);
        case 'anomalies': return await this.renderAnomalies(el);
      }
    } catch (err) { el.innerHTML = `<div class="empty-state"><p>${Utils.escapeHtml(err.message)}</p></div>`; }
  },

  async renderDashboard(el) {
    const [d, anomalyResult] = await Promise.all([
      API.forecastingDashboard().catch(() => ({})),
      API.detectAnomalies().catch(() => ({ anomalies: [] })),
    ]);

    el.innerHTML = `
      <div class="grid grid-4 gap-md mb-md">
        ${UI.statCard('Predicted Weekly', Utils.currency(d.predicted_weekly_sales || 0), '\u2197')}
        ${UI.statCard('Forecast Accuracy', (d.forecast_accuracy || 0) + '%', '\u2713')}
        ${UI.statCard('Active Anomalies', d.active_anomalies || 0, '\u26A0')}
        ${UI.statCard('Today\'s Anomalies', anomalyResult.anomalies_detected || 0, '!')}
      </div>
      ${anomalyResult.anomalies?.length > 0 ? `
        <div class="card mb-md">
          <div class="card-header" style="background:rgba(231,76,60,0.1)"><h3 style="color:var(--danger)">Anomalies Detected Today</h3></div>
          <div class="card-body">
            ${anomalyResult.anomalies.map(a => `
              <div class="flex items-center gap-md" style="padding:10px;border-bottom:1px solid var(--border-color)">
                <span class="badge badge-${a.severity === 'high' ? 'danger' : 'warning'}">${a.severity}</span>
                <div style="flex:1">
                  <div class="font-bold text-sm">${Utils.escapeHtml(a.description)}</div>
                  <div class="text-muted text-sm">Expected: ${a.expected_value} | Actual: ${a.actual_value} | Deviation: ${a.deviation_percent}%</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
      <div class="card">
        <div class="card-header"><h3>Next 7 Days Forecast</h3></div>
        <div class="card-body" style="padding:0">
          ${(d.next_7_days || []).length === 0 ? '<p class="text-muted text-sm" style="padding:20px;text-align:center">No forecast data - need more historical sales data</p>' :
            UI.table([
              { label: 'Date', key: 'forecast_date' },
              { label: 'Day', key: r => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][r.day_of_week], render: v => v },
              { label: 'Predicted Sales', key: 'predicted_sales', render: v => Utils.currency(v), align: 'right' },
              { label: 'Orders', key: 'predicted_orders', align: 'right' },
              { label: 'Guests', key: 'predicted_guests', align: 'right' },
              { label: 'Confidence', key: 'confidence', render: v => `<span style="color:${v > 0.8 ? 'var(--success)' : v > 0.6 ? 'var(--warning)' : 'var(--danger)'}">${(v * 100).toFixed(0)}%</span>`, align: 'right' },
            ], d.next_7_days)}
        </div>
      </div>`;
  },

  async renderSales(el) {
    const forecast = await API.salesForecast(14);
    const accuracy = await API.forecastAccuracy().catch(() => ({ forecasts: [], accuracy_percent: 0 }));

    el.innerHTML = `
      <div class="grid grid-2 gap-md mb-md">
        <div class="card">
          <div class="card-header flex items-center justify-between">
            <h3>14-Day Sales Forecast</h3>
            <span class="text-sm text-muted">Trend: ${forecast.trend_multiplier > 1 ? '\u2197 Up' : forecast.trend_multiplier < 1 ? '\u2198 Down' : '\u2192 Flat'} (${((forecast.trend_multiplier - 1) * 100).toFixed(1)}%)</span>
          </div>
          <div class="card-body" style="padding:0;max-height:500px;overflow-y:auto">
            ${UI.table([
              { label: 'Date', key: 'date' }, { label: 'Day', key: 'day_name' },
              { label: 'Sales', key: 'predicted_sales', render: v => Utils.currency(v), align: 'right' },
              { label: 'Orders', key: 'predicted_orders', align: 'right' },
              { label: 'Avg Check', key: 'avg_check', render: v => Utils.currency(v), align: 'right' },
              { label: 'Confidence', key: 'confidence', render: v => (v * 100).toFixed(0) + '%', align: 'right' },
            ], forecast.forecasts || [])}
          </div>
        </div>
        <div class="card">
          <div class="card-header flex items-center justify-between">
            <h3>Forecast Accuracy</h3>
            <span class="badge badge-${accuracy.accuracy_percent > 80 ? 'success' : accuracy.accuracy_percent > 60 ? 'warning' : 'danger'}">${accuracy.accuracy_percent}%</span>
          </div>
          <div class="card-body" style="padding:0;max-height:500px;overflow-y:auto">
            ${(accuracy.forecasts || []).length === 0 ? '<p class="text-muted text-sm" style="padding:20px;text-align:center">Need historical forecasts to measure accuracy</p>' :
              UI.table([
                { label: 'Date', key: 'forecast_date' },
                { label: 'Predicted', key: 'predicted_sales', render: v => Utils.currency(v), align: 'right' },
                { label: 'Actual', key: 'actual_sales', render: v => Utils.currency(v), align: 'right' },
                { label: 'Error', key: 'error_percent', render: v => `<span style="color:${v < 15 ? 'var(--success)' : v < 30 ? 'var(--warning)' : 'var(--danger)'}">${v?.toFixed(1) || 0}%</span>`, align: 'right' },
              ], accuracy.forecasts)}
          </div>
        </div>
      </div>`;
  },

  async renderLabor(el) {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const forecast = await API.laborForecast(tomorrow);

    el.innerHTML = `
      <div class="card mb-md">
        <div class="card-header flex items-center justify-between">
          <h3>Labor Forecast: ${forecast.day_name} ${forecast.date}</h3>
          <span class="badge badge-info">Peak: ${forecast.peak_hour?.time_label || 'N/A'} (${forecast.peak_hour?.predicted_covers || 0} covers)</span>
        </div>
        <div class="card-body">
          <p class="mb-md text-sm text-muted">Max staff needed at peak: <strong>${forecast.max_staff_needed || 0}</strong></p>
          <div style="max-height:500px;overflow-y:auto">
            ${UI.table([
              { label: 'Time', key: 'time_label' },
              { label: 'Covers', key: 'predicted_covers', align: 'right' },
              { label: 'Est. Sales', key: 'predicted_sales', render: v => Utils.currency(v), align: 'right' },
              { label: 'FOH Needed', key: 'recommended_foh', align: 'right' },
              { label: 'BOH Needed', key: 'recommended_boh', align: 'right' },
              { label: 'Total Staff', key: 'recommended_total', render: v => `<strong>${v}</strong>`, align: 'right' },
              { label: 'Historical', key: 'historical_staff', render: v => v || '-', align: 'right' },
            ], (forecast.hourly_recommendations || []).filter(r => r.predicted_covers > 0 || r.historical_staff > 0))}
          </div>
        </div>
      </div>`;
  },

  async renderAnomalies(el) {
    const anomalies = await API.anomalies({ days: 30 });
    el.innerHTML = `
      <div class="flex items-center justify-between mb-md">
        <h3>Anomalies (Last 30 Days)</h3>
        <button class="btn btn-primary btn-sm" onclick="API.detectAnomalies().then(r=>{ UI.toast('Scan Complete', r.anomalies_detected + ' anomalies found', r.anomalies_detected > 0 ? 'warning' : 'success'); ForecastingModule.loadTab(document.getElementById('fc-content')); })">Scan Now</button>
      </div>
      <div class="card"><div class="card-body" style="padding:0">
        ${anomalies.length === 0 ? '<p class="text-muted text-sm" style="padding:20px;text-align:center">No anomalies detected</p>' :
          UI.table([
            { label: 'Time', key: 'detected_at', render: v => v ? v.slice(0, 16).replace('T', ' ') : '' },
            { label: 'Type', key: 'anomaly_type' },
            { label: 'Severity', key: 'severity', render: v => `<span class="badge badge-${v === 'high' ? 'danger' : 'warning'}">${v}</span>` },
            { label: 'Description', key: 'description' },
            { label: 'Expected', key: 'expected_value', render: v => v?.toFixed ? v.toFixed(2) : v, align: 'right' },
            { label: 'Actual', key: 'actual_value', render: v => v?.toFixed ? v.toFixed(2) : v, align: 'right' },
            { label: '', key: r => r, render: (v) => !v.acknowledged ? `<button class="btn btn-sm btn-secondary" onclick="API.acknowledgeAnomaly(${v.id}).then(()=>{UI.toast('OK','Acknowledged','success');ForecastingModule.loadTab(document.getElementById('fc-content'))})">Ack</button>` : '<span class="text-muted text-sm">Ack\'d</span>' },
          ], anomalies)}
      </div></div>`;
  },

  destroy() {},
};
