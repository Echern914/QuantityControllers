const ReservationsModule = {
  selectedDate: new Date().toISOString().slice(0, 10),
  _reservations: [],

  async render(container) {
    const reservations = await API.reservations({ date: this.selectedDate });
    this._reservations = reservations;

    const confirmed = reservations.filter(r => r.status === 'confirmed').length;
    const seated = reservations.filter(r => r.status === 'seated').length;
    const totalGuests = reservations.filter(r => r.status !== 'cancelled').reduce((s, r) => s + (r.party_size || 0), 0);

    container.innerHTML = `<div class="animate-fade">
      <div class="grid grid-4 gap-md mb-md">
        ${UI.statCard('Reservations', reservations.length, '')}
        ${UI.statCard('Confirmed', confirmed, '')}
        ${UI.statCard('Seated', seated, '')}
        ${UI.statCard('Expected Guests', totalGuests, '')}
      </div>
      <div class="flex justify-between items-center mb-md">
        <div class="flex items-center gap-md">
          <button class="btn btn-ghost" onclick="ReservationsModule.changeDate(-1)"><</button>
          <input type="date" class="form-input" value="${this.selectedDate}" onchange="ReservationsModule.selectedDate=this.value; ReservationsModule.render(document.getElementById('main-body'))" style="width:180px">
          <button class="btn btn-ghost" onclick="ReservationsModule.changeDate(1)">></button>
          <button class="btn btn-ghost btn-sm" onclick="ReservationsModule.selectedDate='${Utils.today()}'; ReservationsModule.render(document.getElementById('main-body'))">Today</button>
        </div>
        <div class="flex gap-sm">
          <button class="btn btn-secondary" onclick="ReservationsModule.showWaitlist()">Waitlist</button>
          <button class="btn btn-primary" onclick="ReservationsModule.addReservation()">+ New Reservation</button>
        </div>
      </div>
      <div class="card"><div class="card-body" style="overflow-x:auto">
        ${reservations.length === 0 ? '<div class="empty-state"><h3>No Reservations</h3><p>No reservations for this date</p></div>' :
          UI.table([
            { label: 'Time', key: 'reservation_time', render: v => `<strong>${v}</strong>` },
            { label: 'Guest', key: 'guest_name', render: (v, r) => `<div class="font-medium">${Utils.escapeHtml(v)}</div>${r.phone ? `<div class="text-sm text-muted">${Utils.escapeHtml(r.phone)}</div>` : ''}` },
            { label: 'Party', key: 'party_size', align: 'center', render: v => `${v} guests` },
            { label: 'Table', key: 'table_name', render: (v, r) => v ? v : `<button class="btn btn-ghost btn-sm" onclick="ReservationsModule.assignTable(${r.id})">Assign</button>` },
            { label: 'Status', key: 'status', render: v => Utils.statusBadge(v) },
            { label: 'Duration', key: 'duration_minutes', render: v => `${v} min` },
            { label: 'Notes', key: 'notes', render: v => v ? `<span class="text-sm text-muted">${Utils.escapeHtml(v)}</span>` : '' },
            { label: '', key: r => r, render: (_, r) => `<div class="flex gap-xs">
              <button class="btn btn-ghost btn-sm" onclick="ReservationsModule.editReservation(${r.id})">Edit</button>
              ${r.status === 'confirmed' ? `<button class="btn btn-success btn-sm" onclick="ReservationsModule.seat(${r.id})">Seat</button>` : ''}
              ${r.status === 'confirmed' ? `<button class="btn btn-danger btn-sm" onclick="ReservationsModule.cancel(${r.id})">Cancel</button>` : ''}
            </div>` },
          ], reservations)}
      </div></div>
    </div>`;
  },

  changeDate(delta) {
    const d = new Date(this.selectedDate);
    d.setDate(d.getDate() + delta);
    this.selectedDate = d.toISOString().slice(0, 10);
    this.render(document.getElementById('main-body'));
  },

  _reservationFormHtml(res) {
    return `
      <div class="form-row">
        <div class="form-group"><label class="form-label">Guest Name *</label><input class="form-input" id="r-name" value="${Utils.escapeHtml(res?.guest_name || '')}"></div>
        <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="r-phone" value="${Utils.escapeHtml(res?.phone || '')}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Date</label><input type="date" class="form-input" id="r-date" value="${res?.reservation_date || this.selectedDate}"></div>
        <div class="form-group"><label class="form-label">Time</label><input type="time" class="form-input" id="r-time" value="${res?.reservation_time || '19:00'}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Party Size</label><input type="number" class="form-input" id="r-size" value="${res?.party_size || 2}" min="1"></div>
        <div class="form-group"><label class="form-label">Duration (min)</label><input type="number" class="form-input" id="r-dur" value="${res?.duration_minutes || 90}"></div>
      </div>
      <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="r-notes" rows="2">${Utils.escapeHtml(res?.notes || '')}</textarea></div>
    `;
  },

  _getReservationData(modal) {
    return {
      guest_name: modal.querySelector('#r-name').value.trim(),
      phone: modal.querySelector('#r-phone').value.trim(),
      reservation_date: modal.querySelector('#r-date').value,
      reservation_time: modal.querySelector('#r-time').value,
      party_size: parseInt(modal.querySelector('#r-size').value),
      duration_minutes: parseInt(modal.querySelector('#r-dur').value),
      notes: modal.querySelector('#r-notes').value.trim(),
    };
  },

  async addReservation() {
    const modal = await UI.modal('New Reservation', this._reservationFormHtml(null), { confirmText: 'Reserve' });
    if (!modal) return;
    const data = this._getReservationData(modal);
    if (!data.guest_name) { UI.toast('Error', 'Guest name is required', 'danger'); return; }
    try {
      await API.createReservation(data);
      UI.toast('Reservation Created', '', 'success');
      this.render(document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async editReservation(id) {
    const res = this._reservations.find(r => r.id === id);
    if (!res) return;
    const modal = await UI.modal(`Edit Reservation - ${res.guest_name}`, this._reservationFormHtml(res), { confirmText: 'Save Changes' });
    if (!modal) return;
    const data = this._getReservationData(modal);
    if (!data.guest_name) { UI.toast('Error', 'Guest name is required', 'danger'); return; }
    try {
      await API.updateReservation(id, data);
      UI.toast('Updated', 'Reservation updated', 'success');
      this.render(document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async assignTable(resId) {
    const tables = await API.tables().catch(() => []);
    const available = tables.filter(t => t.status === 'available' || t.status === 'open');
    if (available.length === 0) { UI.toast('No Tables', 'No available tables right now', 'warning'); return; }
    const html = `<div class="form-group"><label class="form-label">Select Table</label><select class="form-select" id="r-table">${available.map(t => `<option value="${t.id}">${Utils.escapeHtml(t.name || 'Table ' + t.number)} (seats ${t.capacity})</option>`).join('')}</select></div>`;
    const modal = await UI.modal('Assign Table', html, { confirmText: 'Assign' });
    if (!modal) return;
    try {
      await API.updateReservation(resId, { table_id: parseInt(modal.querySelector('#r-table').value) });
      UI.toast('Table Assigned', '', 'success');
      this.render(document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async seat(id) {
    try {
      await API.updateReservation(id, { status: 'seated' });
      UI.toast('Seated', 'Guest has been seated', 'success');
      this.render(document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async cancel(id) {
    if (!(await UI.confirm('Cancel Reservation', 'Are you sure you want to cancel this reservation?'))) return;
    try {
      await API.updateReservation(id, { status: 'cancelled' });
      UI.toast('Cancelled', '', 'warning');
      this.render(document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async showWaitlist() {
    const html = `
      <div class="form-row">
        <div class="form-group"><label class="form-label">Guest Name *</label><input class="form-input" id="w-name"></div>
        <div class="form-group"><label class="form-label">Party Size</label><input type="number" class="form-input" id="w-size" value="2" min="1"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="w-phone"></div>
        <div class="form-group"><label class="form-label">Est. Wait (min)</label><input type="number" class="form-input" id="w-wait" value="30"></div>
      </div>
      <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="w-notes" rows="2"></textarea></div>
    `;
    const modal = await UI.modal('Add to Waitlist', html, { confirmText: 'Add to Waitlist' });
    if (!modal) return;
    const name = modal.querySelector('#w-name').value.trim();
    if (!name) { UI.toast('Error', 'Guest name is required', 'danger'); return; }
    try {
      await API.createReservation({
        guest_name: name,
        phone: modal.querySelector('#w-phone').value.trim(),
        reservation_date: this.selectedDate,
        reservation_time: new Date().toTimeString().slice(0, 5),
        party_size: parseInt(modal.querySelector('#w-size').value),
        duration_minutes: 90,
        notes: `WAITLIST (est ${modal.querySelector('#w-wait').value} min) ${modal.querySelector('#w-notes').value}`.trim(),
        status: 'waitlist',
      });
      UI.toast('Added to Waitlist', '', 'success');
      this.render(document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  destroy() {}
};
