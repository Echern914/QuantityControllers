/* ============================================================
   VENUECORE - Voicemail & Phone System Routes
   Manage voicemail lines, messages, and Twilio webhooks
   ============================================================ */
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { authenticate } = require('../middleware/auth');
const voicemailService = require('../services/voicemail');

// ============================================================
// AUTHENTICATED ROUTES (Admin Panel)
// ============================================================

// GET /api/voicemail/lines - List all voicemail lines
router.get('/lines', authenticate, (req, res) => {
  const db = getDb();
  const lines = db.prepare('SELECT * FROM voicemail_lines ORDER BY created_at DESC').all();
  res.json(lines);
});

// GET /api/voicemail/lines/:id - Get a single line
router.get('/lines/:id', authenticate, (req, res) => {
  const db = getDb();
  const line = db.prepare('SELECT * FROM voicemail_lines WHERE id = ?').get(req.params.id);
  if (!line) return res.status(404).json({ error: 'Line not found' });
  res.json(line);
});

// POST /api/voicemail/lines - Create a new voicemail line
router.post('/lines', authenticate, (req, res) => {
  const db = getDb();
  const {
    name, phone_number, twilio_sid, mode, greeting_text,
    restaurant_name, callback_hours, max_recording_seconds,
    ai_personality, active
  } = req.body;

  if (!name) return res.status(400).json({ error: 'Line name is required' });

  const result = db.prepare(`
    INSERT INTO voicemail_lines (name, phone_number, twilio_sid, mode, greeting_text,
      restaurant_name, callback_hours, max_recording_seconds, ai_personality, active, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name, phone_number || null, twilio_sid || null,
    mode || 'traditional', greeting_text || '',
    restaurant_name || process.env.RESTAURANT_NAME || '',
    callback_hours || 2, max_recording_seconds || 120,
    ai_personality || '', active !== undefined ? active : 1,
    req.employee?.id || null
  );

  res.json({ id: result.lastInsertRowid, message: 'Voicemail line created' });
});

// PUT /api/voicemail/lines/:id - Update a voicemail line
router.put('/lines/:id', authenticate, (req, res) => {
  const db = getDb();
  const fields = ['name', 'phone_number', 'twilio_sid', 'mode', 'greeting_text',
    'restaurant_name', 'callback_hours', 'max_recording_seconds', 'ai_personality', 'active'];
  const updates = [];
  const values = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { updates.push(`${f} = ?`); values.push(req.body[f]); }
  }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  updates.push("updated_at = datetime('now')");
  values.push(req.params.id);
  db.prepare(`UPDATE voicemail_lines SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  res.json({ message: 'Line updated' });
});

// DELETE /api/voicemail/lines/:id - Delete a voicemail line
router.delete('/lines/:id', authenticate, (req, res) => {
  const db = getDb();
  const line = db.prepare('SELECT * FROM voicemail_lines WHERE id = ?').get(req.params.id);
  if (!line) return res.status(404).json({ error: 'Line not found' });

  // Release Twilio number if provisioned
  if (line.twilio_sid) {
    try { voicemailService.releaseNumber(line.twilio_sid); } catch (e) { console.error('[Voicemail] Failed to release number:', e.message); }
  }

  db.prepare('DELETE FROM voicemail_lines WHERE id = ?').run(req.params.id);
  res.json({ message: 'Line deleted' });
});

// ============================================================
// PHONE NUMBER MANAGEMENT
// ============================================================

// POST /api/voicemail/numbers/search - Search available phone numbers
router.post('/numbers/search', authenticate, async (req, res) => {
  try {
    const { area_code, country } = req.body;
    if (!area_code) return res.status(400).json({ error: 'Area code required' });
    const numbers = await voicemailService.searchAvailableNumbers(area_code, country);
    res.json(numbers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/voicemail/numbers/provision - Buy/provision a phone number
router.post('/numbers/provision', authenticate, async (req, res) => {
  try {
    const { phone_number, line_id } = req.body;
    if (!phone_number) return res.status(400).json({ error: 'Phone number required' });

    const result = await voicemailService.provisionNumber(phone_number);

    // If line_id provided, update the line with the new number
    if (line_id) {
      const db = getDb();
      db.prepare(`UPDATE voicemail_lines SET phone_number = ?, twilio_sid = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(result.phoneNumber, result.sid, line_id);
    }

    res.json({ message: 'Number provisioned', ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// MESSAGES
// ============================================================

// GET /api/voicemail/messages - List messages
router.get('/messages', authenticate, (req, res) => {
  const db = getDb();
  const { line_id, status, limit } = req.query;
  let sql = 'SELECT * FROM voicemail_messages WHERE 1=1';
  const params = [];
  if (line_id) { sql += ' AND line_id = ?'; params.push(line_id); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY created_at DESC';
  if (limit) { sql += ' LIMIT ?'; params.push(parseInt(limit)); }
  res.json(db.prepare(sql).all(...params));
});

// GET /api/voicemail/messages/:id
router.get('/messages/:id', authenticate, (req, res) => {
  const db = getDb();
  const msg = db.prepare('SELECT * FROM voicemail_messages WHERE id = ?').get(req.params.id);
  if (!msg) return res.status(404).json({ error: 'Message not found' });
  res.json(msg);
});

// PUT /api/voicemail/messages/:id - Update message (mark read, add notes, etc.)
router.put('/messages/:id', authenticate, (req, res) => {
  const db = getDb();
  const fields = ['status', 'notes', 'assigned_to', 'callback_completed'];
  const updates = [];
  const values = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { updates.push(`${f} = ?`); values.push(req.body[f]); }
  }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  if (req.body.status === 'read' || req.body.status === 'archived') {
    updates.push("read_at = datetime('now')");
  }
  if (req.body.callback_completed) {
    updates.push("callback_at = datetime('now')");
    updates.push("callback_by = ?");
    values.push(req.employee?.id || null);
  }
  values.push(req.params.id);
  db.prepare(`UPDATE voicemail_messages SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  res.json({ message: 'Message updated' });
});

// DELETE /api/voicemail/messages/:id
router.delete('/messages/:id', authenticate, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM voicemail_messages WHERE id = ?').run(req.params.id);
  res.json({ message: 'Message deleted' });
});

// GET /api/voicemail/dashboard - Dashboard stats
router.get('/dashboard', authenticate, (req, res) => {
  const db = getDb();
  const totalLines = db.prepare('SELECT COUNT(*) as count FROM voicemail_lines').get().count;
  const activeLines = db.prepare("SELECT COUNT(*) as count FROM voicemail_lines WHERE active = 1").get().count;
  const totalMessages = db.prepare('SELECT COUNT(*) as count FROM voicemail_messages').get().count;
  const unreadMessages = db.prepare("SELECT COUNT(*) as count FROM voicemail_messages WHERE status = 'new'").get().count;
  const todayMessages = db.prepare("SELECT COUNT(*) as count FROM voicemail_messages WHERE date(created_at) = date('now')").get().count;
  const pendingCallbacks = db.prepare("SELECT COUNT(*) as count FROM voicemail_messages WHERE callback_completed = 0 AND caller_phone IS NOT NULL AND caller_phone != ''").get().count;
  const recentMessages = db.prepare("SELECT * FROM voicemail_messages ORDER BY created_at DESC LIMIT 5").all();
  const lines = db.prepare('SELECT id, name, mode, phone_number, active FROM voicemail_lines ORDER BY created_at DESC').all();

  res.json({
    total_lines: totalLines,
    active_lines: activeLines,
    total_messages: totalMessages,
    unread_messages: unreadMessages,
    today_messages: todayMessages,
    pending_callbacks: pendingCallbacks,
    recent_messages: recentMessages,
    lines,
  });
});

// ============================================================
// TWILIO WEBHOOKS (No auth — called by Twilio)
// ============================================================

// POST /api/voicemail/webhook/incoming - Handles incoming calls
router.post('/webhook/incoming', express.urlencoded({ extended: false }), (req, res) => {
  const db = getDb();
  const callerNumber = req.body.From || 'Unknown';
  const calledNumber = req.body.To || '';

  // Find the line for this number
  const line = db.prepare('SELECT * FROM voicemail_lines WHERE phone_number = ? AND active = 1').get(calledNumber);

  if (!line) {
    // No line configured — default greeting
    const response = voicemailService.buildTraditionalVoicemailTwiml({
      id: 0,
      greeting_text: 'Thank you for calling. Please leave a message after the beep.',
      max_recording_seconds: 120,
    });
    res.type('text/xml').send(response);
    return;
  }

  // Log the call
  db.prepare(`
    INSERT INTO voicemail_messages (line_id, caller_phone, call_sid, status)
    VALUES (?, ?, ?, 'in_progress')
  `).run(line.id, callerNumber, req.body.CallSid || null);

  let responseXml;
  if (line.mode === 'ai') {
    responseXml = voicemailService.buildAIVoicemailTwiml(line);
  } else {
    responseXml = voicemailService.buildTraditionalVoicemailTwiml(line);
  }

  res.type('text/xml').send(responseXml);
});

// POST /api/voicemail/webhook/recording-complete - Recording finished
router.post('/webhook/recording-complete', express.urlencoded({ extended: false }), async (req, res) => {
  const db = getDb();
  const lineId = req.query.line_id;
  const recordingUrl = req.body.RecordingUrl;
  const recordingDuration = req.body.RecordingDuration;
  const callSid = req.body.CallSid;

  // Update the message record
  db.prepare(`
    UPDATE voicemail_messages
    SET recording_url = ?, duration_seconds = ?, status = 'new',
        updated_at = datetime('now')
    WHERE call_sid = ? OR (line_id = ? AND status = 'in_progress')
  `).run(recordingUrl, parseInt(recordingDuration) || 0, callSid, lineId);

  // Broadcast new voicemail notification
  try {
    const broadcast = req.app.locals.broadcast;
    if (broadcast) {
      broadcast({ type: 'voicemail_new', line_id: lineId });
    }
  } catch {}

  const response = '<Response><Say voice="Polly.Joanna">Thank you. Your message has been received. Goodbye.</Say><Hangup/></Response>';
  res.type('text/xml').send(response);
});

// POST /api/voicemail/webhook/transcription - Transcription ready
router.post('/webhook/transcription', express.urlencoded({ extended: false }), async (req, res) => {
  const db = getDb();
  const lineId = req.query.line_id;
  const transcription = req.body.TranscriptionText;
  const callSid = req.body.CallSid;

  if (transcription) {
    db.prepare(`
      UPDATE voicemail_messages
      SET transcription = ?, updated_at = datetime('now')
      WHERE call_sid = ? OR (line_id = ? AND status = 'new' AND transcription IS NULL)
    `).run(transcription, callSid, lineId);

    // Use AI to extract caller info from transcription
    const line = db.prepare('SELECT * FROM voicemail_lines WHERE id = ?').get(lineId);
    if (line) {
      try {
        const extracted = await voicemailService.processMessageWithAI(transcription, line);
        if (extracted) {
          db.prepare(`
            UPDATE voicemail_messages
            SET caller_name = COALESCE(?, caller_name),
                caller_phone = COALESCE(?, caller_phone),
                reason = ?,
                urgency = ?,
                ai_summary = ?,
                updated_at = datetime('now')
            WHERE call_sid = ? OR (line_id = ? AND transcription = ?)
          `).run(
            extracted.caller_name || null,
            extracted.callback_number || null,
            extracted.reason_for_calling || null,
            extracted.urgency || 'medium',
            extracted.summary || null,
            callSid, lineId, transcription
          );
        }
      } catch (e) {
        console.error('[Voicemail] AI processing error:', e.message);
      }
    }
  }

  res.status(200).send('OK');
});

// POST /api/voicemail/webhook/ai-collect - AI conversation steps
router.post('/webhook/ai-collect', express.urlencoded({ extended: false }), (req, res) => {
  const db = getDb();
  const lineId = req.query.line_id;
  const step = req.query.step;
  const speechResult = req.body.SpeechResult || req.body.Digits || '';
  const callSid = req.body.CallSid;

  const accumulated = {
    caller_name: req.query.caller_name ? decodeURIComponent(req.query.caller_name) : '',
    caller_phone: req.query.caller_phone ? decodeURIComponent(req.query.caller_phone) : '',
  };

  // Get line for callback hours
  const line = db.prepare('SELECT * FROM voicemail_lines WHERE id = ?').get(lineId);
  accumulated.callback_hours = line?.callback_hours || 2;

  // If this is the final step (reason), save the complete message
  if (step === 'reason' || step === 'reason_retry') {
    const reason = speechResult || 'not specified';
    db.prepare(`
      UPDATE voicemail_messages
      SET caller_name = ?, caller_phone = ?, reason = ?,
          status = 'new', ai_summary = ?, updated_at = datetime('now')
      WHERE call_sid = ? OR (line_id = ? AND status = 'in_progress')
    `).run(
      accumulated.caller_name || null,
      accumulated.caller_phone || null,
      reason,
      `${accumulated.caller_name} called about: ${reason}. Callback: ${accumulated.caller_phone}`,
      callSid, lineId
    );

    // Broadcast notification
    try {
      const broadcast = req.app.locals.broadcast;
      if (broadcast) {
        broadcast({
          type: 'voicemail_new',
          line_id: lineId,
          caller_name: accumulated.caller_name,
          reason,
        });
      }
    } catch {}
  }

  const responseXml = voicemailService.buildAICollectTwiml(step, speechResult, lineId, accumulated);
  res.type('text/xml').send(responseXml);
});

// POST /api/voicemail/webhook/status - Call status updates
router.post('/webhook/status', express.urlencoded({ extended: false }), (req, res) => {
  const db = getDb();
  const callSid = req.body.CallSid;
  const callStatus = req.body.CallStatus;
  const duration = req.body.CallDuration;

  if (callSid && (callStatus === 'completed' || callStatus === 'no-answer' || callStatus === 'failed')) {
    db.prepare(`
      UPDATE voicemail_messages
      SET duration_seconds = COALESCE(?, duration_seconds),
          status = CASE WHEN status = 'in_progress' THEN 'new' ELSE status END,
          updated_at = datetime('now')
      WHERE call_sid = ?
    `).run(parseInt(duration) || null, callSid);
  }

  res.status(200).send('OK');
});

module.exports = router;
