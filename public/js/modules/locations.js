/* ============================================================
   VENUECORE - Multi-Location Management Module
   ============================================================ */
const LocationsModule = {
  async render(container) {
    const [locations, staffList] = await Promise.all([API.locations(), API.staff().catch(() => [])]);

    container.innerHTML = `
      <div class="animate-fade">
        <div class="flex items-center justify-between mb-md">
          <h3>${locations.length} Location${locations.length !== 1 ? 's' : ''}</h3>
          <button class="btn btn-primary" onclick="LocationsModule.showAdd()">+ Add Location</button>
        </div>
        <div class="grid grid-${Math.min(locations.length, 3) || 1} gap-md mb-md">
          ${locations.map(loc => `
            <div class="card">
              <div class="card-header flex items-center justify-between">
                <div>
                  <h3>${Utils.escapeHtml(loc.name)}</h3>
                  <span class="badge badge-${loc.status === 'active' ? 'success' : 'secondary'}">${loc.code} - ${loc.status}</span>
                </div>
                ${loc.is_primary ? '<span class="badge badge-info">Primary</span>' : ''}
              </div>
              <div class="card-body">
                ${loc.address ? `<p class="text-sm text-muted mb-sm">${Utils.escapeHtml(loc.address)}${loc.city ? ', ' + Utils.escapeHtml(loc.city) : ''}${loc.state ? ', ' + Utils.escapeHtml(loc.state) : ''} ${Utils.escapeHtml(loc.zip || '')}</p>` : ''}
                <div class="grid grid-2 gap-sm mb-sm">
                  <div class="text-sm"><strong>Manager:</strong> ${Utils.escapeHtml(loc.manager_name || 'Unassigned')}</div>
                  <div class="text-sm"><strong>Staff:</strong> ${loc.staff_count || 0}</div>
                  <div class="text-sm"><strong>Tax Rate:</strong> ${((loc.tax_rate || 0) * 100).toFixed(1)}%</div>
                  <div class="text-sm"><strong>Timezone:</strong> ${Utils.escapeHtml(loc.timezone || '')}</div>
                </div>
                ${loc.phone ? `<div class="text-sm text-muted">${Utils.escapeHtml(loc.phone)}</div>` : ''}
              </div>
            </div>
          `).join('')}
          ${locations.length === 0 ? '<div class="empty-state"><h3>No locations</h3><p>Add your first location to get started with multi-location management.</p></div>' : ''}
        </div>
      </div>`;
  },

  async showAdd() {
    const staff = await API.staff().catch(() => []);
    const managerOpts = '<option value="">Select Manager</option>' + staff.filter(s => ['admin', 'manager'].includes(s.role)).map(s => `<option value="${s.id}">${Utils.escapeHtml(s.first_name)} ${Utils.escapeHtml(s.last_name)}</option>`).join('');
    const html = `
      <div class="grid grid-2 gap-sm">
        <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="loc-name" placeholder="Location name"></div>
        <div class="form-group"><label class="form-label">Code</label><input class="form-input" id="loc-code" placeholder="AUTO" maxlength="6"></div>
        <div class="form-group"><label class="form-label">Address</label><input class="form-input" id="loc-addr"></div>
        <div class="form-group"><label class="form-label">City</label><input class="form-input" id="loc-city"></div>
        <div class="form-group"><label class="form-label">State</label><input class="form-input" id="loc-state" maxlength="2"></div>
        <div class="form-group"><label class="form-label">ZIP</label><input class="form-input" id="loc-zip"></div>
        <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="loc-phone"></div>
        <div class="form-group"><label class="form-label">Manager</label><select class="form-input" id="loc-mgr">${managerOpts}</select></div>
      </div>`;
    const modal = await UI.modal('Add Location', html, { confirmText: 'Create Location', size: 'lg' });
    if (!modal) return;
    try {
      await API.createLocation({
        name: modal.querySelector('#loc-name').value, code: modal.querySelector('#loc-code').value || undefined,
        address: modal.querySelector('#loc-addr').value, city: modal.querySelector('#loc-city').value,
        state: modal.querySelector('#loc-state').value, zip: modal.querySelector('#loc-zip').value,
        phone: modal.querySelector('#loc-phone').value, manager_id: modal.querySelector('#loc-mgr').value || undefined,
      });
      UI.toast('Success', 'Location created', 'success');
      App.navigate('locations');
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  destroy() {},
};
