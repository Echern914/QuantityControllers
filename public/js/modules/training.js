/* ============================================================
   VENUECORE - Training LMS Module
   ============================================================ */
const TrainingModule = {
  tab: 'dashboard',

  async render(container) {
    container.innerHTML = `
      <div class="animate-fade">
        <div class="module-tabs" id="train-tabs">
          <button class="tab-btn active" data-tab="dashboard">Dashboard</button>
          <button class="tab-btn" data-tab="courses">Courses</button>
          <button class="tab-btn" data-tab="enrollments">Enrollments</button>
          <button class="tab-btn" data-tab="certs">Certifications</button>
        </div>
        <div id="train-content"></div>
      </div>`;
    container.querySelector('#train-tabs').addEventListener('click', e => {
      if (e.target.classList.contains('tab-btn')) {
        container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.tab = e.target.dataset.tab;
        this.loadTab(container.querySelector('#train-content'));
      }
    });
    this.loadTab(container.querySelector('#train-content'));
  },

  async loadTab(el) {
    UI.loading(el);
    try {
      switch (this.tab) {
        case 'dashboard': return await this.renderDashboard(el);
        case 'courses': return await this.renderCourses(el);
        case 'enrollments': return await this.renderEnrollments(el);
        case 'certs': return await this.renderCerts(el);
      }
    } catch (err) { el.innerHTML = `<div class="empty-state"><p>${Utils.escapeHtml(err.message)}</p></div>`; }
  },

  async renderDashboard(el) {
    const d = await API.trainingDashboard();
    el.innerHTML = `
      <div class="grid grid-4 gap-md mb-md">
        ${UI.statCard('Courses', d.total_courses, '\u2630')}
        ${UI.statCard('Active Enrollments', d.active_enrollments, '\u25B6')}
        ${UI.statCard('Completion Rate', d.completion_rate + '%', '\u2713')}
        ${UI.statCard('Avg Score', d.avg_score, '\u2605')}
      </div>
      <div class="grid grid-3 gap-md mb-md">
        ${UI.statCard('Overdue', d.overdue, '\u26A0')}
        ${UI.statCard('Completed', d.completed, '\u2713')}
        ${UI.statCard('Expiring Certs', d.expiring_certifications, '\u23F0')}
      </div>
      <div class="card">
        <div class="card-header flex items-center justify-between">
          <h3>Top Courses</h3>
          <button class="btn btn-primary btn-sm" onclick="TrainingModule.showCreateCourse()">+ Create Course</button>
        </div>
        <div class="card-body" style="padding:0">
          ${(d.top_courses || []).length === 0 ? '<p class="text-muted text-sm" style="padding:20px;text-align:center">No courses yet</p>' :
            UI.table([
              { label: 'Course', key: 'title' },
              { label: 'Category', key: 'category' },
              { label: 'Enrollments', key: 'enrollments', align: 'right' },
              { label: 'Completions', key: 'completions', align: 'right' },
              { label: 'Avg Score', key: 'avg_score', render: v => v ? Math.round(v) + '%' : '-', align: 'right' },
            ], d.top_courses)}
        </div>
      </div>`;
  },

  async renderCourses(el) {
    const courses = await API.trainingCourses();
    const categories = [...new Set(courses.map(c => c.category))];
    const diffColors = { beginner: '#27ae60', intermediate: '#f39c12', advanced: '#e74c3c' };

    el.innerHTML = `
      <div class="flex items-center justify-between mb-md">
        <h3>${courses.length} Courses</h3>
        <button class="btn btn-primary btn-sm" onclick="TrainingModule.showCreateCourse()">+ Create Course</button>
      </div>
      ${courses.length === 0 ? '<div class="empty-state"><h3>No courses</h3><p>Create your first training course to get started.</p></div>' :
        `<div class="grid grid-2 gap-md">${courses.map(c => `
          <div class="card">
            <div class="card-header flex items-center justify-between">
              <div>
                <h3 style="font-size:15px">${Utils.escapeHtml(c.title)}</h3>
                <div class="flex gap-sm" style="margin-top:4px">
                  <span class="badge badge-secondary">${Utils.escapeHtml(c.category)}</span>
                  <span class="badge" style="background:${diffColors[c.difficulty] || '#999'};color:#fff">${c.difficulty}</span>
                  ${c.is_onboarding ? '<span class="badge badge-info">Onboarding</span>' : ''}
                </div>
              </div>
            </div>
            <div class="card-body">
              <p class="text-sm text-muted mb-sm">${Utils.escapeHtml(c.description || 'No description')}</p>
              <div class="grid grid-3 gap-sm text-sm">
                <div><strong>${c.lesson_count}</strong> lessons</div>
                <div><strong>${c.estimated_minutes}</strong> min</div>
                <div><strong>${c.enrolled}</strong> enrolled</div>
              </div>
              ${c.completed > 0 ? `<div class="text-sm mt-sm">Avg Score: <strong>${c.avg_score ? Math.round(c.avg_score) + '%' : 'N/A'}</strong></div>` : ''}
              <div class="flex gap-sm mt-sm">
                <button class="btn btn-sm btn-secondary" onclick="TrainingModule.showAddLesson(${c.id})">+ Lesson</button>
                <button class="btn btn-sm btn-primary" onclick="TrainingModule.showEnroll(${c.id})">Enroll Staff</button>
              </div>
            </div>
          </div>
        `).join('')}</div>`}`;
  },

  async showCreateCourse() {
    const html = `
      <div class="grid grid-2 gap-sm">
        <div class="form-group"><label class="form-label">Title</label><input class="form-input" id="tc-title" placeholder="Course title"></div>
        <div class="form-group"><label class="form-label">Category</label><select class="form-input" id="tc-cat"><option value="general">General</option><option value="food_safety">Food Safety</option><option value="service">Service</option><option value="bartending">Bartending</option><option value="management">Management</option><option value="compliance">Compliance</option></select></div>
        <div class="form-group"><label class="form-label">Difficulty</label><select class="form-input" id="tc-diff"><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></div>
        <div class="form-group"><label class="form-label">Duration (min)</label><input class="form-input" type="number" id="tc-min" value="30"></div>
        <div class="form-group"><label class="form-label">Passing Score (%)</label><input class="form-input" type="number" id="tc-pass" value="80"></div>
        <div class="form-group"><label class="form-label"><input type="checkbox" id="tc-onboard"> Required for Onboarding</label></div>
      </div>
      <div class="form-group"><label class="form-label">Description</label><textarea class="form-input" id="tc-desc" rows="3"></textarea></div>`;
    const modal = await UI.modal('Create Course', html, { confirmText: 'Create Course', size: 'lg' });
    if (!modal) return;
    try {
      await API.createTrainingCourse({
        title: modal.querySelector('#tc-title').value, description: modal.querySelector('#tc-desc').value,
        category: modal.querySelector('#tc-cat').value, difficulty: modal.querySelector('#tc-diff').value,
        estimated_minutes: parseInt(modal.querySelector('#tc-min').value), passing_score: parseInt(modal.querySelector('#tc-pass').value),
        is_onboarding: modal.querySelector('#tc-onboard').checked,
      });
      UI.toast('Success', 'Course created', 'success');
      this.loadTab(document.getElementById('train-content'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async showAddLesson(courseId) {
    const html = `
      <div class="form-group"><label class="form-label">Lesson Title</label><input class="form-input" id="tl-title"></div>
      <div class="form-group"><label class="form-label">Content</label><textarea class="form-input" id="tl-content" rows="6" placeholder="Lesson content..."></textarea></div>
      <div class="form-group"><label class="form-label">Duration (min)</label><input class="form-input" type="number" id="tl-min" value="10"></div>`;
    const modal = await UI.modal('Add Lesson', html, { confirmText: 'Add Lesson' });
    if (!modal) return;
    try {
      await API.createLesson(courseId, { title: modal.querySelector('#tl-title').value, content: modal.querySelector('#tl-content').value, duration_minutes: parseInt(modal.querySelector('#tl-min').value) });
      UI.toast('Success', 'Lesson added', 'success');
      this.loadTab(document.getElementById('train-content'));
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async showEnroll(courseId) {
    const staff = await API.staff();
    const html = `
      <div class="form-group"><label class="form-label">Select Employees</label>
        <div style="max-height:300px;overflow-y:auto">
          ${staff.filter(s => s.active).map(s => `<label style="display:block;padding:6px 0"><input type="checkbox" value="${s.id}" class="enroll-cb"> ${Utils.escapeHtml(s.first_name)} ${Utils.escapeHtml(s.last_name)} (${s.role})</label>`).join('')}
        </div>
      </div>
      <div class="form-group"><label class="form-label">Due Date (optional)</label><input class="form-input" type="date" id="en-due"></div>`;
    const modal = await UI.modal('Enroll Employees', html, { confirmText: 'Enroll' });
    if (!modal) return;
    const ids = [...modal.querySelectorAll('.enroll-cb:checked')].map(cb => parseInt(cb.value));
    if (ids.length === 0) { UI.toast('Warning', 'Select at least one employee', 'warning'); return; }
    try {
      const r = await API.bulkEnroll({ employee_ids: ids, course_id: courseId, due_date: modal.querySelector('#en-due').value || undefined });
      UI.toast('Enrolled', r.message, 'success');
    } catch (err) { UI.toast('Error', err.message, 'danger'); }
  },

  async renderEnrollments(el) {
    const enrollments = await API.trainingEnrollments();
    el.innerHTML = `
      <div class="card"><div class="card-header"><h3>All Enrollments</h3></div>
        <div class="card-body" style="padding:0;max-height:600px;overflow-y:auto">
          ${enrollments.length === 0 ? '<p class="text-muted text-sm" style="padding:20px;text-align:center">No enrollments yet</p>' :
            UI.table([
              { label: 'Employee', key: r => `${r.first_name} ${r.last_name}`, render: v => v },
              { label: 'Course', key: 'course_title' },
              { label: 'Progress', key: 'progress_percent', render: v => `<div class="progress-bar" style="height:8px;width:100px;border-radius:4px;display:inline-block"><div class="progress-fill" style="width:${v}%;border-radius:4px;background:${v >= 100 ? 'var(--success)' : 'var(--primary)'}"></div></div> ${v}%`, align: 'center' },
              { label: 'Score', key: 'score', render: v => v > 0 ? v + '%' : '-', align: 'right' },
              { label: 'Status', key: 'status', render: v => `<span class="badge badge-${v === 'completed' ? 'success' : v === 'failed' ? 'danger' : v === 'in_progress' ? 'info' : 'secondary'}">${v}</span>` },
              { label: 'Due', key: 'due_date', render: v => v || '-' },
            ], enrollments)}
        </div>
      </div>`;
  },

  async renderCerts(el) {
    const certs = await API.certifications();
    el.innerHTML = `
      <div class="card"><div class="card-header"><h3>Certifications</h3></div>
        <div class="card-body" style="padding:0">
          ${certs.length === 0 ? '<p class="text-muted text-sm" style="padding:20px;text-align:center">No certifications issued yet</p>' :
            UI.table([
              { label: 'Employee', key: r => `${r.first_name} ${r.last_name}`, render: v => v },
              { label: 'Certification', key: 'name' },
              { label: 'Course', key: 'course_title' },
              { label: 'Issued', key: 'issued_date' },
              { label: 'Expires', key: 'expiration_date', render: v => v ? `<span class="${new Date(v) < new Date() ? 'text-danger font-bold' : ''}">${v}</span>` : '-' },
              { label: 'Status', key: 'status', render: v => `<span class="badge badge-${v === 'active' ? 'success' : 'danger'}">${v}</span>` },
            ], certs)}
        </div>
      </div>`;
  },

  destroy() {},
};
