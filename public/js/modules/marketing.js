/* ============================================================
   VENUECORE - Marketing & Promotions Module
   ============================================================ */
const MarketingModule = {
  tab: 'dashboard',

  async render(container) {
    container.innerHTML = `
      <div class="animate-fade">
        <div class="module-tabs" id="mkt-tabs">
          <button class="tab-btn active" data-tab="dashboard">Dashboard</button>
          <button class="tab-btn" data-tab="campaigns">Campaigns</button>
          <button class="tab-btn" data-tab="promotions">Promotions</button>
          <button class="tab-btn" data-tab="lists">Email Lists</button>
        </div>
        <div id="mkt-content"></div>
      </div>`;
    container.querySelector('#mkt-tabs').addEventListener('click', e => {
      if (e.target.classList.contains('tab-btn')) {
        container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.tab = e.target.dataset.tab;
        this.loadTab(container.querySelector('#mkt-content'));
      }
    });
    this.loadTab(container.querySelector('#mkt-content'));
  },

  async loadTab(el) {
    UI.loading(el);
    try {
      switch (this.tab) {
        case 'dashboard': return await this.renderDashboard(el);
        case 'campaigns': return await this.renderCampaigns(el);
        case 'promotions': return await this.renderPromotions(el);
        case 'lists': return await this.renderLists(el);
      }
    } catch (err) { el.innerHTML = `<div class="empty-state"><p>${Utils.escapeHtml(err.message)}</p></div>`; }
  },

  async renderDashboard(el) {
    const d = await API.marketingDashboard();
    el.innerHTML = `
      <div class="grid grid-4 gap-md mb-md">
        ${UI.statCard('Active Campaigns', d.active_campaigns, '\u2709')}
        ${UI.statCard('Active Promos', d.active_promotions, '%')}
        ${UI.statCard('Emails Sent', d.total_emails_sent, '\u2192')}
        ${UI.statCard('Revenue Generated', Utils.currency(d.revenue_generated || 0), '$')}
      </div>
      <div class="grid grid-2 gap-md mb-md">
        <div class="card">
          <div class="card-header"><h3>Customer Segments</h3></div>
          <div class="card-body">
            <div class="grid grid-2 gap-sm">
              <div class="text-sm"><strong>${d.customer_segments?.total || 0}</strong> total with email</div>
              <div class="text-sm"><strong>${d.customer_segments?.vip || 0}</strong> VIP customers</div>
              <div class="text-sm"><strong>${d.customer_segments?.active || 0}</strong> active (30d)</div>
              <div class="text-sm" style="color:var(--danger)"><strong>${d.customer_segments?.lapsed || 0}</strong> lapsed (60d+)</div>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h3>Promo Performance (30 Days)</h3></div>
          <div class="card-body">
            <div class="grid grid-2 gap-sm">
              <div><strong>${d.promo_uses_30d || 0}</strong> promo uses</div>
              <div><strong>${Utils.currency(d.promo_discount_30d || 0)}</strong> in discounts</div>
            </div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-header flex items-center justify-between">
          <h3>Recent Campaigns</h3>
          <button class="btn btn-primary btn-sm" onclick="MarketingModule.tab='campaigns';document.querySelector('[data-tab=campaigns]').click()">View All</button>
        </div>
        <div class="card-body" style="padding:0">
          ${(d.recent_campaigns || []).length === 0 ? '<p class="text-muted text-sm" style="padding:20px;text-align:center">No campaigns yet</p>' :
            UI.table([
              { label: 'Campaign', key: 'name' }, { label: 'Type', key: 'campaign_type' },
              { label: 'Status', key: 'status', render: v => `<span class="badge badge-${v === 'sent' ? 'success' : v === 'active' ? 'info' : 'secondary'}">${v}</span>` },
              { label: 'Sent To', key: 'recipients_count', align: 'right' },
              { label: 'Opens', key: 'opens_count', align: 'right' },
            ], d.recent_campaigns)}
        </div>
      </div>`;
  },

  async renderCampaigns(el) {
    const campaigns = await API.marketingCampaigns();
    el.innerHTML = `
      <div class="flex items-center justify-between mb-md">
        <h3>${campaigns.length} Campaigns</h3>
        <button class="btn btn-primary btn-sm" onclick="MarketingModule.showNewCampaign()">+ New Campaign</button>
      </div>
      <div class="card"><div class="card-body" style="padding:0">
        ${campaigns.length === 0 ? '<p class="text-muted text-sm" style="padding:20px;text-align:center">No campaigns yet</p>' :
          UI.table([
            { label: 'Name', key: 'name' }, { label: 'Type', key: 'campaign_type' },
            { label: 'Audience', key: 'target_audience' }, { label: 'Recipients', key: 'recipients_count', align: 'right' },
            { label: 'Status', key: 'status', render: v => `<span class="badge badge-${v === 'sent' ? 'success' : v === 'active' ? 'info' : 'secondary'}">${v}</span>` },
            { label: 'Actions', key: r => r, render: (v) => v.status === 'draft' ? `<button class="btn btn-sm btn-success" onclick="MarketingModule.sendCampaign(${v.id})">Send</button>` : '' },
          ], campaigns)}
      </div></div>`;
  },

  async showNewCampaign() {
    const html = `
      <div class="grid grid-2 gap-sm">
        <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="mc-name"></div>
        <div class="form-group"><label class="form-label">Type</label><select class="form-input" id="mc-type"><option value="email">Email</option><option value="sms">SMS</option><option value="push">Push</option></select></div>
        <div class="form-group"><label class="form-label">Audience</label><select class="form-input" id="mc-audience"><option value="all">All Customers</option><option value="vip">VIP Only</option><option value="inactive">Inactive (30d+)</option><option value="birthday">Birthday Today</option></select></div>
        <div class="form-group"><label class="form-label">Subject</label><input class="form-input" id="mc-subject"></div>
      </div>
      <div class="form-group"><label class="form-label">Content</label><textarea class="form-input" id="mc-content" rows="4" placeholder="Campaign message..."></textarea></div>`;
    const modal = await UI.modal('New Campaign', html, { confirmText: 'Create Campaign', size: 'lg' });
    if (!modal) return;
    try {
      await API.createCampaign({ name: modal.querySelector('#mc-name').value, campaign_type: modal.querySelector('#mc-type').value, target_audience: modal.querySelector('#mc-audience').value, subject: modal.querySelector('#mc-subject').value, content: modal.querySelector('#mc-content').value });
      UI.toast('Success', 'Campaign created', 'success');
      this.loadTab(document.getElementById('mkt-content'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async sendCampaign(id) {
    if (!await UI.confirm('Send Campaign', 'Send this campaign to the target audience?')) return;
    try { const r = await API.sendCampaign(id); UI.toast('Sent', r.message, 'success'); this.loadTab(document.getElementById('mkt-content')); }
    catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async renderPromotions(el) {
    const promos = await API.promotions();
    el.innerHTML = `
      <div class="flex items-center justify-between mb-md">
        <h3>${promos.length} Promotions</h3>
        <button class="btn btn-primary btn-sm" onclick="MarketingModule.showNewPromo()">+ New Promotion</button>
      </div>
      <div class="card"><div class="card-body" style="padding:0">
        ${promos.length === 0 ? '<p class="text-muted text-sm" style="padding:20px;text-align:center">No promotions yet</p>' :
          UI.table([
            { label: 'Name', key: 'name' }, { label: 'Code', key: 'code', render: v => `<code style="background:var(--bg-secondary);padding:2px 6px;border-radius:3px">${v}</code>` },
            { label: 'Type', key: 'discount_type' },
            { label: 'Value', key: r => r, render: (v) => v.discount_type === 'percent' ? v.discount_value + '%' : Utils.currency(v.discount_value) },
            { label: 'Uses', key: r => r, render: (v) => `${v.uses_count}${v.max_uses ? '/' + v.max_uses : ''}` },
            { label: 'Dates', key: r => r, render: (v) => `${v.start_date || 'Any'} - ${v.end_date || 'Ongoing'}` },
            { label: 'Active', key: 'active', render: v => `<span class="badge badge-${v ? 'success' : 'secondary'}">${v ? 'Yes' : 'No'}</span>` },
          ], promos)}
      </div></div>`;
  },

  async showNewPromo() {
    const html = `
      <div class="grid grid-2 gap-sm">
        <div class="form-group"><label class="form-label">Name</label><input class="form-input" id="pr-name" placeholder="e.g. Happy Hour 20% Off"></div>
        <div class="form-group"><label class="form-label">Code (auto-generated if blank)</label><input class="form-input" id="pr-code" placeholder="HAPPY20"></div>
        <div class="form-group"><label class="form-label">Discount Type</label><select class="form-input" id="pr-dtype"><option value="percent">Percentage</option><option value="fixed">Fixed Amount</option></select></div>
        <div class="form-group"><label class="form-label">Value</label><input class="form-input" type="number" step="0.01" id="pr-value" placeholder="20"></div>
        <div class="form-group"><label class="form-label">Start Date</label><input class="form-input" type="date" id="pr-start"></div>
        <div class="form-group"><label class="form-label">End Date</label><input class="form-input" type="date" id="pr-end"></div>
        <div class="form-group"><label class="form-label">Min Order ($)</label><input class="form-input" type="number" step="0.01" id="pr-min" value="0"></div>
        <div class="form-group"><label class="form-label">Max Uses</label><input class="form-input" type="number" id="pr-max" placeholder="Unlimited"></div>
      </div>`;
    const modal = await UI.modal('New Promotion', html, { confirmText: 'Create Promotion', size: 'lg' });
    if (!modal) return;
    try {
      await API.createPromotion({ name: modal.querySelector('#pr-name').value, code: modal.querySelector('#pr-code').value || undefined, discount_type: modal.querySelector('#pr-dtype').value, discount_value: parseFloat(modal.querySelector('#pr-value').value), start_date: modal.querySelector('#pr-start').value || undefined, end_date: modal.querySelector('#pr-end').value || undefined, min_order_amount: parseFloat(modal.querySelector('#pr-min').value) || 0, max_uses: parseInt(modal.querySelector('#pr-max').value) || undefined });
      UI.toast('Success', 'Promotion created', 'success');
      this.loadTab(document.getElementById('mkt-content'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async renderLists(el) {
    const lists = await API.emailLists();
    el.innerHTML = `
      <div class="flex items-center justify-between mb-md">
        <h3>Email Lists</h3>
        <button class="btn btn-primary btn-sm" onclick="MarketingModule.showNewList()">+ New List</button>
      </div>
      ${lists.length === 0 ? '<div class="empty-state"><p>No email lists yet</p></div>' :
        `<div class="grid grid-3 gap-md">${lists.map(l => `
          <div class="card">
            <div class="card-header"><h3>${Utils.escapeHtml(l.name)}</h3></div>
            <div class="card-body">
              <div class="font-bold" style="font-size:24px">${l.subscriber_count}</div>
              <div class="text-sm text-muted">subscribers</div>
              <p class="text-sm text-muted mt-sm">${Utils.escapeHtml(l.description || '')}</p>
              <div class="flex gap-sm mt-sm">
                <button class="btn btn-sm btn-secondary" onclick="MarketingModule.autoPopulate(${l.id}, 'all')">+ All Customers</button>
                <button class="btn btn-sm btn-secondary" onclick="MarketingModule.autoPopulate(${l.id}, 'vip')">+ VIPs</button>
              </div>
            </div>
          </div>
        `).join('')}</div>`}`;
  },

  async showNewList() {
    const html = `
      <div class="form-group"><label class="form-label">List Name</label><input class="form-input" id="el-name" placeholder="e.g. Newsletter Subscribers"></div>
      <div class="form-group"><label class="form-label">Description</label><input class="form-input" id="el-desc"></div>`;
    const modal = await UI.modal('New Email List', html, { confirmText: 'Create List' });
    if (!modal) return;
    try {
      await API.createEmailList({ name: modal.querySelector('#el-name').value, description: modal.querySelector('#el-desc').value });
      UI.toast('Success', 'Email list created', 'success');
      this.loadTab(document.getElementById('mkt-content'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async autoPopulate(listId, segment) {
    try { const r = await API.autoPopulateList(listId, segment); UI.toast('Populated', r.message, 'success'); this.loadTab(document.getElementById('mkt-content')); }
    catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  destroy() {},
};
