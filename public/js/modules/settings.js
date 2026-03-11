const SettingsModule = {
  async render(container) {
    const settings = await API.settings();
    container.innerHTML = `<div class="animate-fade">
      <div class="grid grid-2 gap-lg">
        <!-- Business Settings -->
        <div class="card">
          <div class="card-header"><h3>Business Settings</h3></div>
          <div class="card-body">
            <div class="form-group"><label class="form-label">Restaurant Name</label><input class="form-input" id="s-name" value="${Utils.escapeHtml(settings.restaurant_name || '')}"></div>
            <div class="form-group"><label class="form-label">Tax Rate</label><input type="number" class="form-input" id="s-tax" step="0.01" value="${settings.tax_rate || '0.08'}"></div>
            <div class="form-group"><label class="form-label">Currency</label><input class="form-input" id="s-currency" value="${settings.currency || 'USD'}"></div>
            <div class="form-group"><label class="form-label">Receipt Footer</label><textarea class="form-textarea" id="s-footer" rows="2">${Utils.escapeHtml(settings.receipt_footer || '')}</textarea></div>
            <button class="btn btn-primary" onclick="SettingsModule.saveBusiness()">Save</button>
          </div>
        </div>

        <!-- Loyalty Settings -->
        <div class="card">
          <div class="card-header"><h3>Loyalty Program</h3></div>
          <div class="card-body">
            <div class="form-group"><label class="form-label">Points per Dollar</label><input type="number" class="form-input" id="s-ptsPerDollar" value="${settings.loyalty_points_per_dollar || '1'}"></div>
            <div class="form-group"><label class="form-label">Redemption Rate (points per $1)</label><input type="number" class="form-input" id="s-redemption" value="${settings.loyalty_redemption_rate || '100'}"></div>
            <div class="form-group"><label class="form-label">VIP Tiers</label>
              <div class="text-sm text-muted">Silver: 500 pts | Gold: 2,000 pts | Platinum: 5,000 pts</div>
            </div>
            <button class="btn btn-primary" onclick="SettingsModule.saveLoyalty()">Save</button>
          </div>
        </div>

        <!-- Inventory Settings -->
        <div class="card">
          <div class="card-header"><h3>Inventory Settings</h3></div>
          <div class="card-body">
            <div class="form-group"><label class="form-label">Low Stock Threshold (%)</label><input type="number" class="form-input" id="s-threshold" value="${settings.low_stock_threshold || '20'}"></div>
            <div class="form-group">
              <label class="form-label">Auto-Reorder</label>
              <div class="flex items-center gap-sm">
                <label class="toggle"><input type="checkbox" id="s-autoReorder" ${settings.auto_reorder_enabled === 'true' ? 'checked' : ''}><span class="toggle-slider"></span></label>
                <span class="text-sm text-muted">Automatically create POs when below par</span>
              </div>
            </div>
            <button class="btn btn-primary" onclick="SettingsModule.saveInventory()">Save</button>
          </div>
        </div>

        <!-- Register Management -->
        <div class="card">
          <div class="card-header"><h3>Register</h3></div>
          <div class="card-body">
            <div class="flex flex-col gap-sm">
              <button class="btn btn-success btn-block" onclick="SettingsModule.openRegister()">Open Register</button>
              <button class="btn btn-danger btn-block" onclick="SettingsModule.closeRegister()">Close Register</button>
            </div>
          </div>
        </div>

        <!-- Clover Integration -->
        <div class="card">
          <div class="card-header"><h3>Clover POS Integration</h3></div>
          <div class="card-body">
            <div class="form-group"><label class="form-label">Merchant ID</label><input class="form-input" placeholder="Set in .env file" disabled></div>
            <div class="form-group"><label class="form-label">API Token</label><input class="form-input" placeholder="Set in .env file" disabled></div>
            <p class="text-sm text-muted">Configure Clover credentials in the .env file</p>
          </div>
        </div>

        <!-- AI Settings -->
        <div class="card">
          <div class="card-header"><h3>AI Assistant</h3></div>
          <div class="card-body">
            <div class="form-group"><label class="form-label">Anthropic API Key</label><input class="form-input" placeholder="Set in .env file" disabled></div>
            <div class="form-group"><label class="form-label">Model</label><input class="form-input" value="${Utils.escapeHtml(settings.ai_model || 'claude-sonnet-4-20250514')}" disabled></div>
            <p class="text-sm text-muted">Configure API key in the .env file</p>
          </div>
        </div>
      </div>
    </div>`;
  },

  async saveBusiness() {
    try {
      await Promise.all([
        API.updateSetting('restaurant_name', document.getElementById('s-name').value),
        API.updateSetting('tax_rate', document.getElementById('s-tax').value),
        API.updateSetting('currency', document.getElementById('s-currency').value),
        API.updateSetting('receipt_footer', document.getElementById('s-footer').value),
      ]);
      UI.toast('Saved', 'Business settings updated', 'success');
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async saveLoyalty() {
    try {
      await Promise.all([
        API.updateSetting('loyalty_points_per_dollar', document.getElementById('s-ptsPerDollar').value),
        API.updateSetting('loyalty_redemption_rate', document.getElementById('s-redemption').value),
      ]);
      UI.toast('Saved', 'Loyalty settings updated', 'success');
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async saveInventory() {
    try {
      await Promise.all([
        API.updateSetting('low_stock_threshold', document.getElementById('s-threshold').value),
        API.updateSetting('auto_reorder_enabled', document.getElementById('s-autoReorder').checked ? 'true' : 'false'),
      ]);
      UI.toast('Saved', 'Inventory settings updated', 'success');
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async openRegister() {
    const cash = await UI.prompt('Open Register', 'Opening cash amount:', '200');
    if (!cash) return;
    try {
      await API.openRegister({ employee_id: App.employee?.id, opening_cash: parseFloat(cash) });
      UI.toast('Register Opened', `$${cash} opening balance`, 'success');
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async closeRegister() {
    const cash = await UI.prompt('Close Register', 'Count the cash drawer. Total amount:', '0');
    if (!cash) return;
    try {
      const registers = await API.get('/api/settings/registers');
      const open = registers.find(r => r.status === 'open');
      if (!open) { UI.toast('Error', 'No open register found', 'danger'); return; }
      const result = await API.closeRegister({ register_id: open.id, closing_cash: parseFloat(cash) });
      const diff = result.difference;
      UI.toast('Register Closed', `Expected: ${Utils.currency(result.expected_cash)} | Actual: ${Utils.currency(parseFloat(cash))} | Diff: ${diff >= 0 ? '+' : ''}${Utils.currency(diff)}`, diff === 0 ? 'success' : 'warning');
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  destroy() {}
};
