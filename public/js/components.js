/* ============================================================
   VENUECORE - Reusable UI Components
   ============================================================ */
const UI = {
  // Toast notification system
  _toastContainer: null,

  toast(title, message, type = 'info') {
    if (!this._toastContainer) {
      this._toastContainer = document.createElement('div');
      this._toastContainer.className = 'toast-container';
      document.body.appendChild(this._toastContainer);
    }

    const icons = { success: '\u2713', warning: '\u26A0', danger: '\u2717', info: '\u2139' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type} animate-slide`;
    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <div class="toast-content">
        <div class="toast-title">${Utils.escapeHtml(title)}</div>
        ${message ? `<div class="toast-message">${Utils.escapeHtml(message)}</div>` : ''}
      </div>
      <button class="toast-close" onclick="this.closest('.toast').remove()">\u00D7</button>
    `;
    this._toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  },

  // Modal dialog
  modal(title, contentHtml, options = {}) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      const sizeClass = options.size === 'lg' ? 'modal-lg' : options.size === 'xl' ? 'modal-xl' : '';

      overlay.innerHTML = `
        <div class="modal ${sizeClass}">
          <div class="modal-header">
            <h3>${Utils.escapeHtml(title)}</h3>
            <button class="modal-close" data-action="close">\u00D7</button>
          </div>
          <div class="modal-body">${contentHtml}</div>
          ${options.footer !== false ? `
            <div class="modal-footer">
              ${options.showCancel !== false ? '<button class="btn btn-secondary" data-action="cancel">Cancel</button>' : ''}
              ${options.confirmText ? `<button class="btn btn-primary" data-action="confirm">${Utils.escapeHtml(options.confirmText)}</button>` : ''}
            </div>
          ` : ''}
        </div>
      `;

      const close = (result) => { overlay.remove(); resolve(result); };

      overlay.querySelector('[data-action="close"]').onclick = () => close(null);
      const cancelBtn = overlay.querySelector('[data-action="cancel"]');
      if (cancelBtn) cancelBtn.onclick = () => close(null);
      const confirmBtn = overlay.querySelector('[data-action="confirm"]');
      if (confirmBtn) confirmBtn.onclick = () => close(overlay);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });

      document.body.appendChild(overlay);
      if (options.onMount) options.onMount(overlay);
    });
  },

  // Confirm dialog
  async confirm(title, message) {
    const result = await this.modal(title, `<p>${Utils.escapeHtml(message)}</p>`, { confirmText: 'Confirm' });
    return result !== null;
  },

  // Prompt dialog
  async prompt(title, label, defaultValue = '') {
    const html = `
      <div class="form-group">
        <label class="form-label">${Utils.escapeHtml(label)}</label>
        <input type="text" class="form-input" id="prompt-input" value="${Utils.escapeHtml(defaultValue)}" autofocus>
      </div>
    `;
    const result = await this.modal(title, html, {
      confirmText: 'OK',
      onMount(el) { setTimeout(() => el.querySelector('#prompt-input')?.focus(), 100); }
    });
    if (!result) return null;
    return result.querySelector('#prompt-input').value;
  },

  // Loading state
  loading(container) {
    container.innerHTML = `<div class="loading-overlay"><div class="spinner"></div><span>Loading...</span></div>`;
  },

  // Empty state
  empty(container, icon, title, message) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${icon}</div>
        <h3>${Utils.escapeHtml(title)}</h3>
        <p>${Utils.escapeHtml(message || '')}</p>
      </div>
    `;
  },

  // Render a data table
  table(headers, rows, options = {}) {
    if (!rows.length && options.emptyMessage) {
      return `<div class="empty-state"><p>${Utils.escapeHtml(options.emptyMessage)}</p></div>`;
    }

    const headerHtml = headers.map(h => `<th${h.align ? ` style="text-align:${h.align}"` : ''}>${Utils.escapeHtml(h.label || h)}</th>`).join('');

    const rowsHtml = rows.map(row => {
      const cells = headers.map((h, i) => {
        const key = h.key || i;
        const val = typeof key === 'function' ? key(row) : (row[key] ?? '');
        const align = h.align ? ` style="text-align:${h.align}"` : '';
        return `<td${align}>${h.render ? h.render(val, row) : Utils.escapeHtml(String(val))}</td>`;
      });
      const rowAttr = options.rowAttr ? options.rowAttr(row) : '';
      return `<tr ${rowAttr}>${cells.join('')}</tr>`;
    }).join('');

    return `<table class="data-table"><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
  },

  // Stat card
  statCard(label, value, icon, change) {
    return `
      <div class="stat-card">
        <div class="flex justify-between items-center">
          <div>
            <div class="stat-label">${Utils.escapeHtml(label)}</div>
            <div class="stat-value">${value}</div>
            ${change ? `<div class="stat-change ${change.startsWith('+') ? 'text-success' : change.startsWith('-') ? 'text-danger' : 'text-muted'}">${Utils.escapeHtml(change)}</div>` : ''}
          </div>
          ${icon ? `<div class="stat-icon">${icon}</div>` : ''}
        </div>
      </div>
    `;
  },

  // Simple bar chart using canvas
  barChart(canvasId, labels, data, color = '#6366f1') {
    setTimeout(() => {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const { width, height } = canvas;
      const padding = { top: 20, right: 20, bottom: 40, left: 60 };
      const chartW = width - padding.left - padding.right;
      const chartH = height - padding.top - padding.bottom;
      const maxVal = Math.max(...data, 1);

      ctx.clearRect(0, 0, width, height);

      // Grid lines
      ctx.strokeStyle = '#2d3548';
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= 4; i++) {
        const y = padding.top + (chartH / 4) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();

        ctx.fillStyle = '#64748b';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(Utils.currency(maxVal - (maxVal / 4) * i).replace('$', ''), padding.left - 8, y + 4);
      }

      // Bars
      const barWidth = Math.min(40, (chartW / data.length) * 0.6);
      const gap = (chartW - barWidth * data.length) / (data.length + 1);

      data.forEach((val, i) => {
        const x = padding.left + gap + (barWidth + gap) * i;
        const barH = (val / maxVal) * chartH;
        const y = padding.top + chartH - barH;

        const grad = ctx.createLinearGradient(x, y, x, y + barH);
        grad.addColorStop(0, color);
        grad.addColorStop(1, color + '66');
        ctx.fillStyle = grad;

        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barH, [4, 4, 0, 0]);
        ctx.fill();

        // Label
        ctx.fillStyle = '#64748b';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(labels[i] || '', x + barWidth / 2, height - padding.bottom + 16);
      });
    }, 50);
  },
};
