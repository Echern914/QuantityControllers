const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { authenticate } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// ============================================================
// COURSES
// ============================================================

// GET /api/training/courses
router.get('/courses', (req, res) => {
  const db = getDb();
  const { category, active } = req.query;
  let sql = 'SELECT * FROM training_courses WHERE 1=1';
  const params = [];
  if (category) { sql += ' AND category = ?'; params.push(category); }
  if (active !== undefined) { sql += ' AND active = ?'; params.push(active === 'true' ? 1 : 0); }
  sql += ' ORDER BY category, title';

  const courses = db.prepare(sql).all(...params);

  // Add enrollment stats
  for (const course of courses) {
    const stats = db.prepare(`
      SELECT COUNT(*) as enrolled,
             SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
             AVG(CASE WHEN status = 'completed' THEN score ELSE NULL END) as avg_score
      FROM training_enrollments WHERE course_id = ?
    `).get(course.id);
    course.enrolled = stats.enrolled;
    course.completed = stats.completed;
    course.avg_score = stats.avg_score ? +stats.avg_score.toFixed(1) : null;
    course.lesson_count = db.prepare('SELECT COUNT(*) as c FROM training_lessons WHERE course_id = ?').get(course.id).c;
  }

  res.json(courses);
});

// GET /api/training/courses/:id
router.get('/courses/:id', (req, res) => {
  const db = getDb();
  const course = db.prepare('SELECT * FROM training_courses WHERE id = ?').get(req.params.id);
  if (!course) return res.status(404).json({ error: 'Course not found' });

  course.lessons = db.prepare(`SELECT * FROM training_lessons WHERE course_id = ? ORDER BY display_order`).all(req.params.id);
  for (const lesson of course.lessons) {
    lesson.quiz_count = db.prepare('SELECT COUNT(*) as c FROM training_quizzes WHERE lesson_id = ?').get(lesson.id).c;
  }

  res.json(course);
});

