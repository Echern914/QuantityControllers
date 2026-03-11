const StaffModule = {
  _staff: [],
  _filter: '',

  async render(container) {
    this._staff = await API.staff();
    const roleColors = { admin: '#ef4444', manager: '#f59e0b', server: '#6366f1', bartender: '#06b6d4', cook: '#10b981', host: '#8b5cf6' };
    const roleCounts = {};
    this._staff.forEach(e => { roleCounts[e.role] = (roleCounts[e.role] || 0) + 1; });

    container.innerHTML = `<div class="animate-fade">
      <div class="grid grid-4 gap-md mb-md">
        ${UI.statCard('Total Staff', this._staff.length, '')}
        ${UI.statCard('Roles', Object.keys(roleCounts).length, '')}
        ${UI.statCard('Avg Rate', Utils.currency(this._staff.length ? this._staff.reduce((s, e) => s + (e.hourly_rate || 0), 0) / this._staff.length : 0) + '/hr', '')}
        ${UI.statCard('Active', this._staff.filter(e => e.active !== 0).length, '')}
      </div>
      <div class="flex justify-between items-center mb-md">
        <div class="flex items-center gap-md">
          <div class="search-box" style="width:260px"><input class="form-input" placeholder="Search staff..." id="staff-search" oninput="StaffModule.filterStaff(this.value)"></div>
          <div class="flex gap-xs">${Object.entries(roleCounts).map(([role, count]) =>
            `<button class="btn btn-ghost btn-sm" onclick="StaffModule.filterStaff('${role}')" style="border-left:3px solid ${roleColors[role] || '#6366f1'}">${role} (${count})</button>`
          ).join('')}</div>
        </div>
        <button class="btn btn-primary" onclick="StaffModule.addEmployee()">+ Add Employee</button>
      </div>
      <div class="grid grid-3 gap-md" id="staff-grid">
        ${this._renderCards(this._staff, roleColors)}
      </div>
    </div>`;
  },

  _renderCards(staff, roleColors) {
    if (!roleColors) roleColors = { admin: '#ef4444', manager: '#f59e0b', server: '#6366f1', bartender: '#06b6d4', cook: '#10b981', host: '#8b5cf6' };
    if (staff.length === 0) return '<div class="empty-state" style="grid-column:1/-1"><h3>No staff found</h3></div>';
    return staff.map(e => `
      <div class="card" style="border-top:3px solid ${e.color || roleColors[e.role] || '#6366f1'}">
        <div class="card-body">
          <div class="flex items-center gap-md mb-sm">
            <div class="sidebar-avatar" style="background:${e.color || roleColors[e.role] || '#6366f1'};width:48px;height:48px;font-size:18px">${(e.first_name[0] + (e.last_name?.[0] || '')).toUpperCase()}</div>
            <div style="flex:1">
              <div class="font-bold">${Utils.escapeHtml(e.first_name)} ${Utils.escapeHtml(e.last_name || '')}</div>
              <span class="badge badge-primary">${e.role}</span>
            </div>
          </div>
          ${e.email ? `<div class="text-sm text-secondary mb-xs">${Utils.escapeHtml(e.email)}</div>` : ''}
          ${e.phone ? `<div class="text-sm text-secondary mb-sm">${Utils.escapeHtml(e.phone)}</div>` : ''}
          <div class="flex justify-between items-center text-sm">
            <span class="text-muted">Rate: ${Utils.currency(e.hourly_rate || 0)}/hr</span>
            <div class="flex gap-xs">
              <button class="btn btn-ghost btn-sm" onclick="StaffModule.editEmployee(${e.id})">Edit</button>
              <button class="btn btn-ghost btn-sm text-danger" onclick="StaffModule.deactivateEmployee(${e.id}, '${Utils.escapeHtml(e.first_name)}')">Remove</button>
            </div>
          </div>
        </div>
      </div>
    `).join('');
  },

  filterStaff(term) {
    this._filter = term.toLowerCase();
    const filtered = this._staff.filter(e => {
      const searchable = `${e.first_name} ${e.last_name} ${e.role} ${e.email || ''} ${e.phone || ''}`.toLowerCase();
      return searchable.includes(this._filter);
    });
    const grid = document.getElementById('staff-grid');
    if (grid) grid.innerHTML = this._renderCards(filtered);
  },

  _employeeFormHtml(emp) {
    const roles = ['server', 'bartender', 'cook', 'host', 'manager', 'admin'];
    return `
      <div class="form-row">
        <div class="form-group"><label class="form-label">First Name *</label><input class="form-input" id="e-first" value="${Utils.escapeHtml(emp?.first_name || '')}" required></div>
        <div class="form-group"><label class="form-label">Last Name</label><input class="form-input" id="e-last" value="${Utils.escapeHtml(emp?.last_name || '')}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">${emp ? 'New PIN (leave blank to keep)' : 'PIN (4 digits) *'}</label><input type="password" class="form-input" id="e-pin" maxlength="4" placeholder="${emp ? '****' : ''}"></div>
        <div class="form-group"><label class="form-label">Role</label><select class="form-select" id="e-role">${roles.map(r => `<option value="${r}" ${emp?.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Email</label><input type="email" class="form-input" id="e-email" value="${Utils.escapeHtml(emp?.email || '')}"></div>
        <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="e-phone" value="${Utils.escapeHtml(emp?.phone || '')}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Hourly Rate ($)</label><input type="number" class="form-input" id="e-rate" step="0.01" value="${emp?.hourly_rate || ''}"></div>
        <div class="form-group"><label class="form-label">Color</label><input type="color" class="form-input" id="e-color" value="${emp?.color || '#6366f1'}" style="height:38px"></div>
      </div>
    `;
  },

  _getFormData(modal) {
    const data = {
      first_name: modal.querySelector('#e-first').value.trim(),
      last_name: modal.querySelector('#e-last').value.trim(),
      role: modal.querySelector('#e-role').value,
      email: modal.querySelector('#e-email').value.trim(),
      phone: modal.querySelector('#e-phone').value.trim(),
      hourly_rate: parseFloat(modal.querySelector('#e-rate').value) || 0,
      color: modal.querySelector('#e-color').value,
    };
    const pin = modal.querySelector('#e-pin').value;
    if (pin) data.pin = pin;
    return data;
  },

  async addEmployee() {
    const modal = await UI.modal('Add Employee', this._employeeFormHtml(null), { confirmText: 'Create' });
    if (!modal) return;
    const data = this._getFormData(modal);
    if (!data.first_name) { UI.toast('Error', 'First name is required', 'danger'); return; }
    if (!data.pin) { UI.toast('Error', 'PIN is required for new employees', 'danger'); return; }
    try {
      await API.createStaff(data);
      UI.toast('Employee Added', `${data.first_name} has been added`, 'success');
      this.render(document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async editEmployee(id) {
    const emp = this._staff.find(e => e.id === id);
    if (!emp) return;
    const modal = await UI.modal(`Edit - ${emp.first_name} ${emp.last_name || ''}`, this._employeeFormHtml(emp), { confirmText: 'Save Changes' });
    if (!modal) return;
    const data = this._getFormData(modal);
    if (!data.first_name) { UI.toast('Error', 'First name is required', 'danger'); return; }
    try {
      await API.updateStaff(id, data);
      UI.toast('Updated', `${data.first_name} has been updated`, 'success');
      this.render(document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async deactivateEmployee(id, name) {
    if (!(await UI.confirm('Remove Employee', `Deactivate ${name}? They will no longer appear in active staff lists.`))) return;
    try {
      await API.updateStaff(id, { active: 0 });
      UI.toast('Removed', `${name} has been deactivated`, 'warning');
      this.render(document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  destroy() {}
};
