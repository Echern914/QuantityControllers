const NotificationsModule = {
  async render(container) {
    const alerts = await API.notifications();
    container.innerHTML = `<div class="animate-fade">
      <div class="flex justify-between items-center mb-md">
        <h3>${alerts.filter(a => !a.acknowledged).length} Unread Alerts</h3>
        <div class="flex gap-sm">
          <button class="btn btn-secondary" onclick="NotificationsModule.readAll()">Mark All Read</button>
          <button class="btn btn-ghost" onclick="NotificationsModule.render(document.getElementById('main-body'))">Refresh</button>
        </div>
      </div>
      <div class="card"><div class="card-body">
        ${alerts.length === 0 ? '<div class="empty-state"><h3>All Clear</h3><p>No alerts</p></div>' :
          alerts.map(a => `
            <div class="flex items-center gap-md p-md ${a.acknowledged ? 'text-muted' : ''}" style="border-bottom:1px solid var(--border-color)">
              <span style="font-size:20px">${a.severity === 'critical' ? 'CRIT' : a.severity === 'high' ? 'HIGH' : a.severity === 'medium' ? 'MED' : 'LOW'}</span>
              <div class="flex-1">
                <div class="font-medium">${Utils.escapeHtml(a.title)}</div>
                <div class="text-sm text-secondary">${Utils.escapeHtml(a.message || '')}</div>
                <div class="text-sm text-muted">${Utils.timeAgo(a.created_at)} | ${a.type}</div>
              </div>
              ${Utils.statusBadge(a.severity)}
              ${!a.acknowledged ? `<button class="btn btn-ghost btn-sm" onclick="NotificationsModule.acknowledge(${a.id})">Dismiss</button>` : '<span class="text-sm text-muted">Read</span>'}
            </div>
          `).join('')}
      </div></div>
    </div>`;
  },

  async acknowledge(id) {
    await API.readNotification(id, App.employee?.id);
    this.render(document.getElementById('main-body'));
    App.updateAlertCount();
  },

  async readAll() {
    await API.readAllNotifications();
    this.render(document.getElementById('main-body'));
    App.updateAlertCount();
    UI.toast('Done', 'All alerts marked as read', 'success');
  },

  destroy() {}
};
