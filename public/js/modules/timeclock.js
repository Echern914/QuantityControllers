const TimeClockModule = {
  refreshInterval: null,

  async render(container) {
    const current = await API.clockedIn();
    container.innerHTML = `<div class="animate-fade">
      <div class="grid grid-2 gap-lg mb-lg">
        <!-- Clock In/Out -->
        <div class="card">
          <div class="card-header"><h3>Clock In / Out</h3></div>
          <div class="card-body text-center">
            <div class="pin-display mb-md" style="justify-content:center">
              <div class="pin-dot" id="tc-dot-0"></div><div class="pin-dot" id="tc-dot-1"></div>
              <div class="pin-dot" id="tc-dot-2"></div><div class="pin-dot" id="tc-dot-3"></div>
            </div>
            <div class="pin-pad" style="max-width:220px;margin:0 auto">
              ${[1,2,3,4,5,6,7,8,9].map(n => `<button class="pin-btn" onclick="TimeClockModule.pinInput('${n}')" style="width:60px;height:60px;font-size:20px">${n}</button>`).join('')}
              <button class="pin-btn clear" onclick="TimeClockModule.pinClear()" style="width:60px;height:60px;font-size:12px">CLR</button>
              <button class="pin-btn" onclick="TimeClockModule.pinInput('0')" style="width:60px;height:60px;font-size:20px">0</button>
              <button class="pin-btn enter" onclick="TimeClockModule.clockAction()" style="width:60px;height:60px;font-size:12px">GO</button>
            </div>
            <div id="tc-error" class="text-danger text-sm mt-sm"></div>
            <div class="flex gap-sm justify-center mt-md">
              <button class="btn btn-success" onclick="TimeClockModule.clockAction('in')">Clock In</button>
              <button class="btn btn-danger" onclick="TimeClockModule.clockAction('out')">Clock Out</button>
            </div>
          </div>
        </div>

        <!-- Who's On -->
        <div class="card">
          <div class="card-header"><h3>Currently Clocked In (${current.length})</h3></div>
          <div class="card-body" style="max-height:400px;overflow-y:auto">
            ${current.length === 0 ? '<p class="text-muted text-center p-lg">No one clocked in</p>' :
              current.map(e => `
                <div class="flex items-center gap-md p-sm" style="border-bottom:1px solid var(--border-color)">
                  <div class="sidebar-avatar" style="background:${e.color || '#6366f1'};width:36px;height:36px;font-size:13px">${(e.first_name[0] + (e.last_name?.[0] || '')).toUpperCase()}</div>
                  <div class="flex-1">
                    <div class="font-medium">${Utils.escapeHtml(e.first_name)} ${Utils.escapeHtml(e.last_name)}</div>
                    <div class="text-sm text-muted">${e.role} | Since ${Utils.formatTime(e.clock_in)}</div>
                  </div>
                  <div class="text-right">
                    <div class="font-bold text-accent">${e.hours_so_far}h</div>
                  </div>
                </div>
              `).join('')}
          </div>
        </div>
      </div>

      <!-- Recent Timesheet -->
      <div class="card">
        <div class="card-header"><h3>Recent Time Entries</h3>
          <div class="flex gap-sm">
            <button class="btn btn-secondary btn-sm" onclick="TimeClockModule.showTips()">Tip Summary</button>
          </div>
        </div>
        <div class="card-body" id="timesheet-container"></div>
      </div>
    </div>`;

    this.loadTimesheet();
  },

  async loadTimesheet() {
    const entries = await API.timesheet({ start_date: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10) });
    document.getElementById('timesheet-container').innerHTML = UI.table([
      { label: 'Employee', key: r => r, render: (_, r) => `${r.first_name} ${r.last_name}` },
      { label: 'Role', key: 'role' },
      { label: 'Clock In', key: 'clock_in', render: v => Utils.formatDateTime(v) },
      { label: 'Clock Out', key: 'clock_out', render: v => v ? Utils.formatDateTime(v) : '<span class="badge badge-success">Active</span>' },
      { label: 'Hours', key: 'hours_worked', render: v => v ? `${v.toFixed(2)}h` : '-' },
      { label: 'Break', key: 'break_minutes', render: v => v ? `${v}m` : '-' },
      { label: 'Tips', key: 'tips', render: v => v ? Utils.currency(v) : '-' },
    ], entries, { emptyMessage: 'No time entries' });
  },

  _tcPin: '',
  pinInput(d) {
    if (this._tcPin.length >= 4) return;
    this._tcPin += d;
    for (let i = 0; i < 4; i++) document.getElementById(`tc-dot-${i}`).classList.toggle('filled', i < this._tcPin.length);
  },
  pinClear() {
    this._tcPin = '';
    for (let i = 0; i < 4; i++) document.getElementById(`tc-dot-${i}`).classList.remove('filled');
    document.getElementById('tc-error').textContent = '';
  },

  async clockAction(action) {
    const pin = this._tcPin;
    if (!pin || pin.length < 4) { document.getElementById('tc-error').textContent = 'Enter your 4-digit PIN'; return; }

    try {
      if (action === 'out') {
        const tips = await UI.prompt('Tips', 'Enter tip amount for this shift:', '0');
        const result = await API.clockOut(pin, parseFloat(tips || '0'));
        UI.toast('Clocked Out', `${result.hours_worked}h worked`, 'success');
      } else {
        const result = await API.clockIn(pin);
        UI.toast('Clocked In', result.employee, 'success');
      }
      this.pinClear();
      this.render(document.getElementById('main-body'));
    } catch (err) {
      document.getElementById('tc-error').textContent = err.message;
      this.pinClear();
    }
  },

  async showTips() {
    const tips = await API.tipSummary();
    const html = tips.length ? UI.table([
      { label: 'Employee', key: r => r, render: (_, r) => `${r.first_name} ${r.last_name}` },
      { label: 'Total Tips', key: 'total_tips', render: v => Utils.currency(v) },
      { label: 'Hours', key: 'total_hours', render: v => `${v?.toFixed(1) || 0}h` },
      { label: 'Tips/Hour', key: r => r, render: (_, r) => r.total_hours > 0 ? Utils.currency(r.total_tips / r.total_hours) : '-' },
      { label: 'Shifts', key: 'shift_count' },
    ], tips) : '<p class="text-muted text-center p-lg">No tip data</p>';
    await UI.modal('Tip Summary', html, { footer: false, size: 'lg' });
  },

  destroy() { if (this.refreshInterval) clearInterval(this.refreshInterval); }
};
