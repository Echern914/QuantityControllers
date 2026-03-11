const SchedulingModule = {
  weekStart: null,
  _staff: [],

  async render(container) {
    if (!this.weekStart) this.weekStart = Utils.getWeekStart();
    const [data, staff] = await Promise.all([API.weekView(this.weekStart), API.staff()]);
    this._staff = staff;

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(this.weekStart);
      d.setDate(d.getDate() + i);
      days.push(d.toISOString().slice(0, 10));
    }

    // Calculate weekly stats
    let totalShifts = 0, totalHours = 0;
    data.forEach(emp => {
      emp.shifts.forEach(s => {
        totalShifts++;
        const start = s.start_time.split(':');
        const end = s.end_time.split(':');
        totalHours += (parseInt(end[0]) + parseInt(end[1]) / 60) - (parseInt(start[0]) + parseInt(start[1]) / 60);
      });
    });

    container.innerHTML = `<div class="schedule-container animate-fade">
      <div class="grid grid-4 gap-md mb-md">
        ${UI.statCard('Total Shifts', totalShifts, '')}
        ${UI.statCard('Scheduled Hours', totalHours.toFixed(1), '')}
        ${UI.statCard('Staff Scheduled', data.filter(e => e.shifts.length > 0).length + '/' + data.length, '')}
        ${UI.statCard('Est. Labor Cost', Utils.currency(data.reduce((sum, emp) => sum + emp.shifts.length * (emp.hourly_rate || 15) * 8, 0)), '')}
      </div>
      <div class="schedule-header">
        <div class="schedule-nav">
          <button class="btn btn-ghost" onclick="SchedulingModule.changeWeek(-1)"><</button>
          <span class="font-bold">Week of ${Utils.formatDate(this.weekStart)}</span>
          <button class="btn btn-ghost" onclick="SchedulingModule.changeWeek(1)">></button>
          <button class="btn btn-ghost btn-sm" onclick="SchedulingModule.weekStart=Utils.getWeekStart(); SchedulingModule.render(document.getElementById('main-body'))">This Week</button>
        </div>
        <div class="flex gap-sm">
          <button class="btn btn-primary" onclick="SchedulingModule.addShift()">+ Add Shift</button>
          <button class="btn btn-secondary" onclick="SchedulingModule.copyWeek()">Copy Week</button>
          <button class="btn btn-success" onclick="SchedulingModule.publish()">Publish Week</button>
        </div>
      </div>
      <div class="schedule-grid" style="overflow:auto;flex:1">
        <div class="col-header">Employee</div>
        ${days.map(d => `<div class="col-header ${d === Utils.today() ? 'today' : ''}">${Utils.getDayOfWeek(d)}<br><span style="font-size:10px;opacity:0.7">${d.slice(5)}</span></div>`).join('')}
        ${data.map(emp => `
          <div class="row-label">
            <div class="sidebar-avatar" style="background:${emp.color || '#6366f1'};width:28px;height:28px;font-size:11px">${(emp.first_name[0] + (emp.last_name?.[0] || '')).toUpperCase()}</div>
            <div><div class="text-sm font-medium">${Utils.escapeHtml(emp.first_name)}</div><div class="text-muted" style="font-size:10px">${emp.role}</div></div>
          </div>
          ${days.map(d => {
            const shifts = emp.shifts.filter(s => s.shift_date === d);
            return `<div class="shift-cell" ondblclick="SchedulingModule.quickAdd('${emp.id}','${d}')">${shifts.map(s => `
              <div class="shift-block" style="background:${emp.color || '#6366f1'}22;border-color:${emp.color || '#6366f1'};cursor:pointer" onclick="SchedulingModule.editShift(${s.id}, ${emp.id})">
                ${s.start_time.slice(0,5)} - ${s.end_time.slice(0,5)}
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

  _shiftFormHtml(shift, employeeId) {
    const stations = ['', 'bar', 'kitchen', 'floor', 'host', 'expo', 'patio'];
    return `
      <div class="form-group"><label class="form-label">Employee</label><select class="form-select" id="sh-emp">${this._staff.map(e => `<option value="${e.id}" ${(shift?.employee_id || employeeId) == e.id ? 'selected' : ''}>${e.first_name} ${e.last_name || ''} (${e.role})</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">Date</label><input type="date" class="form-input" id="sh-date" value="${shift?.shift_date || Utils.today()}"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Start</label><input type="time" class="form-input" id="sh-start" value="${shift?.start_time?.slice(0,5) || '09:00'}"></div>
        <div class="form-group"><label class="form-label">End</label><input type="time" class="form-input" id="sh-end" value="${shift?.end_time?.slice(0,5) || '17:00'}"></div>
      </div>
      <div class="form-group"><label class="form-label">Station</label><select class="form-select" id="sh-station">${stations.map(s => `<option value="${s}" ${shift?.station === s ? 'selected' : ''}>${s || 'Any'}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="sh-notes" rows="2">${shift?.notes || ''}</textarea></div>
    `;
  },

  _getShiftData(modal) {
    return {
      employee_id: parseInt(modal.querySelector('#sh-emp').value),
      shift_date: modal.querySelector('#sh-date').value,
      start_time: modal.querySelector('#sh-start').value,
      end_time: modal.querySelector('#sh-end').value,
      station: modal.querySelector('#sh-station').value,
      notes: modal.querySelector('#sh-notes').value,
    };
  },

  async addShift() {
    const modal = await UI.modal('Add Shift', this._shiftFormHtml(null), { confirmText: 'Create' });
    if (!modal) return;
    try {
      await API.createShift(this._getShiftData(modal));
      UI.toast('Shift Added', '', 'success');
      this.render(document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async quickAdd(employeeId, date) {
    const shift = { employee_id: employeeId, shift_date: date };
    const modal = await UI.modal('Quick Add Shift', this._shiftFormHtml(shift, employeeId), { confirmText: 'Create' });
    if (!modal) return;
    try {
      await API.createShift(this._getShiftData(modal));
      UI.toast('Shift Added', '', 'success');
      this.render(document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async editShift(shiftId, employeeId) {
    // Find the shift from the current data
    const allShifts = await API.shifts({
      start_date: this.weekStart,
      end_date: new Date(new Date(this.weekStart).getTime() + 6 * 86400000).toISOString().slice(0, 10)
    });
    const shift = allShifts.find(s => s.id === shiftId) || { id: shiftId, employee_id: employeeId };

    const html = this._shiftFormHtml(shift, employeeId) +
      `<div style="border-top:1px solid var(--border);margin-top:16px;padding-top:12px">
        <button class="btn btn-danger btn-sm" id="sh-delete">Delete This Shift</button>
      </div>`;

    const modal = await UI.modal('Edit Shift', html, { confirmText: 'Save Changes' });
    if (!modal) return;

    // Wire up delete button before modal resolves
    // The modal already resolved at this point, so handle the save
    try {
      await API.updateShift(shiftId, this._getShiftData(modal));
      UI.toast('Shift Updated', '', 'success');
      this.render(document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async deleteShift(shiftId) {
    if (!(await UI.confirm('Delete Shift', 'Remove this shift from the schedule?'))) return;
    try {
      await API.deleteShift(shiftId);
      UI.toast('Shift Deleted', '', 'warning');
      this.render(document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async copyWeek() {
    const nextWeek = new Date(this.weekStart);
    nextWeek.setDate(nextWeek.getDate() + 7);
    if (!(await UI.confirm('Copy Week', `Copy all shifts from this week to week of ${Utils.formatDate(nextWeek.toISOString().slice(0, 10))}?`))) return;
    try {
      const allShifts = await API.shifts({
        start_date: this.weekStart,
        end_date: new Date(new Date(this.weekStart).getTime() + 6 * 86400000).toISOString().slice(0, 10)
      });
      for (const s of allShifts) {
        const newDate = new Date(s.shift_date);
        newDate.setDate(newDate.getDate() + 7);
        await API.createShift({
          employee_id: s.employee_id,
          shift_date: newDate.toISOString().slice(0, 10),
          start_time: s.start_time,
          end_time: s.end_time,
          station: s.station,
          notes: s.notes
        });
      }
      UI.toast('Week Copied', `${allShifts.length} shifts copied to next week`, 'success');
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

  destroy() {}
};
