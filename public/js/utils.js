/* ============================================================
   NEXUS POS - Utilities
   ============================================================ */
const Utils = {
  currency(amount) {
    return '$' + (parseFloat(amount) || 0).toFixed(2);
  },

  percent(value) {
    return (parseFloat(value) || 0).toFixed(1) + '%';
  },

  formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  },

  formatTime(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  },

  formatDateTime(dateStr) {
    if (!dateStr) return '-';
    return this.formatDate(dateStr) + ' ' + this.formatTime(dateStr);
  },

  timeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  },

  minutesToTime(mins) {
    if (!mins && mins !== 0) return '-';
    const m = Math.round(mins);
    if (m < 60) return `${m}m`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  },

  today() {
    return new Date().toISOString().slice(0, 10);
  },

  clockTime() {
    return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
  },

  debounce(fn, ms) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
  },

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  statusBadge(status) {
    const map = {
      open: 'badge-info', occupied: 'badge-primary', reserved: 'badge-warning',
      dirty: 'badge-danger', closed: 'badge-neutral', sent: 'badge-info',
      preparing: 'badge-warning', ready: 'badge-success', served: 'badge-neutral',
      paid: 'badge-success', unpaid: 'badge-danger', partial: 'badge-warning',
      voided: 'badge-danger', draft: 'badge-neutral', submitted: 'badge-info',
      received: 'badge-success', queued: 'badge-info', confirmed: 'badge-info',
      seated: 'badge-success', completed: 'badge-success', cancelled: 'badge-danger',
      'no-show': 'badge-danger', 'in-progress': 'badge-warning',
      regular: 'badge-neutral', silver: 'badge-info', gold: 'badge-warning', platinum: 'badge-primary',
      low_stock: 'badge-warning', out_of_stock: 'badge-danger', critical: 'badge-danger',
      high: 'badge-warning', medium: 'badge-info', low: 'badge-neutral',
    };
    return `<span class="badge ${map[status] || 'badge-neutral'}">${Utils.escapeHtml(status)}</span>`;
  },

  getWeekStart(date) {
    const d = new Date(date || Date.now());
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    return d.toISOString().slice(0, 10);
  },

  getDayName(dateStr) {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
  },

  getDayOfWeek(dateStr) {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  },
};
