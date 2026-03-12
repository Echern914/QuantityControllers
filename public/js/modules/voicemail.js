/* ============================================================
   VENUECORE - Voicemail & Phone System Module
   Create voicemail lines (traditional or AI) and manage messages
   ============================================================ */
const VoicemailModule = {
  tab: 'dashboard',

  async render(container) {
    container.innerHTML = `
      <div class="animate-fade">
        <div class="module-tabs" id="vm-tabs">
          <button class="tab-btn active" data-tab="dashboard">Dashboard</button>
          <button class="tab-btn" data-tab="lines">Voicemail Lines</button>
          <button class="tab-btn" data-tab="messages">Messages</button>
          <button class="tab-btn" data-tab="missed">Missed Calls</button>
          <button class="tab-btn" data-tab="setup">Setup Guide</button>
        </div>
        <div id="vm-content"></div>
      </div>`;
    container.querySelector('#vm-tabs').addEventListener('click', e => {
      if (e.target.classList.contains('tab-btn')) {
        container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.tab = e.target.dataset.tab;
        this.loadTab(container.querySelector('#vm-content'));
      }
    });
    this.loadTab(container.querySelector('#vm-content'));
  },

  async loadTab(el) {
    UI.loading(el);
    try {
      switch (this.tab) {
        case 'dashboard': return await this.renderDashboard(el);
        case 'lines': return await this.renderLines(el);
        case 'messages': return await this.renderMessages(el);
        case 'missed': return await this.renderMissedCalls(el);
        case 'setup': return await this.renderSetup(el);
      }
    } catch (err) { el.innerHTML = `<div class="empty-state"><p>${Utils.escapeHtml(err.message)}</p></div>`; }
  },

  // ============================================================
  // DASHBOARD
  // ============================================================
  async renderDashboard(el) {
    const d = await API.get('/api/voicemail/dashboard');
    el.innerHTML = `
      <div class="grid grid-4 gap-md mb-md">
        ${UI.statCard('Active Lines', d.active_lines, '')}
        ${UI.statCard('Unread Messages', d.unread_messages, '')}
        ${UI.statCard('Today\'s Calls', d.today_messages, '')}
        ${UI.statCard('Pending Callbacks', d.pending_callbacks, '')}
      </div>
      <div class="grid grid-3 gap-md mb-md">
        <div class="card" style="border-left:4px solid var(--danger)">
          <div class="card-body" style="text-align:center">
            <div style="font-size:2rem;font-weight:700;color:var(--danger)">${d.today_missed_calls || 0}</div>
            <div class="text-sm text-muted">Missed Calls Today</div>
          </div>
        </div>
        <div class="card" style="border-left:4px solid var(--warning)">
          <div class="card-body" style="text-align:center">
            <div style="font-size:2rem;font-weight:700;color:var(--warning)">${d.unreturned_missed_calls || 0}</div>
            <div class="text-sm text-muted">Unreturned Missed Calls</div>
          </div>
        </div>
        <div class="card" style="border-left:4px solid var(--success)">
          <div class="card-body" style="text-align:center">
            <div style="font-size:2rem;font-weight:700;color:var(--success)">${d.total_missed_calls > 0 ? Math.round(((d.total_missed_calls - d.unreturned_missed_calls) / d.total_missed_calls) * 100) : 100}%</div>
            <div class="text-sm text-muted">Return Rate</div>
          </div>
        </div>
      </div>
      <div class="grid grid-2 gap-md mb-md">
        <div class="card">
          <div class="card-header flex items-center justify-between">
            <h3>Your Voicemail Lines</h3>
            <button class="btn btn-primary btn-sm" onclick="VoicemailModule.tab='lines';document.querySelector('[data-tab=lines]').click()">Manage</button>
          </div>
          <div class="card-body" style="padding:0">
            ${d.lines.length === 0 ? '<p class="text-muted text-sm" style="padding:20px;text-align:center">No voicemail lines configured yet. Create one to get started!</p>' :
              `<table class="data-table"><thead><tr>
                <th>Name</th><th>Mode</th><th>Phone Number</th><th>Status</th>
              </tr></thead><tbody>
                ${d.lines.map(l => `<tr>
                  <td><strong>${Utils.escapeHtml(l.name)}</strong></td>
                  <td><span class="badge ${l.mode === 'ai' ? 'badge-info' : 'badge-default'}">${l.mode === 'ai' ? 'AI Automated' : 'Traditional'}</span></td>
                  <td>${l.phone_number || '<span class="text-muted">Not assigned</span>'}</td>
                  <td><span class="badge ${l.active ? 'badge-success' : 'badge-danger'}">${l.active ? 'Active' : 'Inactive'}</span></td>
                </tr>`).join('')}
              </tbody></table>`}
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h3>Recent Messages</h3></div>
          <div class="card-body" style="padding:0">
            ${d.recent_messages.length === 0 ? '<p class="text-muted text-sm" style="padding:20px;text-align:center">No messages yet</p>' :
              `<table class="data-table"><thead><tr>
                <th>Caller</th><th>Reason</th><th>Time</th><th>Status</th>
              </tr></thead><tbody>
                ${d.recent_messages.map(m => `<tr>
                  <td>${Utils.escapeHtml(m.caller_name || m.caller_phone || 'Unknown')}</td>
                  <td>${Utils.escapeHtml((m.reason || m.ai_summary || '').substring(0, 50))}${(m.reason || '').length > 50 ? '...' : ''}</td>
                  <td>${Utils.relativeTime ? Utils.relativeTime(m.created_at) : new Date(m.created_at).toLocaleString()}</td>
                  <td><span class="badge ${m.status === 'new' ? 'badge-warning' : m.status === 'read' ? 'badge-success' : 'badge-default'}">${m.status}</span></td>
                </tr>`).join('')}
              </tbody></table>`}
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-header flex items-center justify-between">
          <h3>Recent Missed Calls</h3>
          <button class="btn btn-sm btn-outline" onclick="VoicemailModule.tab='missed';document.querySelector('[data-tab=missed]').click()">View All</button>
        </div>
        <div class="card-body" style="padding:0">
          ${(d.recent_missed_calls || []).length === 0 ? '<p class="text-muted text-sm" style="padding:20px;text-align:center">No missed calls</p>' :
            `<table class="data-table"><thead><tr>
              <th>Caller</th><th>Location</th><th>Line</th><th>Time</th><th>Returned</th>
            </tr></thead><tbody>
              ${d.recent_missed_calls.map(c => `<tr>
                <td><strong>${Utils.escapeHtml(c.caller_phone || 'Unknown')}</strong></td>
                <td>${Utils.escapeHtml([c.caller_city, c.caller_state].filter(Boolean).join(', ') || '-')}</td>
                <td>${Utils.escapeHtml(c.line_name || '-')}</td>
                <td>${new Date(c.created_at).toLocaleString()}</td>
                <td>${c.returned ? '<span class="badge badge-success">Returned</span>' : '<span class="badge badge-danger">Not Returned</span>'}</td>
              </tr>`).join('')}
            </tbody></table>`}
        </div>
      </div>`;
  },

  // ============================================================
  // VOICEMAIL LINES
  // ============================================================
  async renderLines(el) {
    const lines = await API.get('/api/voicemail/lines');
    el.innerHTML = `
      <div class="flex items-center justify-between mb-md">
        <h3 style="margin:0">Voicemail Lines</h3>
        <button class="btn btn-primary" onclick="VoicemailModule.showCreateLineModal()">+ New Line</button>
      </div>
      ${lines.length === 0 ? `
        <div class="empty-state">
          <h3>No voicemail lines yet</h3>
          <p>Create your first voicemail line to start receiving calls.</p>
          <button class="btn btn-primary" onclick="VoicemailModule.showCreateLineModal()">Create Voicemail Line</button>
        </div>` :
        `<div class="grid grid-2 gap-md">
          ${lines.map(l => `
            <div class="card">
              <div class="card-header flex items-center justify-between">
                <div>
                  <h3 style="margin:0">${Utils.escapeHtml(l.name)}</h3>
                  <span class="text-sm text-muted">${l.phone_number || 'No phone number assigned'}</span>
                </div>
                <div class="flex gap-sm">
                  <span class="badge ${l.mode === 'ai' ? 'badge-info' : 'badge-default'}">${l.mode === 'ai' ? 'AI Automated' : 'Traditional'}</span>
                  <span class="badge ${l.active ? 'badge-success' : 'badge-danger'}">${l.active ? 'Active' : 'Inactive'}</span>
                </div>
              </div>
              <div class="card-body">
                <div class="text-sm mb-sm"><strong>Greeting:</strong> ${Utils.escapeHtml((l.greeting_text || 'Default greeting').substring(0, 100))}${(l.greeting_text || '').length > 100 ? '...' : ''}</div>
                <div class="text-sm mb-sm"><strong>Callback window:</strong> ${l.callback_hours} hours</div>
                ${l.mode === 'ai' ? '<div class="text-sm mb-sm" style="color:var(--primary)">AI will answer calls, collect caller info, and create messages automatically</div>' :
                  '<div class="text-sm mb-sm">Callers hear greeting and leave a recorded message</div>'}
                <div class="flex gap-sm" style="margin-top:12px">
                  <button class="btn btn-sm btn-outline" onclick="VoicemailModule.editLine(${l.id})">Edit</button>
                  <button class="btn btn-sm ${l.active ? 'btn-warning' : 'btn-success'}" onclick="VoicemailModule.toggleLine(${l.id}, ${l.active ? 0 : 1})">${l.active ? 'Disable' : 'Enable'}</button>
                  <button class="btn btn-sm btn-danger" onclick="VoicemailModule.deleteLine(${l.id}, '${Utils.escapeHtml(l.name)}')">Delete</button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>`}`;
  },

  showCreateLineModal() {
    const modal = UI.modal('Create Voicemail Line', `
      <div class="form-group">
        <label>Line Name</label>
        <input type="text" id="vm-line-name" class="form-control" placeholder="e.g., Main Voicemail, After Hours">
      </div>
      <div class="form-group">
        <label>Mode</label>
        <select id="vm-line-mode" class="form-control" onchange="VoicemailModule.toggleModeOptions()">
          <option value="traditional">Traditional Voicemail (record a message)</option>
          <option value="ai">AI Automated (AI answers and collects info)</option>
        </select>
      </div>
      <div class="form-group">
        <label>Restaurant Name (for greeting)</label>
        <input type="text" id="vm-line-restaurant" class="form-control" placeholder="Your Restaurant Name" value="${Utils.escapeHtml(document.title.replace(' - VenueCore', ''))}">
      </div>
      <div class="form-group">
        <label>Custom Greeting Message</label>
        <textarea id="vm-line-greeting" class="form-control" rows="4" placeholder="Leave blank for default greeting..."></textarea>
        <small class="text-muted" id="vm-greeting-hint">Default: "Thank you for calling [Restaurant]. Please leave a message after the beep."</small>
      </div>
      <div class="form-group">
        <label>Callback Window (hours)</label>
        <input type="number" id="vm-line-callback" class="form-control" value="2" min="1" max="48">
      </div>
      <div id="vm-traditional-opts">
        <div class="form-group">
          <label>Max Recording Length (seconds)</label>
          <input type="number" id="vm-line-maxrecord" class="form-control" value="120" min="30" max="300">
        </div>
      </div>
      <div id="vm-ai-opts" style="display:none">
        <div class="form-group">
          <label>AI Personality Notes (optional)</label>
          <textarea id="vm-line-personality" class="form-control" rows="3" placeholder="e.g., Be extra friendly, mention our daily specials, speak in a warm Southern tone..."></textarea>
        </div>
      </div>
      <div class="form-group">
        <label>Phone Number</label>
        <div class="flex gap-sm">
          <input type="text" id="vm-line-phone" class="form-control" placeholder="Assign after setup or search for one">
          <button class="btn btn-outline btn-sm" onclick="VoicemailModule.searchNumbers()">Search Numbers</button>
        </div>
        <div id="vm-number-results" style="margin-top:8px"></div>
      </div>
    `, [
      { label: 'Cancel', class: 'btn-outline', onclick: () => modal.close() },
      { label: 'Create Line', class: 'btn-primary', onclick: () => this.createLine(modal) },
    ]);
  },

  toggleModeOptions() {
    const mode = document.getElementById('vm-line-mode').value;
    const tradOpts = document.getElementById('vm-traditional-opts');
    const aiOpts = document.getElementById('vm-ai-opts');
    const hint = document.getElementById('vm-greeting-hint');
    if (tradOpts) tradOpts.style.display = mode === 'traditional' ? '' : 'none';
    if (aiOpts) aiOpts.style.display = mode === 'ai' ? '' : 'none';
    if (hint) hint.textContent = mode === 'ai'
      ? 'Default: AI will greet callers, explain staff are busy, and collect their name, number, and reason.'
      : 'Default: "Thank you for calling [Restaurant]. Please leave a message after the beep."';
  },

  async searchNumbers() {
    const resultsEl = document.getElementById('vm-number-results');
    const areaCode = prompt('Enter area code to search (e.g., 212, 310):');
    if (!areaCode) return;
    resultsEl.innerHTML = '<span class="text-muted text-sm">Searching available numbers...</span>';
    try {
      const numbers = await API.post('/api/voicemail/numbers/search', { area_code: areaCode });
      if (numbers.length === 0) {
        resultsEl.innerHTML = '<span class="text-muted text-sm">No numbers found for that area code. Try another.</span>';
        return;
      }
      resultsEl.innerHTML = `
        <div style="max-height:150px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:4px">
          ${numbers.map(n => `
            <div class="flex items-center justify-between" style="padding:6px 10px;border-bottom:1px solid var(--border-light);cursor:pointer"
                 onclick="document.getElementById('vm-line-phone').value='${n.phoneNumber}';document.getElementById('vm-number-results').innerHTML=''">
              <span><strong>${n.phoneNumber}</strong> <span class="text-muted text-sm">${n.locality || ''} ${n.region || ''}</span></span>
              <span class="text-sm">$${n.monthlyPrice}/mo</span>
            </div>
          `).join('')}
        </div>`;
    } catch (err) {
      resultsEl.innerHTML = `<span class="text-danger text-sm">${Utils.escapeHtml(err.message)}</span>`;
    }
  },

  async createLine(modal) {
    const name = document.getElementById('vm-line-name').value.trim();
    if (!name) return alert('Line name is required');
    try {
      await API.post('/api/voicemail/lines', {
        name,
        mode: document.getElementById('vm-line-mode').value,
        restaurant_name: document.getElementById('vm-line-restaurant').value.trim(),
        greeting_text: document.getElementById('vm-line-greeting').value.trim(),
        callback_hours: parseInt(document.getElementById('vm-line-callback').value) || 2,
        max_recording_seconds: parseInt(document.getElementById('vm-line-maxrecord')?.value) || 120,
        ai_personality: document.getElementById('vm-line-personality')?.value.trim() || '',
        phone_number: document.getElementById('vm-line-phone').value.trim() || null,
      });
      modal.close();
      this.loadTab(document.getElementById('vm-content'));
    } catch (err) { alert(err.message); }
  },

  async editLine(id) {
    const line = await API.get(`/api/voicemail/lines/${id}`);
    const modal = UI.modal('Edit Voicemail Line', `
      <div class="form-group">
        <label>Line Name</label>
        <input type="text" id="vm-edit-name" class="form-control" value="${Utils.escapeHtml(line.name)}">
      </div>
      <div class="form-group">
        <label>Mode</label>
        <select id="vm-edit-mode" class="form-control">
          <option value="traditional" ${line.mode === 'traditional' ? 'selected' : ''}>Traditional Voicemail</option>
          <option value="ai" ${line.mode === 'ai' ? 'selected' : ''}>AI Automated</option>
        </select>
      </div>
      <div class="form-group">
        <label>Restaurant Name</label>
        <input type="text" id="vm-edit-restaurant" class="form-control" value="${Utils.escapeHtml(line.restaurant_name || '')}">
      </div>
      <div class="form-group">
        <label>Custom Greeting</label>
        <textarea id="vm-edit-greeting" class="form-control" rows="4">${Utils.escapeHtml(line.greeting_text || '')}</textarea>
      </div>
      <div class="form-group">
        <label>Callback Window (hours)</label>
        <input type="number" id="vm-edit-callback" class="form-control" value="${line.callback_hours || 2}" min="1" max="48">
      </div>
      <div class="form-group">
        <label>Max Recording (seconds)</label>
        <input type="number" id="vm-edit-maxrecord" class="form-control" value="${line.max_recording_seconds || 120}">
      </div>
      <div class="form-group">
        <label>AI Personality Notes</label>
        <textarea id="vm-edit-personality" class="form-control" rows="3">${Utils.escapeHtml(line.ai_personality || '')}</textarea>
      </div>
      <div class="form-group">
        <label>Phone Number</label>
        <input type="text" id="vm-edit-phone" class="form-control" value="${Utils.escapeHtml(line.phone_number || '')}">
      </div>
    `, [
      { label: 'Cancel', class: 'btn-outline', onclick: () => modal.close() },
      { label: 'Save Changes', class: 'btn-primary', onclick: async () => {
        try {
          await API.put(`/api/voicemail/lines/${id}`, {
            name: document.getElementById('vm-edit-name').value.trim(),
            mode: document.getElementById('vm-edit-mode').value,
            restaurant_name: document.getElementById('vm-edit-restaurant').value.trim(),
            greeting_text: document.getElementById('vm-edit-greeting').value.trim(),
            callback_hours: parseInt(document.getElementById('vm-edit-callback').value) || 2,
            max_recording_seconds: parseInt(document.getElementById('vm-edit-maxrecord').value) || 120,
            ai_personality: document.getElementById('vm-edit-personality').value.trim(),
            phone_number: document.getElementById('vm-edit-phone').value.trim() || null,
          });
          modal.close();
          this.loadTab(document.getElementById('vm-content'));
        } catch (err) { alert(err.message); }
      }},
    ]);
  },

  async toggleLine(id, active) {
    try {
      await API.put(`/api/voicemail/lines/${id}`, { active });
      this.loadTab(document.getElementById('vm-content'));
    } catch (err) { alert(err.message); }
  },

  async deleteLine(id, name) {
    if (!confirm(`Delete voicemail line "${name}"? This will also delete all associated messages.`)) return;
    try {
      await API.delete(`/api/voicemail/lines/${id}`);
      this.loadTab(document.getElementById('vm-content'));
    } catch (err) { alert(err.message); }
  },

  // ============================================================
  // MESSAGES
  // ============================================================
  async renderMessages(el) {
    const messages = await API.get('/api/voicemail/messages');
    el.innerHTML = `
      <div class="flex items-center justify-between mb-md">
        <h3 style="margin:0">Voicemail Messages (${messages.length})</h3>
        <div class="flex gap-sm">
          <select id="vm-msg-filter" class="form-control" style="width:auto" onchange="VoicemailModule.filterMessages()">
            <option value="">All Messages</option>
            <option value="new">Unread</option>
            <option value="read">Read</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>
      ${messages.length === 0 ? '<div class="empty-state"><h3>No messages yet</h3><p>Messages will appear here when callers leave voicemails.</p></div>' :
        `<div class="card"><div class="card-body" style="padding:0">
          <table class="data-table" id="vm-messages-table"><thead><tr>
            <th>Status</th><th>Caller</th><th>Phone</th><th>Reason</th><th>Urgency</th><th>Duration</th><th>Time</th><th>Actions</th>
          </tr></thead><tbody>
            ${messages.map(m => `<tr data-status="${m.status}" style="${m.status === 'new' ? 'background:rgba(99,102,241,0.05)' : ''}">
              <td><span class="badge ${m.status === 'new' ? 'badge-warning' : m.status === 'read' ? 'badge-success' : 'badge-default'}">${m.status}</span></td>
              <td><strong>${Utils.escapeHtml(m.caller_name || 'Unknown')}</strong></td>
              <td>${Utils.escapeHtml(m.caller_phone || '-')}</td>
              <td title="${Utils.escapeHtml(m.reason || m.ai_summary || '')}">${Utils.escapeHtml((m.reason || m.ai_summary || '-').substring(0, 40))}${(m.reason || '').length > 40 ? '...' : ''}</td>
              <td><span class="badge ${m.urgency === 'high' ? 'badge-danger' : m.urgency === 'medium' ? 'badge-warning' : 'badge-default'}">${m.urgency || 'medium'}</span></td>
              <td>${m.duration_seconds ? m.duration_seconds + 's' : '-'}</td>
              <td>${new Date(m.created_at).toLocaleString()}</td>
              <td>
                <div class="flex gap-xs">
                  <button class="btn btn-xs btn-outline" onclick="VoicemailModule.viewMessage(${m.id})">View</button>
                  ${m.status === 'new' ? `<button class="btn btn-xs btn-success" onclick="VoicemailModule.markRead(${m.id})">Read</button>` : ''}
                  ${m.caller_phone && !m.callback_completed ? `<button class="btn btn-xs btn-primary" onclick="VoicemailModule.markCallback(${m.id})">Called Back</button>` : ''}
                  <button class="btn btn-xs btn-danger" onclick="VoicemailModule.deleteMessage(${m.id})">Del</button>
                </div>
              </td>
            </tr>`).join('')}
          </tbody></table>
        </div></div>`}`;
  },

  filterMessages() {
    const filter = document.getElementById('vm-msg-filter').value;
    const rows = document.querySelectorAll('#vm-messages-table tbody tr');
    rows.forEach(row => {
      if (!filter || row.dataset.status === filter) {
        row.style.display = '';
      } else {
        row.style.display = 'none';
      }
    });
  },

  async viewMessage(id) {
    const m = await API.get(`/api/voicemail/messages/${id}`);
    // Auto-mark as read
    if (m.status === 'new') {
      await API.put(`/api/voicemail/messages/${id}`, { status: 'read' });
    }
    const modal = UI.modal('Voicemail Message', `
      <div class="grid grid-2 gap-md mb-md">
        <div><strong>Caller Name:</strong><br>${Utils.escapeHtml(m.caller_name || 'Unknown')}</div>
        <div><strong>Phone:</strong><br>${Utils.escapeHtml(m.caller_phone || 'Not provided')}</div>
        <div><strong>Urgency:</strong><br><span class="badge ${m.urgency === 'high' ? 'badge-danger' : m.urgency === 'medium' ? 'badge-warning' : 'badge-default'}">${m.urgency || 'medium'}</span></div>
        <div><strong>Duration:</strong><br>${m.duration_seconds ? m.duration_seconds + ' seconds' : 'N/A'}</div>
        <div><strong>Received:</strong><br>${new Date(m.created_at).toLocaleString()}</div>
        <div><strong>Callback:</strong><br>${m.callback_completed ? 'Completed at ' + new Date(m.callback_at).toLocaleString() : 'Pending'}</div>
      </div>
      ${m.reason ? `<div class="mb-md"><strong>Reason for Calling:</strong><p>${Utils.escapeHtml(m.reason)}</p></div>` : ''}
      ${m.ai_summary ? `<div class="mb-md"><strong>AI Summary:</strong><p>${Utils.escapeHtml(m.ai_summary)}</p></div>` : ''}
      ${m.transcription ? `<div class="mb-md"><strong>Transcription:</strong><p style="background:var(--bg-secondary);padding:12px;border-radius:8px;font-style:italic">${Utils.escapeHtml(m.transcription)}</p></div>` : ''}
      ${m.recording_url ? `<div class="mb-md"><strong>Recording:</strong><br><audio controls src="${m.recording_url}.mp3" style="width:100%;margin-top:8px"></audio></div>` : ''}
      <div class="form-group">
        <label>Notes</label>
        <textarea id="vm-msg-notes" class="form-control" rows="3" placeholder="Add internal notes...">${Utils.escapeHtml(m.notes || '')}</textarea>
      </div>
    `, [
      { label: 'Close', class: 'btn-outline', onclick: () => { modal.close(); this.loadTab(document.getElementById('vm-content')); }},
      { label: 'Save Notes', class: 'btn-primary', onclick: async () => {
        try {
          await API.put(`/api/voicemail/messages/${id}`, { notes: document.getElementById('vm-msg-notes').value });
          modal.close();
          this.loadTab(document.getElementById('vm-content'));
        } catch (err) { alert(err.message); }
      }},
    ]);
  },

  async markRead(id) {
    await API.put(`/api/voicemail/messages/${id}`, { status: 'read' });
    this.loadTab(document.getElementById('vm-content'));
  },

  async markCallback(id) {
    await API.put(`/api/voicemail/messages/${id}`, { callback_completed: 1 });
    this.loadTab(document.getElementById('vm-content'));
  },

  async deleteMessage(id) {
    if (!confirm('Delete this message?')) return;
    await API.delete(`/api/voicemail/messages/${id}`);
    this.loadTab(document.getElementById('vm-content'));
  },

  // ============================================================
  // MISSED CALLS
  // ============================================================
  async renderMissedCalls(el) {
    const [calls, stats] = await Promise.all([
      API.get('/api/voicemail/missed-calls'),
      API.get('/api/voicemail/missed-calls/stats'),
    ]);

    el.innerHTML = `
      <div class="grid grid-4 gap-md mb-md">
        <div class="card" style="border-left:4px solid var(--danger)">
          <div class="card-body" style="text-align:center">
            <div style="font-size:1.8rem;font-weight:700;color:var(--danger)">${stats.today}</div>
            <div class="text-sm text-muted">Today</div>
          </div>
        </div>
        <div class="card" style="border-left:4px solid var(--warning)">
          <div class="card-body" style="text-align:center">
            <div style="font-size:1.8rem;font-weight:700;color:var(--warning)">${stats.unreturned}</div>
            <div class="text-sm text-muted">Unreturned</div>
          </div>
        </div>
        <div class="card" style="border-left:4px solid var(--info)">
          <div class="card-body" style="text-align:center">
            <div style="font-size:1.8rem;font-weight:700">${stats.this_week}</div>
            <div class="text-sm text-muted">This Week</div>
          </div>
        </div>
        <div class="card" style="border-left:4px solid var(--success)">
          <div class="card-body" style="text-align:center">
            <div style="font-size:1.8rem;font-weight:700;color:var(--success)">${stats.return_rate}%</div>
            <div class="text-sm text-muted">Return Rate</div>
          </div>
        </div>
      </div>

      ${stats.frequent_callers.length > 0 ? `
      <div class="card mb-md">
        <div class="card-header"><h3>Repeat Missed Callers</h3></div>
        <div class="card-body" style="padding:0">
          <table class="data-table"><thead><tr>
            <th>Phone Number</th><th>Times Missed</th><th>Last Call</th><th>Status</th><th>Action</th>
          </tr></thead><tbody>
            ${stats.frequent_callers.map(c => `<tr>
              <td><strong>${Utils.escapeHtml(c.caller_phone)}</strong></td>
              <td><span class="badge badge-danger">${c.call_count}x</span></td>
              <td>${new Date(c.last_call).toLocaleString()}</td>
              <td>${c.any_unreturned === 0 ? '<span class="badge badge-success">All Returned</span>' : '<span class="badge badge-warning">Has Unreturned</span>'}</td>
              <td><button class="btn btn-xs btn-primary" onclick="VoicemailModule.returnCallsByPhone('${Utils.escapeHtml(c.caller_phone)}')">Mark All Returned</button></td>
            </tr>`).join('')}
          </tbody></table>
        </div>
      </div>` : ''}

      ${stats.by_hour.length > 0 ? `
      <div class="card mb-md">
        <div class="card-header"><h3>Missed Calls by Hour (Last 30 Days)</h3></div>
        <div class="card-body">
          <div style="display:flex;align-items:flex-end;gap:2px;height:120px;padding:0 4px">
            ${Array.from({length: 24}, (_, h) => {
              const hourData = stats.by_hour.find(b => b.hour === h);
              const count = hourData ? hourData.count : 0;
              const maxCount = Math.max(...stats.by_hour.map(b => b.count), 1);
              const height = Math.max((count / maxCount) * 100, 2);
              const label = h === 0 ? '12a' : h < 12 ? h + 'a' : h === 12 ? '12p' : (h-12) + 'p';
              return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">
                <div class="text-xs" style="color:var(--text-muted)">${count || ''}</div>
                <div style="width:100%;height:${height}%;background:${count > 0 ? 'var(--danger)' : 'var(--border)'};border-radius:3px 3px 0 0;min-height:2px" title="${label}: ${count} missed calls"></div>
                <div class="text-xs" style="color:var(--text-muted);font-size:0.65rem">${h % 3 === 0 ? label : ''}</div>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>` : ''}

      <div class="flex items-center justify-between mb-md">
        <h3 style="margin:0">All Missed Calls (${calls.length})</h3>
        <div class="flex gap-sm">
          <select id="mc-filter" class="form-control" style="width:auto" onchange="VoicemailModule.filterMissedCalls()">
            <option value="">All</option>
            <option value="unreturned">Unreturned Only</option>
            <option value="returned">Returned Only</option>
          </select>
          ${calls.filter(c => !c.returned).length > 0 ? `<button class="btn btn-sm btn-primary" onclick="VoicemailModule.markAllReturned()">Mark All Returned</button>` : ''}
        </div>
      </div>

      ${calls.length === 0 ? '<div class="empty-state"><h3>No missed calls</h3><p>Missed calls will appear here when callers hang up without leaving a voicemail.</p></div>' :
        `<div class="card"><div class="card-body" style="padding:0">
          <table class="data-table" id="mc-table"><thead><tr>
            <th>Status</th><th>Caller</th><th>Location</th><th>Line</th><th>Type</th><th>Time</th><th>Actions</th>
          </tr></thead><tbody>
            ${calls.map(c => `<tr data-returned="${c.returned}" data-id="${c.id}" style="${!c.returned ? 'background:rgba(239,68,68,0.05)' : ''}">
              <td>${c.returned ? '<span class="badge badge-success">Returned</span>' : '<span class="badge badge-danger">Missed</span>'}</td>
              <td><strong>${Utils.escapeHtml(c.caller_phone || 'Unknown')}</strong></td>
              <td>${Utils.escapeHtml([c.caller_city, c.caller_state].filter(Boolean).join(', ') || '-')}</td>
              <td>${Utils.escapeHtml(c.line_name || '-')}</td>
              <td><span class="badge badge-default">${c.call_status || 'no-answer'}</span></td>
              <td>${new Date(c.created_at).toLocaleString()}</td>
              <td>
                <div class="flex gap-xs">
                  ${!c.returned ? `<button class="btn btn-xs btn-success" onclick="VoicemailModule.markCallReturned(${c.id})">Returned</button>` : ''}
                  <button class="btn btn-xs btn-outline" onclick="VoicemailModule.addMissedCallNote(${c.id})">Note</button>
                  <button class="btn btn-xs btn-danger" onclick="VoicemailModule.deleteMissedCall(${c.id})">Del</button>
                </div>
              </td>
            </tr>`).join('')}
          </tbody></table>
        </div></div>`}`;
  },

  filterMissedCalls() {
    const filter = document.getElementById('mc-filter').value;
    const rows = document.querySelectorAll('#mc-table tbody tr');
    rows.forEach(row => {
      if (!filter) { row.style.display = ''; return; }
      const returned = row.dataset.returned === '1';
      row.style.display = (filter === 'returned' && returned) || (filter === 'unreturned' && !returned) ? '' : 'none';
    });
  },

  async markCallReturned(id) {
    await API.put(`/api/voicemail/missed-calls/${id}`, { returned: 1 });
    this.loadTab(document.getElementById('vm-content'));
  },

  async markAllReturned() {
    const rows = document.querySelectorAll('#mc-table tbody tr[data-returned="0"]');
    const ids = Array.from(rows).map(r => parseInt(r.dataset.id));
    if (ids.length === 0) return;
    if (!confirm(`Mark ${ids.length} missed call(s) as returned?`)) return;
    await API.post('/api/voicemail/missed-calls/return-all', { ids });
    this.loadTab(document.getElementById('vm-content'));
  },

  async returnCallsByPhone(phone) {
    const calls = await API.get('/api/voicemail/missed-calls?returned=0');
    const ids = calls.filter(c => c.caller_phone === phone).map(c => c.id);
    if (ids.length === 0) return alert('All calls from this number are already returned.');
    await API.post('/api/voicemail/missed-calls/return-all', { ids });
    this.loadTab(document.getElementById('vm-content'));
  },

  async addMissedCallNote(id) {
    const note = prompt('Add a note for this missed call:');
    if (note === null) return;
    await API.put(`/api/voicemail/missed-calls/${id}`, { notes: note });
    this.loadTab(document.getElementById('vm-content'));
  },

  async deleteMissedCall(id) {
    if (!confirm('Delete this missed call record?')) return;
    await API.delete(`/api/voicemail/missed-calls/${id}`);
    this.loadTab(document.getElementById('vm-content'));
  },

  // ============================================================
  // SETUP GUIDE
  // ============================================================
  async renderSetup(el) {
    el.innerHTML = `
      <div class="card mb-md">
        <div class="card-header"><h3>Getting Started with VenueCore Voicemail</h3></div>
        <div class="card-body">
          <p class="mb-md">VenueCore's voicemail system lets you set up phone lines for your restaurant with two modes:</p>
          <div class="grid grid-2 gap-md mb-lg">
            <div class="card" style="border:2px solid var(--border)">
              <div class="card-header"><h3>Traditional Voicemail</h3></div>
              <div class="card-body">
                <ul style="list-style:disc;padding-left:20px;line-height:1.8">
                  <li>Record a custom greeting for your restaurant</li>
                  <li>Callers hear your greeting and leave a recorded message</li>
                  <li>Messages are transcribed automatically</li>
                  <li>AI extracts caller info from the transcription</li>
                  <li>Best for: simple, familiar voicemail experience</li>
                </ul>
              </div>
            </div>
            <div class="card" style="border:2px solid var(--primary)">
              <div class="card-header" style="background:var(--primary);color:white"><h3 style="color:white">AI Automated Voicemail</h3></div>
              <div class="card-body">
                <ul style="list-style:disc;padding-left:20px;line-height:1.8">
                  <li>AI answers the call as your restaurant's virtual assistant</li>
                  <li>Greets callers warmly and explains staff are busy</li>
                  <li>Collects caller's <strong>name</strong>, <strong>callback number</strong>, and <strong>reason for calling</strong></li>
                  <li>Confirms info back to the caller</li>
                  <li>Best for: professional, interactive caller experience</li>
                </ul>
              </div>
            </div>
          </div>

          <h3>Setup Steps</h3>
          <div class="mb-md" style="line-height:2">
            <div class="flex items-center gap-sm mb-sm">
              <span class="badge badge-info" style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center">1</span>
              <strong>Add Twilio credentials to your .env file</strong>
            </div>
            <div style="background:var(--bg-secondary);padding:16px;border-radius:8px;font-family:monospace;margin-bottom:16px;font-size:0.85rem">
              TWILIO_ACCOUNT_SID=your_account_sid<br>
              TWILIO_AUTH_TOKEN=your_auth_token<br>
              TWILIO_PHONE_NUMBER=+1234567890<br>
              BASE_URL=https://your-domain.com
            </div>

            <div class="flex items-center gap-sm mb-sm">
              <span class="badge badge-info" style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center">2</span>
              <strong>Install the Twilio package</strong>
            </div>
            <div style="background:var(--bg-secondary);padding:16px;border-radius:8px;font-family:monospace;margin-bottom:16px;font-size:0.85rem">
              npm install twilio
            </div>

            <div class="flex items-center gap-sm mb-sm">
              <span class="badge badge-info" style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center">3</span>
              <strong>Create a voicemail line</strong> - Go to the "Voicemail Lines" tab and click "+ New Line"
            </div>

            <div class="flex items-center gap-sm mb-sm">
              <span class="badge badge-info" style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center">4</span>
              <strong>Search and provision a phone number</strong> - Use the number search when creating a line, or add one manually
            </div>

            <div class="flex items-center gap-sm mb-sm">
              <span class="badge badge-info" style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center">5</span>
              <strong>Customize your greeting</strong> - Write your own or let the AI generate a default one
            </div>

            <div class="flex items-center gap-sm mb-sm">
              <span class="badge badge-info" style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center">6</span>
              <strong>Go live!</strong> - Calls to your number will be handled automatically
            </div>
          </div>

          <div class="card" style="background:var(--bg-secondary);border:1px solid var(--border)">
            <div class="card-body">
              <p style="margin:0"><strong>Note:</strong> You can create and configure voicemail lines right now without Twilio credentials.
              The lines will be ready to go once you connect your Twilio account. You can also test the system by manually adding messages through the API.</p>
            </div>
          </div>
        </div>
      </div>`;
  },
};
