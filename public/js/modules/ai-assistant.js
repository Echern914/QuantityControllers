/* ============================================================
   VENUECORE AI - Full-Capability Intelligent Assistant
   Tool-use enabled, conversation history, rich rendering
   ============================================================ */
const AIAssistant = {
  messages: [],

  async render(container) {
    container.innerHTML = `<div class="ai-container">
      <div class="ai-header">
        <div class="ai-header-left">
          <div class="ai-logo">VC<span style="color:#a78bfa">AI</span></div>
          <div>
            <div class="ai-title">VenueCore AI Assistant</div>
            <div class="ai-subtitle">Full system access - ask anything or request any action</div>
          </div>
        </div>
        <div class="ai-header-actions">
          <button class="btn btn-sm btn-outline" onclick="AIAssistant.clearHistory()">Clear Chat</button>
        </div>
      </div>
      <div class="ai-messages" id="ai-messages">
        <div class="ai-message assistant">
          <div class="ai-msg-content">
            <strong>Welcome to VenueCore AI</strong><br><br>
            I have full access to your restaurant's data and can take actions on your behalf. Here's what I can do:<br><br>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0">
              <div style="padding:8px;background:var(--bg-primary);border-radius:6px;font-size:12px"><strong>Query & Analyze</strong><br>Sales, inventory, labor, costs, customers, any data</div>
              <div style="padding:8px;background:var(--bg-primary);border-radius:6px;font-size:12px"><strong>Menu Management</strong><br>Create items, adjust prices, 86 items, optimize</div>
              <div style="padding:8px;background:var(--bg-primary);border-radius:6px;font-size:12px"><strong>Staff & Scheduling</strong><br>Create shifts, manage employees, labor analysis</div>
              <div style="padding:8px;background:var(--bg-primary);border-radius:6px;font-size:12px"><strong>Reports & Finance</strong><br>P&L, daily reports, food cost, journal entries</div>
              <div style="padding:8px;background:var(--bg-primary);border-radius:6px;font-size:12px"><strong>Inventory & Orders</strong><br>Stock levels, reorder alerts, supplier management</div>
              <div style="padding:8px;background:var(--bg-primary);border-radius:6px;font-size:12px"><strong>System Actions</strong><br>Notifications, settings, Clover sync, customers</div>
            </div>
            Ask me anything or tell me what to do.
          </div>
        </div>
      </div>
      <div class="ai-quick-prompts" id="ai-quick-prompts">
        <button class="ai-quick-btn" onclick="AIAssistant.ask('Give me a full daily briefing - sales, labor, inventory issues, and anything I should know')">Daily Briefing</button>
        <button class="ai-quick-btn" onclick="AIAssistant.ask('Show me today\\'s sales breakdown by hour and top selling items')">Sales Today</button>
        <button class="ai-quick-btn" onclick="AIAssistant.ask('What items are low on stock and need reordering? Show par levels vs current')">Stock Check</button>
        <button class="ai-quick-btn" onclick="AIAssistant.ask('Analyze my menu performance - what\\'s selling, what\\'s not, and pricing suggestions')">Menu Analysis</button>
        <button class="ai-quick-btn" onclick="AIAssistant.ask('Show me labor costs this week broken down by employee and role')">Labor Report</button>
        <button class="ai-quick-btn" onclick="AIAssistant.ask('Generate a P&L report for this month')">P&L Report</button>
        <button class="ai-quick-btn" onclick="AIAssistant.ask('What\\'s my food cost percentage and which items have the worst margins?')">Food Cost</button>
        <button class="ai-quick-btn" onclick="AIAssistant.ask('Show me customer insights - top spenders, visit frequency, loyalty tiers')">Customers</button>
      </div>
      <div class="ai-input-area">
        <input type="text" class="form-input" id="ai-input" placeholder="Ask anything or tell me what to do..." onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();AIAssistant.sendMessage()}">
        <button class="btn btn-primary" onclick="AIAssistant.sendMessage()" id="ai-send-btn">Send</button>
      </div>
    </div>`;

    // Restore previous messages
    for (const msg of this.messages) {
      this._appendRendered(msg.role, msg.content);
    }
    this._scrollToBottom();
  },

  async sendMessage() {
    const input = document.getElementById('ai-input');
    const query = input.value.trim();
    if (!query) return;
    input.value = '';
    this.ask(query);
  },

  async ask(query) {
    this.messages.push({ role: 'user', content: query });
    this._appendRendered('user', Utils.escapeHtml(query));

    // Hide quick prompts after first message
    const prompts = document.getElementById('ai-quick-prompts');
    if (prompts && this.messages.filter(m => m.role === 'user').length > 1) {
      prompts.style.display = 'none';
    }

    // Show loading
    const loadingId = 'ai-loading-' + Date.now();
    const messagesEl = document.getElementById('ai-messages');
    const loadingEl = document.createElement('div');
    loadingEl.className = 'ai-message assistant';
    loadingEl.id = loadingId;
    loadingEl.innerHTML = `<div class="ai-msg-content"><div class="ai-thinking"><div class="spinner spinner-sm"></div><span>Analyzing your data...</span></div></div>`;
    messagesEl.appendChild(loadingEl);
    this._scrollToBottom();

    // Disable input while processing
    const sendBtn = document.getElementById('ai-send-btn');
    const inputEl = document.getElementById('ai-input');
    if (sendBtn) sendBtn.disabled = true;
    if (inputEl) inputEl.disabled = true;

    try {
      const result = await API.aiQuery(query, App.employee?.id);
      loadingEl.remove();

      const content = result.text || result.error || 'No response received.';
      this.messages.push({ role: 'assistant', content });
      this._appendRendered('assistant', this._renderMarkdown(content));
    } catch (err) {
      loadingEl.remove();
      const errorMsg = `Error: ${err.message}`;
      this.messages.push({ role: 'assistant', content: errorMsg });
      this._appendRendered('assistant', `<div style="color:var(--danger)">${Utils.escapeHtml(errorMsg)}</div>`);
    }

    if (sendBtn) sendBtn.disabled = false;
    if (inputEl) { inputEl.disabled = false; inputEl.focus(); }
  },

  _appendRendered(role, html) {
    const messagesEl = document.getElementById('ai-messages');
    if (!messagesEl) return;
    const msgEl = document.createElement('div');
    msgEl.className = `ai-message ${role} animate-fade`;
    msgEl.innerHTML = `<div class="ai-msg-content">${html}</div>`;
    messagesEl.appendChild(msgEl);
    this._scrollToBottom();
  },

  _scrollToBottom() {
    const el = document.getElementById('ai-messages');
    if (el) setTimeout(() => el.scrollTop = el.scrollHeight, 50);
  },

  async clearHistory() {
    this.messages = [];
    try { await API.post('/api/ai/clear', { employee_id: App.employee?.id }); } catch {}
    const messagesEl = document.getElementById('ai-messages');
    if (messagesEl) {
      messagesEl.innerHTML = `<div class="ai-message assistant"><div class="ai-msg-content">Chat cleared. How can I help you?</div></div>`;
    }
    const prompts = document.getElementById('ai-quick-prompts');
    if (prompts) prompts.style.display = '';
  },

  _renderMarkdown(text) {
    if (!text) return '';

    // Escape HTML first for security, then apply markdown
    let html = text;

    // Code blocks (must be before other transforms)
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      return `<pre class="ai-code-block"><code>${Utils.escapeHtml(code.trim())}</code></pre>`;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code class="ai-inline-code">$1</code>');

    // Tables (detect markdown tables)
    html = html.replace(/(?:^|\n)(\|.+\|)\n(\|[-: |]+\|)\n((?:\|.+\|\n?)+)/g, (match, header, sep, body) => {
      const headers = header.split('|').filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join('');
      const rows = body.trim().split('\n').map(row => {
        const cells = row.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('');
        return `<tr>${cells}</tr>`;
      }).join('');
      return `<table class="ai-table"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
    });

    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Italic
    html = html.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em>$1</em>');

    // Headers
    html = html.replace(/^#### (.+)$/gm, '<h4 class="ai-h">$1</h4>');
    html = html.replace(/^### (.+)$/gm, '<h3 class="ai-h">$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2 class="ai-h">$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1 class="ai-h">$1</h1>');

    // Unordered lists
    html = html.replace(/(?:^|\n)((?:- .+\n?)+)/g, (match, items) => {
      const lis = items.trim().split('\n').map(item => `<li>${item.replace(/^- /, '')}</li>`).join('');
      return `<ul class="ai-list">${lis}</ul>`;
    });

    // Ordered lists
    html = html.replace(/(?:^|\n)((?:\d+\. .+\n?)+)/g, (match, items) => {
      const lis = items.trim().split('\n').map(item => `<li>${item.replace(/^\d+\. /, '')}</li>`).join('');
      return `<ol class="ai-list">${lis}</ol>`;
    });

    // Horizontal rule
    html = html.replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--border);margin:12px 0">');

    // Line breaks
    html = html.replace(/\n\n/g, '<br><br>');
    html = html.replace(/\n/g, '<br>');

    return html;
  },

  destroy() {}
};
