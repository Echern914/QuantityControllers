const ReservationsModule = {
  selectedDate: new Date().toISOString().slice(0, 10),

  async render(container) {
    const reservations = await API.reservations({ date: this.selectedDate });
    container.innerHTML = `<div class="animate-fade">
      <div class="flex justify-between items-center mb-md">
        <div class="flex items-center gap-md">
          <button class="btn btn-ghost" onclick="ReservationsModule.changeDate(-1)"><</button>
          <input type="date" class="form-input" value="${this.selectedDate}" onchange="ReservationsModule.selectedDate=this.value; ReservationsModule.render(document.getElementById('main-body'))" style="width:180px">
          <button class="btn btn-ghost" onclick="ReservationsModule.changeDate(1)">></button>
          <button class="btn btn-ghost btn-sm" onclick="ReservationsModule.selectedDate='${Utils.today()}'; ReservationsModule.render(document.getElementById('main-body'))">Today</button>
        </div>
        <button class="btn btn-primary" onclick="ReservationsModule.addReservation()">+ New Reservation</button>
      </div>
      <div class="card"><div class="card-body">
        ${reservations.length === 0 ? '<div class="empty-state"><h3>No Reservations</h3><p>No reservations for this date</p></div>' :
          UI.table([
            { label: 'Time', key: 'reservation_time', render: v => `<strong>${v}</strong>` },
            { label: 'Guest', key: 'guest_name', render: (v, r) => `<div class="font-medium">${Utils.escapeHtml(v)}</div>${r.phone ? `<div class="text-sm text-muted">${Utils.escapeHtml(r.phone)}</div>` : ''}` },
            { label: 'Party', key: 'party_size', align: 'center', render: v => `${v} guests` },
            { label: 'Table', key: 'table_name', render: v => v || '-' },
            { label: 'Status', key: 'status', render: v => Utils.statusBadge(v) },
            { label: 'Duration', key: 'duration_minutes', render: v => `${v} min` },
            { label: 'Notes', key: 'notes', render: v => v ? `<span class="text-sm text-muted">${Utils.escapeHtml(v)}</span>` : '' },
            { label: '', key: r => r, render: (_, r) => `<div class="flex gap-xs">
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

  async addReservation() {
    const html = `
      <div class="form-row"><div class="form-group"><label class="form-label">Guest Name</label><input class="form-input" id="r-name"></div>
      <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="r-phone"></div></div>
      <div class="form-row"><div class="form-group"><label class="form-label">Date</label><input type="date" class="form-input" id="r-date" value="${this.selectedDate}"></div>
      <div class="form-group"><label class="form-label">Time</label><input type="time" class="form-input" id="r-time" value="19:00"></div></div>
      <div class="form-row"><div class="form-group"><label class="form-label">Party Size</label><input type="number" class="form-input" id="r-size" value="2" min="1"></div>
      <div class="form-group"><label class="form-label">Duration (min)</label><input type="number" class="form-input" id="r-dur" value="90"></div></div>
      <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="r-notes" rows="2"></textarea></div>
    `;
    const modal = await UI.modal('New Reservation', html, { confirmText: 'Reserve' });
    if (!modal) return;
    try {
      await API.createReservation({ guest_name: modal.querySelector('#r-name').value, phone: modal.querySelector('#r-phone').value, reservation_date: modal.querySelector('#r-date').value, reservation_time: modal.querySelector('#r-time').value, party_size: parseInt(modal.querySelector('#r-size').value), duration_minutes: parseInt(modal.querySelector('#r-dur').value), notes: modal.querySelector('#r-notes').value });
      UI.toast('Reservation Created', '', 'success');
      this.render(document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async seat(id) {
    try {
      await API.updateReservation(id, { status: 'seated' });
      UI.toast('Seated', '', 'success');
      this.render(document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async cancel(id) {
    if (!(await UI.confirm('Cancel Reservation', 'Are you sure?'))) return;
    try {
      await API.updateReservation(id, { status: 'cancelled' });
      UI.toast('Cancelled', '', 'warning');
      this.render(document.getElementById('main-body'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  destroy() {}
};
