const StaffModule = {
  async render(container) {
    const staff = await API.staff();
    const roleColors = { admin: '#ef4444', manager: '#f59e0b', server: '#6366f1', bartender: '#06b6d4', cook: '#10b981', host: '#8b5cf6' };
    container.innerHTML = `<div class="animate-fade">
      <div class="flex justify-between items-center mb-md">
        <h3>${staff.length} Team Members</h3>
        <button class="btn btn-primary" onclick="StaffModule.addEmployee()">+ Add Employee</button>
      </div>
      <div class="grid grid-3 gap-md">
        ${staff.map(e => `
          <div class="card" style="border-top:3px solid ${e.color || roleColors[e.role] || '#6366f1'}">
            <div class="card-body">
              <div class="flex items-center gap-md mb-sm">
                <div class="sidebar-avatar" style="background:${e.color || roleColors[e.role] || '#6366f1'};width:48px;height:48px;font-size:18px">${(e.first_name[0] + (e.last_name?.[0] || '')).toUpperCase()}</div>
                <div>
                  <div class="font-bold">${Utils.escapeHtml(e.first_name)} ${Utils.escapeHtml(e.last_name)}</div>
                  <span class="badge badge-primary">${e.role}</span>
                </div>
              </div>
              <div class="text-sm text-secondary mb-xs">${e.email || ''}</div>
              <div class="text-sm text-secondary mb-sm">${e.phone || ''}</div>
              <div class="flex justify-between text-sm">
                <span class="text-muted">Rate: ${Utils.currency(e.hourly_rate)}/hr</span>
                <button class="btn btn-ghost btn-sm" onclick="StaffModule.editEmployee(${e.id})">Edit</button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>`;
  },

  async addEmployee() {
    const html = `
      <div class="form-row"><div class="form-group"><label class="form-label">First Name</label><input class="form-input" id="e-first"></div>
      <div class="form-group"><label class="form-label">Last Name</label><input class="form-input" id="e-last"></div></div>
      <div class="form-row"><div class="form-group"><label class="form-label">PIN (4 digits)</label><input type="password" class="form-input" id="e-pin" maxlength="4"></div>
      <div class="form-group"><label class="form-label">Role</label><select class="form-select" id="e-role"><option>server</option><option>bartender</option><option>cook</option><option>host</option><option>manager</option><option>admin</option></select></div></div>
      <div class="form-row"><div class="form-group"><label class="form-label">Email</label><input class="form-input" id="e-email"></div>
      <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="e-phone"></div></div>
      <div class="form-row"><div class="form-group"><label class="form-label">Hourly Rate</label><input type="number" class="form-input" id="e-rate" step="0.01"></div>
      <div class="form-group"><label class="form-label">Color</label><input type="color" class="form-input" id="e-color" value="#6366f1" style="height:38px"></div></div>
    `;
    const modal = await UI.modal('Add Employee', html, { confirmText: 'Create' });
    if (!modal) return;
    try {
      await API.createStaff({ first_name: modal.querySelector('#e-first').value, last_name: modal.querySelector('#e-last').value, pin: modal.querySelector('#e-pin').value, role: modal.querySelector('#e-role').value, email: modal.querySelector('#e-email').value, phone: modal.querySelector('#e-phone').value, hourly_rate: parseFloat(modal.querySelector('#e-rate').value) || 0, color: modal.querySelector('#e-color').value });
      UI.toast('Employee Added', '', 'success');
      this.render(document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  editEmployee(id) { UI.toast('Edit', 'Edit functionality', 'info'); },
  destroy() {}
};
