/* ============================================================
   VENUECORE - Catering & Events Module
   ============================================================ */
const CateringModule = {
  tab: 'dashboard',

  async render(container) {
    container.innerHTML = `
      <div class="animate-fade">
        <div class="module-tabs" id="cat-tabs">
          <button class="tab-btn active" data-tab="dashboard">Dashboard</button>
          <button class="tab-btn" data-tab="events">Events</button>
          <button class="tab-btn" data-tab="packages">Packages</button>
        </div>
        <div id="cat-content"></div>
      </div>`;
    container.querySelector('#cat-tabs').addEventListener('click', e => {
      if (e.target.classList.contains('tab-btn')) {
        container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.tab = e.target.dataset.tab;
        this.loadTab(container.querySelector('#cat-content'));
      }
    });
    this.loadTab(container.querySelector('#cat-content'));
  },

  async loadTab(el) {
    UI.loading(el);
    try {
      switch (this.tab) {
        case 'dashboard': return await this.renderDashboard(el);
        case 'events': return await this.renderEvents(el);
        case 'packages': return await this.renderPackages(el);
      }
    } catch (err) { el.innerHTML = `<div class="empty-state"><p>${Utils.escapeHtml(err.message)}</p></div>`; }
  },

  async renderDashboard(el) {
    const d = await API.cateringDashboard();
    el.innerHTML = `
      <div class="grid grid-4 gap-md mb-md">
        ${UI.statCard('Upcoming Events', d.upcoming_events, '')}
        ${UI.statCard('This Month Revenue', Utils.currency(d.this_month?.revenue || 0), '$')}
        ${UI.statCard('Pending Deposits', Utils.currency(d.pending_deposits?.amount || 0), '')}
        ${UI.statCard('Outstanding', Utils.currency(d.outstanding_balance || 0), '')}
      </div>
      <div class="grid grid-2 gap-md">
        <div class="card">
          <div class="card-header flex items-center justify-between">
            <h3>Upcoming Events</h3>
            <button class="btn btn-primary btn-sm" onclick="CateringModule.showNewEvent()">+ New Event</button>
          </div>
          <div class="card-body" style="padding:0">
            ${(d.next_events || []).length === 0 ? '<p class="text-muted text-sm" style="padding:20px;text-align:center">No upcoming events</p>' :
              UI.table([
                { label: 'Event', key: 'event_name' },
                { label: 'Date', key: 'event_date' },
                { label: 'Time', key: 'start_time' },
                { label: 'Guests', key: 'guest_count', align: 'right' },
                { label: 'Total', key: 'total', render: v => Utils.currency(v || 0), align: 'right' },
                { label: 'Status', key: 'status', render: v => `<span class="badge badge-${v === 'confirmed' ? 'success' : v === 'inquiry' ? 'warning' : 'secondary'}">${v}</span>` },
              ], d.next_events)}
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h3>Monthly Revenue Trend</h3></div>
          <div class="card-body">
            ${(d.monthly_revenue || []).length === 0 ? '<p class="text-muted text-sm" style="text-align:center">No revenue data yet</p>' :
              d.monthly_revenue.map(m => `
                <div class="flex items-center justify-between" style="padding:6px 0;border-bottom:1px solid var(--border-color)">
                  <span class="text-sm font-bold">${m.month}</span>
                  <span>${m.events} events</span>
                  <span class="font-bold">${Utils.currency(m.revenue)}</span>
                </div>
              `).join('')}
          </div>
        </div>
      </div>`;
  },

  async renderEvents(el) {
    const events = await API.cateringEvents();
    const statusColors = { inquiry: '#f39c12', proposal: '#3498db', confirmed: '#27ae60', in_progress: '#9b59b6', completed: '#2c3e50', cancelled: '#e74c3c' };

    el.innerHTML = `
      <div class="flex items-center justify-between mb-md">
        <h3>${events.length} Events</h3>
        <button class="btn btn-primary btn-sm" onclick="CateringModule.showNewEvent()">+ New Event</button>
      </div>
      ${events.length === 0 ? '<div class="empty-state"><h3>No events</h3><p>Create your first catering event.</p></div>' :
        `<div class="card"><div class="card-body" style="padding:0;max-height:600px;overflow-y:auto">
          ${UI.table([
            { label: 'Event', key: 'event_name' },
            { label: 'Type', key: 'event_type' },
            { label: 'Contact', key: 'contact_name' },
            { label: 'Date', key: 'event_date' },
            { label: 'Time', key: r => `${r.start_time} - ${r.end_time}`, render: v => v },
            { label: 'Guests', key: 'guest_count', align: 'right' },
            { label: 'Total', key: 'total', render: v => Utils.currency(v || 0), align: 'right' },
            { label: 'Balance', key: 'balance_due', render: v => v > 0 ? `<span class="text-danger font-bold">${Utils.currency(v)}</span>` : '<span class="text-success">Paid</span>', align: 'right' },
            { label: 'Status', key: 'status', render: v => `<span class="badge" style="background:${statusColors[v] || '#999'};color:#fff">${v}</span>` },
          ], events)}
        </div></div>`}`;
  },

  async showNewEvent() {
    const html = `
      <div class="grid grid-2 gap-sm">
        <div class="form-group"><label class="form-label">Event Name</label><input class="form-input" id="ce-name" placeholder="e.g. Smith Wedding Reception"></div>
        <div class="form-group"><label class="form-label">Type</label><select class="form-input" id="ce-type"><option value="private_party">Private Party</option><option value="wedding">Wedding</option><option value="corporate">Corporate</option><option value="birthday">Birthday</option><option value="holiday">Holiday</option><option value="fundraiser">Fundraiser</option><option value="other">Other</option></select></div>
        <div class="form-group"><label class="form-label">Contact Name</label><input class="form-input" id="ce-contact"></div>
        <div class="form-group"><label class="form-label">Contact Phone</label><input class="form-input" id="ce-phone"></div>
        <div class="form-group"><label class="form-label">Contact Email</label><input class="form-input" id="ce-email" type="email"></div>
        <div class="form-group"><label class="form-label">Guest Count</label><input class="form-input" type="number" id="ce-guests" value="20"></div>
        <div class="form-group"><label class="form-label">Event Date</label><input class="form-input" type="date" id="ce-date"></div>
        <div class="form-group"><label class="form-label">Start Time</label><input class="form-input" type="time" id="ce-start" value="18:00"></div>
        <div class="form-group"><label class="form-label">End Time</label><input class="form-input" type="time" id="ce-end" value="22:00"></div>
        <div class="form-group"><label class="form-label">Venue</label><select class="form-input" id="ce-venue"><option value="on_premise">On Premise</option><option value="off_premise">Off Premise</option></select></div>
      </div>
      <div class="form-group"><label class="form-label">Special Requirements</label><textarea class="form-input" id="ce-reqs" rows="2"></textarea></div>
      <div class="form-group"><label class="form-label">Dietary Notes</label><input class="form-input" id="ce-diet" placeholder="Allergies, vegetarian count, etc."></div>`;
    const modal = await UI.modal('New Catering Event', html, { confirmText: 'Create Event', size: 'lg' });
    if (!modal) return;
    try {
      await API.createCateringEvent({
        event_name: modal.querySelector('#ce-name').value, event_type: modal.querySelector('#ce-type').value,
        contact_name: modal.querySelector('#ce-contact').value, contact_phone: modal.querySelector('#ce-phone').value,
        contact_email: modal.querySelector('#ce-email').value, guest_count: parseInt(modal.querySelector('#ce-guests').value),
        event_date: modal.querySelector('#ce-date').value, start_time: modal.querySelector('#ce-start').value,
        end_time: modal.querySelector('#ce-end').value, venue_type: modal.querySelector('#ce-venue').value,
        special_requirements: modal.querySelector('#ce-reqs').value, dietary_notes: modal.querySelector('#ce-diet').value,
      });
      UI.toast('Success', 'Event created', 'success');
      this.loadTab(document.getElementById('cat-content'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async renderPackages(el) {
    const packages = await API.cateringPackages();
    el.innerHTML = `
      <div class="flex items-center justify-between mb-md">
        <h3>Catering Packages</h3>
        <button class="btn btn-primary btn-sm" onclick="CateringModule.showNewPackage()">+ New Package</button>
      </div>
      ${packages.length === 0 ? '<div class="empty-state"><h3>No packages</h3><p>Create catering packages for quick event setup.</p></div>' :
        `<div class="grid grid-3 gap-md">${packages.map(p => `
          <div class="card">
            <div class="card-header">
              <h3>${Utils.escapeHtml(p.name)}</h3>
              <span class="badge badge-secondary">${Utils.escapeHtml(p.category)}</span>
            </div>
            <div class="card-body">
              <div class="font-bold" style="font-size:24px;margin-bottom:8px">${Utils.currency(p.price_per_person)} <span class="text-sm text-muted font-normal">/ person</span></div>
              <p class="text-sm text-muted mb-sm">${Utils.escapeHtml(p.description || '')}</p>
              <div class="text-sm">Min: ${p.min_guests} guests${p.max_guests ? ` | Max: ${p.max_guests}` : ''}</div>
              ${(p.includes || []).length > 0 ? `<div class="mt-sm">${p.includes.map(i => `<span class="badge badge-info" style="margin:2px">${Utils.escapeHtml(i)}</span>`).join('')}</div>` : ''}
            </div>
          </div>
        `).join('')}</div>`}`;
  },

  async showNewPackage() {
    const html = `
      <div class="grid grid-2 gap-sm">
        <div class="form-group"><label class="form-label">Package Name</label><input class="form-input" id="cp-name"></div>
        <div class="form-group"><label class="form-label">Price / Person</label><input class="form-input" type="number" step="0.01" id="cp-price"></div>
        <div class="form-group"><label class="form-label">Min Guests</label><input class="form-input" type="number" id="cp-min" value="10"></div>
        <div class="form-group"><label class="form-label">Category</label><select class="form-input" id="cp-cat"><option value="standard">Standard</option><option value="premium">Premium</option><option value="budget">Budget</option></select></div>
      </div>
      <div class="form-group"><label class="form-label">Description</label><textarea class="form-input" id="cp-desc" rows="2"></textarea></div>`;
    const modal = await UI.modal('New Package', html, { confirmText: 'Create Package' });
    if (!modal) return;
    try {
      await API.createCateringPackage({ name: modal.querySelector('#cp-name').value, price_per_person: parseFloat(modal.querySelector('#cp-price').value), min_guests: parseInt(modal.querySelector('#cp-min').value), category: modal.querySelector('#cp-cat').value, description: modal.querySelector('#cp-desc').value });
      UI.toast('Success', 'Package created', 'success');
      this.loadTab(document.getElementById('cat-content'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  destroy() {},
};
