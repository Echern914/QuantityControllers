const AIAssistant = {
  messages: [],

  async render(container) {
    container.innerHTML = `<div class="ai-container">
      <div class="ai-messages" id="ai-messages">
        <div class="ai-message assistant">
          <strong>Welcome to Nexus AI!</strong><br>
          I'm your intelligent restaurant assistant. Ask me anything about your sales, inventory, menu optimization, staffing, or demand forecasting. I can analyze your data and provide actionable insights.
        </div>
      </div>
      <div class="ai-quick-prompts">
        <button class="ai-quick-btn" onclick="AIAssistant.ask('What are my top sellers this week?')">Top sellers</button>
        <button class="ai-quick-btn" onclick="AIAssistant.ask('What items should I consider removing from the menu?')">Menu optimization</button>
        <button class="ai-quick-btn" onclick="AIAssistant.ask('How can I reduce food costs?')">Cut costs</button>
        <button class="ai-quick-btn" onclick="AIAssistant.ask('What should I staff for this weekend?')">Staffing advice</button>
        <button class="ai-quick-btn" onclick="AIAssistant.ask('Give me a quick daily briefing')">Daily briefing</button>
        <button class="ai-quick-btn" onclick="AIAssistant.ask('What items are low on stock and need reordering?')">Stock check</button>
        <button class="ai-quick-btn" onclick="AIAssistant.ask('Analyze my waste and suggest improvements')">Waste analysis</button>
      </div>
      <div class="ai-input-area">
        <input type="text" class="form-input" id="ai-input" placeholder="Ask Nexus AI anything..." onkeydown="if(event.key==='Enter')AIAssistant.sendMessage()">
        <button class="btn btn-primary" onclick="AIAssistant.sendMessage()">Send</button>
      </div>
    </div>`;

    // Restore previous messages
    for (const msg of this.messages) {
      this.appendMessage(msg.role, msg.content);
    }
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
    this.appendMessage('user', query);

    // Show loading
    const loadingId = 'ai-loading-' + Date.now();
    const messagesEl = document.getElementById('ai-messages');
    const loadingEl = document.createElement('div');
    loadingEl.className = 'ai-message assistant';
    loadingEl.id = loadingId;
    loadingEl.innerHTML = '<div class="flex items-center gap-sm"><div class="spinner spinner-sm"></div> Thinking...</div>';
    messagesEl.appendChild(loadingEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    try {
      const result = await API.aiQuery(query, App.employee?.id);
      loadingEl.remove();

      if (result.error) {
        this.messages.push({ role: 'assistant', content: result.error });
        this.appendMessage('assistant', result.error);
      } else {
        this.messages.push({ role: 'assistant', content: result.text });
        this.appendMessage('assistant', this.renderMarkdown(result.text));
      }
    } catch (err) {
      loadingEl.remove();
      this.appendMessage('assistant', `Error: ${err.message}`);
    }
  },

  appendMessage(role, content) {
    const messagesEl = document.getElementById('ai-messages');
    if (!messagesEl) return;
    const msgEl = document.createElement('div');
    msgEl.className = `ai-message ${role} animate-fade`;
    msgEl.innerHTML = role === 'user' ? Utils.escapeHtml(content) : content;
    messagesEl.appendChild(msgEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  },

  renderMarkdown(text) {
    if (!text) return '';
    return text
      .replace(/```([\s\S]*?)```/g, '<pre style="background:var(--bg-primary);padding:8px;border-radius:6px;overflow-x:auto;font-size:12px"><code>$1</code></pre>')
      .replace(/`([^`]+)`/g, '<code style="background:var(--bg-primary);padding:1px 4px;border-radius:3px;font-size:12px">$1</code>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^### (.+)$/gm, '<h3 style="margin:8px 0 4px">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 style="margin:8px 0 4px">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 style="margin:8px 0 4px">$1</h1>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
      .replace(/(<li>.*<\/li>)/s, '<ul style="margin-left:16px">$1</ul>')
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n/g, '<br>');
  },

  destroy() {}
};
