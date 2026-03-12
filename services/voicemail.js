/* ============================================================
   VENUECORE - Voicemail & AI Call Service
   Twilio integration for phone lines + Claude AI voicemail
   ============================================================ */

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';

let twilioClient = null;

function getTwilio() {
  if (!twilioClient && TWILIO_SID && TWILIO_TOKEN) {
    const twilio = require('twilio');
    twilioClient = twilio(TWILIO_SID, TWILIO_TOKEN);
  }
  return twilioClient;
}

function twiml() {
  const twilio = require('twilio');
  return new twilio.twiml.VoiceResponse();
}

// ============================================================
// TWILIO PHONE NUMBER MANAGEMENT
// ============================================================

async function searchAvailableNumbers(areaCode, country = 'US') {
  const client = getTwilio();
  if (!client) throw new Error('Twilio not configured');

  const numbers = await client.availablePhoneNumbers(country)
    .local
    .list({ areaCode, limit: 10, voiceEnabled: true });

  return numbers.map(n => ({
    phoneNumber: n.phoneNumber,
    friendlyName: n.friendlyName,
    locality: n.locality,
    region: n.region,
    monthlyPrice: n.monthlyPrice || '1.15',
  }));
}

async function provisionNumber(phoneNumber) {
  const client = getTwilio();
  if (!client) throw new Error('Twilio not configured');

  const incoming = await client.incomingPhoneNumbers.create({
    phoneNumber,
    voiceUrl: `${BASE_URL}/api/voicemail/webhook/incoming`,
    voiceMethod: 'POST',
    statusCallback: `${BASE_URL}/api/voicemail/webhook/status`,
    statusCallbackMethod: 'POST',
  });

  return {
    sid: incoming.sid,
    phoneNumber: incoming.phoneNumber,
    friendlyName: incoming.friendlyName,
  };
}

async function releaseNumber(sid) {
  const client = getTwilio();
  if (!client) throw new Error('Twilio not configured');
  await client.incomingPhoneNumbers(sid).remove();
}

// ============================================================
// TWIML GENERATION
// ============================================================

function buildTraditionalVoicemailTwiml(line) {
  const response = twiml();
  response.say({ voice: 'Polly.Joanna' }, line.greeting_text);
  response.record({
    action: `${BASE_URL}/api/voicemail/webhook/recording-complete?line_id=${line.id}`,
    method: 'POST',
    maxLength: line.max_recording_seconds || 120,
    transcribe: true,
    transcribeCallback: `${BASE_URL}/api/voicemail/webhook/transcription?line_id=${line.id}`,
    playBeep: true,
  });
  response.say({ voice: 'Polly.Joanna' }, 'We did not receive a recording. Goodbye.');
  return response.toString();
}

function buildAIVoicemailTwiml(line) {
  const response = twiml();
  // Use Twilio <Connect> with <Stream> for real-time AI conversation
  // For initial implementation, use <Gather> loop pattern
  const restaurantName = line.restaurant_name || process.env.RESTAURANT_NAME || 'our restaurant';
  const callbackHours = line.callback_hours || 2;

  const greeting = line.greeting_text ||
    `Hello! Thank you for calling ${restaurantName}. All of our staff are currently busy, but I'd be happy to help you. I can take a message and make sure someone calls you back within ${callbackHours} hours. Let me start by getting your name. Please speak after the beep.`;

  response.say({ voice: 'Polly.Joanna' }, greeting);

  // Step 1: Collect name
  const gatherName = response.gather({
    input: 'speech',
    action: `${BASE_URL}/api/voicemail/webhook/ai-collect?line_id=${line.id}&step=name`,
    method: 'POST',
    speechTimeout: 3,
    language: 'en-US',
  });
  gatherName.say({ voice: 'Polly.Joanna' }, '');

  response.say({ voice: 'Polly.Joanna' }, "I'm sorry, I didn't catch that. Please say your name.");
  response.redirect(`${BASE_URL}/api/voicemail/webhook/ai-collect?line_id=${line.id}&step=name_retry`);

  return response.toString();
}

