/* ============================================================
   VENUECORE - Multi-Location Management Module
   ============================================================ */
const LocationsModule = {
  _locations: [],

  async render(container) {
    const [locations, staffList] = await Promise.all([API.locations(), API.staff().catch(() => [])]);
    this._locations = locations;
    this._staff = staffList;

    container.innerHTML = `
      <div class="animate-fade">
        <div class="grid grid-3 gap-md mb-md">
          ${UI.statCard('Locations', locations.length, '')}
          ${UI.statCard('Active', locations.filter(l => l.status === 'active').length, '')}
          ${UI.statCard('Total Staff', locations.reduce((s, l) => s + (l.staff_count || 0), 0), '')}
        </div>
        <div class="flex items-center justify-between mb-md">
          <h3>${locations.length} Location${locations.length !== 1 ? 's' : ''}</h3>
          <div class="flex gap-sm">
            <button class="btn btn-secondary" onclick="LocationsModule.compareSales()">Compare Sales</button>
            <button class="btn btn-primary" onclick="LocationsModule.showAdd()">+ Add Location</button>
          </div>
        </div>
        <div class="grid grid-${Math.min(locations.length, 3) || 1} gap-md mb-md">
          ${locations.map(loc => `
            <div class="card">
              <div class="card-header flex items-center justify-between">
                <div>
                  <h3>${Utils.escapeHtml(loc.name)}</h3>
                  <span class="badge badge-${loc.status === 'active' ? 'success' : 'secondary'}">${loc.code} - ${loc.status}</span>
                </div>
                <div class="flex gap-xs">
                  ${loc.is_primary ? '<span class="badge badge-info">Primary</span>' : ''}
                  <button class="btn btn-ghost btn-sm" onclick="LocationsModule.editLocation(${loc.id})">Edit</button>
                </div>
              </div>
              <div class="card-body">
                ${loc.address ? `<p class="text-sm text-muted mb-sm">${Utils.escapeHtml(loc.address)}${loc.city ? ', ' + Utils.escapeHtml(loc.city) : ''}${loc.state ? ', ' + Utils.escapeHtml(loc.state) : ''} ${Utils.escapeHtml(loc.zip || '')}</p>` : ''}
                <div class="grid grid-2 gap-sm mb-sm">
                  <div class="text-sm"><strong>Manager:</strong> ${Utils.escapeHtml(loc.manager_name || 'Unassigned')}</div>
                  <div class="text-sm"><strong>Staff:</strong> ${loc.staff_count || 0}</div>
                  <div class="text-sm"><strong>Tax Rate:</strong> ${((loc.tax_rate || 0) * 100).toFixed(1)}%</div>
                  <div class="text-sm"><strong>Timezone:</strong> ${Utils.escapeHtml(loc.timezone || 'Not set')}</div>
                </div>
                ${loc.phone ? `<div class="text-sm text-muted">${Utils.escapeHtml(loc.phone)}</div>` : ''}
              </div>
            </div>
          `).join('')}
          ${locations.length === 0 ? '<div class="empty-state" style="grid-column:1/-1"><h3>No locations</h3><p>Add your first location to get started with multi-location management.</p></div>' : ''}
        </div>
      </div>`;
  },

  _locationFormHtml(loc) {
    const managerOpts = '<option value="">Select Manager</option>' + (this._staff || []).filter(s => ['admin', 'manager'].includes(s.role)).map(s => `<option value="${s.id}" ${loc?.manager_id == s.id ? 'selected' : ''}>${Utils.escapeHtml(s.first_name)} ${Utils.escapeHtml(s.last_name)}</option>`).join('');
    const timezones = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix', 'Pacific/Honolulu'];
    return `
      <div class="grid grid-2 gap-sm">
        <div class="form-group"><label class="form-label">Name *</label><input class="form-input" id="loc-name" value="${Utils.escapeHtml(loc?.name || '')}" placeholder="Location name"></div>
        <div class="form-group"><label class="form-label">Code</label><input class="form-input" id="loc-code" value="${Utils.escapeHtml(loc?.code || '')}" placeholder="AUTO" maxlength="6"></div>
        <div class="form-group"><label class="form-label">Address</label><input class="form-input" id="loc-addr" value="${Utils.escapeHtml(loc?.address || '')}"></div>
        <div class="form-group"><label class="form-label">City</label><input class="form-input" id="loc-city" value="${Utils.escapeHtml(loc?.city || '')}"></div>
        <div class="form-group"><label class="form-label">State</label><input class="form-input" id="loc-state" value="${Utils.escapeHtml(loc?.state || '')}" maxlength="2"></div>
        <div class="form-group"><label class="form-label">ZIP</label><input class="form-input" id="loc-zip" value="${Utils.escapeHtml(loc?.zip || '')}"></div>
        <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="loc-phone" value="${Utils.escapeHtml(loc?.phone || '')}"></div>
        <div class="form-group"><label class="form-label">Manager</label><select class="form-input" id="loc-mgr">${managerOpts}</select></div>
        <div class="form-group"><label class="form-label">Tax Rate (%)</label><input type="number" class="form-input" id="loc-tax" step="0.1" value="${loc ? ((loc.tax_rate || 0) * 100).toFixed(1) : ''}"></div>
        <div class="form-group"><label class="form-label">Timezone</label><select class="form-input" id="loc-tz">${timezones.map(tz => `<option value="${tz}" ${loc?.timezone === tz ? 'selected' : ''}>${tz.replace('America/', '').replace('Pacific/', '')}</option>`).join('')}</select></div>
      </div>`;
  },

  _getLocationData(modal) {
    const taxPct = parseFloat(modal.querySelector('#loc-tax').value);
    return {
      name: modal.querySelector('#loc-name').value.trim(),
      code: modal.querySelector('#loc-code').value.trim() || undefined,
      address: modal.querySelector('#loc-addr').value.trim(),
      city: modal.querySelector('#loc-city').value.trim(),
      state: modal.querySelector('#loc-state').value.trim(),
      zip: modal.querySelector('#loc-zip').value.trim(),
      phone: modal.querySelector('#loc-phone').value.trim(),
      manager_id: modal.querySelector('#loc-mgr').value || undefined,
      tax_rate: isNaN(taxPct) ? undefined : taxPct / 100,
      timezone: modal.querySelector('#loc-tz').value,
    };
  },

  async showAdd() {
    const modal = await UI.modal('Add Location', this._locationFormHtml(null), { confirmText: 'Create Location', size: 'lg' });
    if (!modal) return;
    const data = this._getLocationData(modal);
    if (!data.name) { UI.toast('Error', 'Location name is required', 'danger'); return; }
    try {
      await API.createLocation(data);
      UI.toast('Success', 'Location created', 'success');
      this.render(document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async editLocation(id) {
    const loc = this._locations.find(l => l.id === id);
    if (!loc) return;
    const modal = await UI.modal(`Edit - ${loc.name}`, this._locationFormHtml(loc), { confirmText: 'Save Changes', size: 'lg' });
    if (!modal) return;
    const data = this._getLocationData(modal);
    if (!data.name) { UI.toast('Error', 'Location name is required', 'danger'); return; }
    try {
      await API.updateLocation(id, data);
      UI.toast('Updated', `${data.name} has been updated`, 'success');
      this.render(document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async compareSales() {
    try {
      const data = await API.compareLocationSales({ days: 30 });
      const html = Array.isArray(data) && data.length > 0 ? UI.table([
        { label: 'Location', key: 'name', render: v => `<strong>${Utils.escapeHtml(v)}</strong>` },
        { label: 'Revenue', key: 'total_revenue', align: 'right', render: v => Utils.currency(v || 0) },
        { label: 'Orders', key: 'order_count', align: 'center' },
        { label: 'Avg Order', key: 'avg_order', align: 'right', render: v => Utils.currency(v || 0) },
      ], data) : '<p class="text-muted text-center p-lg">No sales data available for comparison</p>';
      await UI.modal('Sales Comparison (30 days)', html, { footer: false, size: 'lg' });
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  destroy() {},
};