// POST /api/training/courses
router.post('/courses', (req, res) => {
  const db = getDb();
  const { title, description, category, difficulty, estimated_minutes, passing_score, required_for_roles, is_onboarding, created_by } = req.body;
  if (!title) return res.status(400).json({ error: 'Course title required' });

  const result = db.prepare(`
    INSERT INTO training_courses (title, description, category, difficulty, estimated_minutes, passing_score, required_for_roles, is_onboarding, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, description || '', category || 'general', difficulty || 'beginner', estimated_minutes || 30, passing_score || 80, JSON.stringify(required_for_roles || []), is_onboarding ? 1 : 0, created_by || null);

  res.json({ id: result.lastInsertRowid, message: 'Course created' });
});

// PUT /api/training/courses/:id
router.put('/courses/:id', (req, res) => {
  const db = getDb();
  const { title, description, category, difficulty, estimated_minutes, passing_score, required_for_roles, is_onboarding, active } = req.body;
  db.prepare(`UPDATE training_courses SET title = COALESCE(?, title), description = COALESCE(?, description), category = COALESCE(?, category), difficulty = COALESCE(?, difficulty), estimated_minutes = COALESCE(?, estimated_minutes), passing_score = COALESCE(?, passing_score), required_for_roles = COALESCE(?, required_for_roles), is_onboarding = COALESCE(?, is_onboarding), active = COALESCE(?, active) WHERE id = ?`)
    .run(title, description, category, difficulty, estimated_minutes, passing_score, required_for_roles ? JSON.stringify(required_for_roles) : null, is_onboarding !== undefined ? (is_onboarding ? 1 : 0) : null, active !== undefined ? (active ? 1 : 0) : null, req.params.id);
  res.json({ message: 'Course updated' });
});

// ============================================================
// LESSONS
// ============================================================

// POST /api/training/courses/:courseId/lessons
router.post('/courses/:courseId/lessons', (req, res) => {
  const db = getDb();
  const { title, content, content_type, media_url, duration_minutes } = req.body;
  if (!title) return res.status(400).json({ error: 'Lesson title required' });

  const maxOrder = db.prepare('SELECT MAX(display_order) as m FROM training_lessons WHERE course_id = ?').get(req.params.courseId).m || 0;
  const result = db.prepare(`
    INSERT INTO training_lessons (course_id, title, content, content_type, media_url, display_order, duration_minutes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.courseId, title, content || '', content_type || 'text', media_url || null, maxOrder + 1, duration_minutes || 10);

  res.json({ id: result.lastInsertRowid, message: 'Lesson created' });
});

// PUT /api/training/lessons/:id
router.put('/lessons/:id', (req, res) => {
  const db = getDb();
  const { title, content, content_type, media_url, duration_minutes, display_order } = req.body;
  db.prepare(`UPDATE training_lessons SET title = COALESCE(?, title), content = COALESCE(?, content), content_type = COALESCE(?, content_type), media_url = COALESCE(?, media_url), duration_minutes = COALESCE(?, duration_minutes), display_order = COALESCE(?, display_order) WHERE id = ?`)
    .run(title, content, content_type, media_url, duration_minutes, display_order, req.params.id);
  res.json({ message: 'Lesson updated' });
});

// ============================================================
// QUIZZES
// ============================================================

// GET /api/training/lessons/:lessonId/quiz
router.get('/lessons/:lessonId/quiz', (req, res) => {
  const db = getDb();
  const questions = db.prepare('SELECT * FROM training_quizzes WHERE lesson_id = ? ORDER BY display_order').all(req.params.lessonId);
  for (const q of questions) {
    try { q.options = JSON.parse(q.options); } catch { q.options = []; }
  }
  res.json(questions);
});

// POST /api/training/lessons/:lessonId/quiz
router.post('/lessons/:lessonId/quiz', (req, res) => {
  const db = getDb();
  const { question, question_type, options, correct_answer, explanation, points } = req.body;
  if (!question || !correct_answer) return res.status(400).json({ error: 'Question and correct answer required' });

  const maxOrder = db.prepare('SELECT MAX(display_order) as m FROM training_quizzes WHERE lesson_id = ?').get(req.params.lessonId).m || 0;
  const result = db.prepare(`
    INSERT INTO training_quizzes (lesson_id, question, question_type, options, correct_answer, explanation, points, display_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.lessonId, question, question_type || 'multiple_choice', JSON.stringify(options || []), correct_answer, explanation || null, points || 10, maxOrder + 1);

  res.json({ id: result.lastInsertRowid, message: 'Quiz question added' });
});

// ============================================================
// ENROLLMENTS
// ============================================================

// GET /api/training/enrollments
router.get('/enrollments', (req, res) => {
  const db = getDb();
  const { employee_id, course_id, status } = req.query;
  let sql = `SELECT te.*, tc.title as course_title, tc.category, e.first_name, e.last_name
    FROM training_enrollments te
    JOIN training_courses tc ON te.course_id = tc.id
    JOIN employees e ON te.employee_id = e.id WHERE 1=1`;
  const params = [];
  if (employee_id) { sql += ' AND te.employee_id = ?'; params.push(employee_id); }
  if (course_id) { sql += ' AND te.course_id = ?'; params.push(course_id); }
  if (status) { sql += ' AND te.status = ?'; params.push(status); }
  sql += ' ORDER BY te.created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

// POST /api/training/enroll
router.post('/enroll', (req, res) => {
  const db = getDb();
  const { employee_id, course_id, due_date, assigned_by } = req.body;
  if (!employee_id || !course_id) return res.status(400).json({ error: 'Employee and course required' });

  const existing = db.prepare('SELECT id FROM training_enrollments WHERE employee_id = ? AND course_id = ? AND status != ?').get(employee_id, course_id, 'completed');
  if (existing) return res.status(400).json({ error: 'Already enrolled' });

  const result = db.prepare(`INSERT INTO training_enrollments (employee_id, course_id, due_date, assigned_by) VALUES (?, ?, ?, ?)`)
    .run(employee_id, course_id, due_date || null, assigned_by || null);
  res.json({ id: result.lastInsertRowid, message: 'Employee enrolled' });
});

// POST /api/training/enroll/bulk - Enroll multiple employees
router.post('/enroll/bulk', (req, res) => {
  const db = getDb();
  const { employee_ids, course_id, due_date, assigned_by } = req.body;
  if (!employee_ids || !course_id) return res.status(400).json({ error: 'Employee IDs and course required' });

  const insert = db.prepare(`INSERT OR IGNORE INTO training_enrollments (employee_id, course_id, due_date, assigned_by) VALUES (?, ?, ?, ?)`);
  let enrolled = 0;
  for (const empId of employee_ids) {
    const result = insert.run(empId, course_id, due_date || null, assigned_by || null);
    if (result.changes > 0) enrolled++;
  }
  res.json({ enrolled, message: `${enrolled} employees enrolled` });
});

// POST /api/training/enrollments/:id/complete-lesson
router.post('/enrollments/:id/complete-lesson', (req, res) => {
  const db = getDb();
  const { lesson_id, quiz_score, quiz_answers } = req.body;
  const enrollment = db.prepare('SELECT * FROM training_enrollments WHERE id = ?').get(req.params.id);
  if (!enrollment) return res.status(404).json({ error: 'Enrollment not found' });

  db.prepare(`INSERT INTO training_lesson_completions (enrollment_id, lesson_id, quiz_score, quiz_answers) VALUES (?, ?, ?, ?)`)
    .run(req.params.id, lesson_id, quiz_score || null, JSON.stringify(quiz_answers || {}));

  // Update progress
  const totalLessons = db.prepare('SELECT COUNT(*) as c FROM training_lessons WHERE course_id = ?').get(enrollment.course_id).c;
  const completedLessons = db.prepare('SELECT COUNT(DISTINCT lesson_id) as c FROM training_lesson_completions WHERE enrollment_id = ?').get(req.params.id).c;
  const progress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  // Calculate overall score
  const avgScore = db.prepare('SELECT AVG(quiz_score) as avg FROM training_lesson_completions WHERE enrollment_id = ? AND quiz_score IS NOT NULL').get(req.params.id).avg;

  const isComplete = progress >= 100;
  const course = db.prepare('SELECT passing_score FROM training_courses WHERE id = ?').get(enrollment.course_id);
  const passed = avgScore >= (course?.passing_score || 80);

  db.prepare(`UPDATE training_enrollments SET progress_percent = ?, current_lesson_id = ?, score = ?, status = ?, started_at = COALESCE(started_at, datetime('now')), completed_at = CASE WHEN ? >= 100 THEN datetime('now') ELSE completed_at END WHERE id = ?`)
    .run(progress, lesson_id, Math.round(avgScore || 0), isComplete ? (passed ? 'completed' : 'failed') : 'in_progress', progress, req.params.id);

  // Issue certification if passed
  if (isComplete && passed) {
    const courseData = db.prepare('SELECT * FROM training_courses WHERE id = ?').get(enrollment.course_id);
    db.prepare(`INSERT INTO certifications (employee_id, name, issuing_body, issued_date, expiration_date, course_id) VALUES (?, ?, 'VenueCore Training', date('now'), date('now', '+1 year'), ?)`)
      .run(enrollment.employee_id, `${courseData.title} Certification`, enrollment.course_id);
  }

  res.json({ progress, score: Math.round(avgScore || 0), status: isComplete ? (passed ? 'completed' : 'failed') : 'in_progress', message: 'Lesson completed' });
});

// ============================================================
// CERTIFICATIONS
// ============================================================

// GET /api/training/certifications
router.get('/certifications', (req, res) => {
  const db = getDb();
  const { employee_id } = req.query;
  let sql = `SELECT c.*, e.first_name, e.last_name, tc.title as course_title
    FROM certifications c
    JOIN employees e ON c.employee_id = e.id
    LEFT JOIN training_courses tc ON c.course_id = tc.id WHERE 1=1`;
  const params = [];
  if (employee_id) { sql += ' AND c.employee_id = ?'; params.push(employee_id); }
  sql += ' ORDER BY c.issued_date DESC';
  res.json(db.prepare(sql).all(...params));
});

// GET /api/training/dashboard
router.get('/dashboard', (req, res) => {
  const db = getDb();

  const totalCourses = db.prepare('SELECT COUNT(*) as c FROM training_courses WHERE active = 1').get().c;
  const totalEnrollments = db.prepare('SELECT COUNT(*) as c FROM training_enrollments').get().c;
  const activeEnrollments = db.prepare("SELECT COUNT(*) as c FROM training_enrollments WHERE status IN ('enrolled', 'in_progress')").get().c;
  const completedEnrollments = db.prepare("SELECT COUNT(*) as c FROM training_enrollments WHERE status = 'completed'").get().c;
  const overdue = db.prepare("SELECT COUNT(*) as c FROM training_enrollments WHERE due_date < date('now') AND status NOT IN ('completed', 'failed')").get().c;
  const avgScore = db.prepare("SELECT AVG(score) as avg FROM training_enrollments WHERE status = 'completed'").get().avg;
  const expiringSoon = db.prepare("SELECT COUNT(*) as c FROM certifications WHERE expiration_date <= date('now', '+30 days') AND expiration_date > date('now')").get().c;

  const completionRate = totalEnrollments > 0 ? +((completedEnrollments / totalEnrollments) * 100).toFixed(1) : 0;

  const topCourses = db.prepare(`
    SELECT tc.title, tc.category,
           COUNT(te.id) as enrollments,
           SUM(CASE WHEN te.status = 'completed' THEN 1 ELSE 0 END) as completions,
           AVG(CASE WHEN te.status = 'completed' THEN te.score ELSE NULL END) as avg_score
    FROM training_courses tc
    LEFT JOIN training_enrollments te ON tc.id = te.course_id
    WHERE tc.active = 1
    GROUP BY tc.id
    ORDER BY enrollments DESC
    LIMIT 5
  `).all();

  res.json({
    total_courses: totalCourses, total_enrollments: totalEnrollments, active_enrollments: activeEnrollments,
    completed: completedEnrollments, overdue, completion_rate: completionRate,
    avg_score: avgScore ? +avgScore.toFixed(1) : 0, expiring_certifications: expiringSoon, top_courses: topCourses
  });
});

module.exports = router;