// AI collect steps — progressive conversation
function buildAICollectTwiml(step, speechResult, lineId, accumulated) {
  const response = twiml();

  switch (step) {
    case 'name':
    case 'name_retry': {
      // Got name, ask for number
      const name = speechResult || 'Unknown';
      response.say({ voice: 'Polly.Joanna' },
        `Thank you, ${name}. Now, what's the best phone number to reach you at?`);
      const gatherPhone = response.gather({
        input: 'speech dtmf',
        action: `${BASE_URL}/api/voicemail/webhook/ai-collect?line_id=${lineId}&step=phone&caller_name=${encodeURIComponent(name)}`,
        method: 'POST',
        speechTimeout: 3,
        numDigits: 10,
      });
      gatherPhone.say({ voice: 'Polly.Joanna' }, '');
      response.say({ voice: 'Polly.Joanna' }, "I didn't catch that. Please say or enter your phone number.");
      response.redirect(`${BASE_URL}/api/voicemail/webhook/ai-collect?line_id=${lineId}&step=phone_retry&caller_name=${encodeURIComponent(name)}`);
      break;
    }

    case 'phone':
    case 'phone_retry': {
      const callerName = accumulated.caller_name || 'there';
      const phone = speechResult || 'not provided';
      response.say({ voice: 'Polly.Joanna' },
        `Got it. And what's the reason for your call today?`);
      const gatherReason = response.gather({
        input: 'speech',
        action: `${BASE_URL}/api/voicemail/webhook/ai-collect?line_id=${lineId}&step=reason&caller_name=${encodeURIComponent(callerName)}&caller_phone=${encodeURIComponent(phone)}`,
        method: 'POST',
        speechTimeout: 5,
      });
      gatherReason.say({ voice: 'Polly.Joanna' }, '');
      response.say({ voice: 'Polly.Joanna' }, "I didn't catch that. Please tell me why you're calling.");
      response.redirect(`${BASE_URL}/api/voicemail/webhook/ai-collect?line_id=${lineId}&step=reason_retry&caller_name=${encodeURIComponent(callerName)}&caller_phone=${encodeURIComponent(phone)}`);
      break;
    }

    case 'reason':
    case 'reason_retry': {
      const callerName = accumulated.caller_name || 'there';
      const callerPhone = accumulated.caller_phone || 'not provided';
      const reason = speechResult || 'not specified';
      const callbackHours = accumulated.callback_hours || 2;

      // Confirm and end
      response.say({ voice: 'Polly.Joanna' },
        `Perfect, let me confirm your information. Your name is ${callerName}, ` +
        `your callback number is ${callerPhone}, ` +
        `and you're calling about: ${reason}. ` +
        `Someone from our team will call you back within ${callbackHours} hours. ` +
        `Thank you for calling, and have a great day!`);
      response.hangup();
      break;
    }

    default:
      response.say({ voice: 'Polly.Joanna' }, 'Thank you for calling. Goodbye.');
      response.hangup();
  }

  return response.toString();
}

// ============================================================
// AI-ENHANCED MESSAGE PROCESSING
// ============================================================

async function processMessageWithAI(transcription, lineConfig) {
  if (!ANTHROPIC_API_KEY) return null;

  const restaurantName = lineConfig.restaurant_name || process.env.RESTAURANT_NAME || 'our restaurant';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 500,
      system: `You are an AI assistant for ${restaurantName}. Extract the following from voicemail transcriptions: caller_name, callback_number, reason_for_calling, urgency (low/medium/high), and a brief summary. Return JSON only.`,
      messages: [{ role: 'user', content: `Extract info from this voicemail: "${transcription}"` }],
    }),
  });

  const data = await response.json();
  try {
    const text = data.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch {
    return null;
  }
}

module.exports = {
  getTwilio,
  searchAvailableNumbers,
  provisionNumber,
  releaseNumber,
  buildTraditionalVoicemailTwiml,
  buildAIVoicemailTwiml,
  buildAICollectTwiml,
  processMessageWithAI,
};
