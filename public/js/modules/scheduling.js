const SchedulingModule = {
  weekStart: null,

  async render(container) {
    if (!this.weekStart) this.weekStart = Utils.getWeekStart();
    const data = await API.weekView(this.weekStart);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(this.weekStart);
      d.setDate(d.getDate() + i);
      days.push(d.toISOString().slice(0, 10));
    }

    container.innerHTML = `<div class="schedule-container animate-fade">
      <div class="schedule-header">
        <div class="schedule-nav">
          <button class="btn btn-ghost" onclick="SchedulingModule.changeWeek(-1)"><</button>
          <span class="font-bold">Week of ${Utils.formatDate(this.weekStart)}</span>
          <button class="btn btn-ghost" onclick="SchedulingModule.changeWeek(1)">></button>
          <button class="btn btn-ghost btn-sm" onclick="SchedulingModule.weekStart=Utils.getWeekStart(); SchedulingModule.render(document.getElementById('main-body'))">This Week</button>
        </div>
        <div class="flex gap-sm">
          <button class="btn btn-primary" onclick="SchedulingModule.addShift()">+ Add Shift</button>
          <button class="btn btn-success" onclick="SchedulingModule.publish()">Publish Week</button>
        </div>
      </div>
      <div class="schedule-grid" style="overflow:auto;flex:1">
        <div class="col-header">Employee</div>
        ${days.map(d => `<div class="col-header ${d === Utils.today() ? 'today' : ''}">${Utils.getDayOfWeek(d)}</div>`).join('')}
        ${data.map(emp => `
          <div class="row-label">
            <div class="sidebar-avatar" style="background:${emp.color || '#6366f1'};width:28px;height:28px;font-size:11px">${(emp.first_name[0] + (emp.last_name?.[0] || '')).toUpperCase()}</div>
            <div><div class="text-sm font-medium">${Utils.escapeHtml(emp.first_name)}</div><div class="text-muted" style="font-size:10px">${emp.role}</div></div>
          </div>
          ${days.map(d => {
            const shifts = emp.shifts.filter(s => s.shift_date === d);
            return `<div class="shift-cell">${shifts.map(s => `
              <div class="shift-block" style="background:${emp.color || '#6366f1'}22;border-color:${emp.color || '#6366f1'}" onclick="SchedulingModule.editShift(${s.id})">
                ${s.start_time} - ${s.end_time}
                ${s.station ? `<br><span style="font-size:9px;opacity:0.7">${s.station}</span>` : ''}
              </div>
            `).join('')}</div>`;
          }).join('')}
        `).join('')}
      </div>
    </div>`;
  },

  changeWeek(delta) {
    const d = new Date(this.weekStart);
    d.setDate(d.getDate() + delta * 7);
    this.weekStart = d.toISOString().slice(0, 10);
    this.render(document.getElementById('main-body'));
  },

  async addShift() {
    const staff = await API.staff();
    const html = `
      <div class="form-group"><label class="form-label">Employee</label><select class="form-select" id="sh-emp">${staff.map(e => `<option value="${e.id}">${e.first_name} ${e.last_name} (${e.role})</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">Date</label><input type="date" class="form-input" id="sh-date" value="${Utils.today()}"></div>
      <div class="form-row"><div class="form-group"><label class="form-label">Start</label><input type="time" class="form-input" id="sh-start" value="09:00"></div>
      <div class="form-group"><label class="form-label">End</label><input type="time" class="form-input" id="sh-end" value="17:00"></div></div>
      <div class="form-group"><label class="form-label">Station</label><select class="form-select" id="sh-station"><option value="">Any</option><option>bar</option><option>kitchen</option><option>floor</option><option>host</option></select></div>
    `;
    const modal = await UI.modal('Add Shift', html, { confirmText: 'Create' });
    if (!modal) return;
    try {
      await API.createShift({ employee_id: parseInt(modal.querySelector('#sh-emp').value), shift_date: modal.querySelector('#sh-date').value, start_time: modal.querySelector('#sh-start').value, end_time: modal.querySelector('#sh-end').value, station: modal.querySelector('#sh-station').value });
      UI.toast('Shift Added', '', 'success');
      this.render(document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async publish() {
    const endDate = new Date(this.weekStart);
    endDate.setDate(endDate.getDate() + 6);
    if (!(await UI.confirm('Publish Schedule', `Publish shifts for week of ${Utils.formatDate(this.weekStart)}?`))) return;
    try {
      await API.publishShifts(this.weekStart, endDate.toISOString().slice(0, 10));
      UI.toast('Published', 'Schedule published to team', 'success');
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  editShift(id) { UI.toast('Edit Shift', 'Double-click to edit', 'info'); },
  destroy() {}
};
