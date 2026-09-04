const twilio = require("twilio");

const smsLog = [];
const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, ALERT_PHONE_NUMBERS } = process.env;
const twilioConfigured = Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER);
const client = twilioConfigured ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) : null;

function getAlertNumbers() {
  return ALERT_PHONE_NUMBERS ? ALERT_PHONE_NUMBERS.split(",").map((number) => number.trim()).filter(Boolean) : [];
}

function addLog(entry) {
  smsLog.unshift(entry);
  if (smsLog.length > 200) smsLog.length = 200;
}

async function sendSingleSms({ to, body, zoneId, zoneName, type, recipients }) {
  const sentAt = new Date().toISOString();
  if (!twilioConfigured) {
    const entry = { id: `sms-${Date.now()}-${Math.random()}`, status: "simulated", provider: "none", to, recipients: recipients || to, zoneId, zoneName, type, message: body, timestamp: sentAt, sentAt, note: "Twilio environment variables are not configured" };
    addLog(entry);
    console.log(`[SMS SIMULATION] ${to}: ${body}`);
    return entry;
  }

  try {
    const message = await client.messages.create({ body, from: TWILIO_PHONE_NUMBER, to });
    const entry = { id: message.sid, status: message.status || "queued", provider: "twilio", to, recipients: recipients || to, zoneId, zoneName, type, message: body, timestamp: sentAt, sentAt };
    addLog(entry);
    return entry;
  } catch (error) {
    const entry = { id: `sms-error-${Date.now()}-${Math.random()}`, status: "failed", provider: "twilio", to, recipients: recipients || to, zoneId, zoneName, type, message: body, timestamp: sentAt, sentAt, error: error.message };
    addLog(entry);
    console.error("Twilio SMS failed:", error.message);
    return entry;
  }
}

async function sendSms({ zoneId, zoneName, message, phoneNumbers, recipients, type = "zone-alert" }) {
  const numbers = Array.isArray(phoneNumbers) && phoneNumbers.length ? phoneNumbers : getAlertNumbers();
  if (!numbers.length) {
    const timestamp = new Date().toISOString();
    const entry = { id: `sms-${Date.now()}`, status: "not-sent", provider: twilioConfigured ? "twilio" : "none", zoneId, zoneName, type, message, recipients: recipients || "no configured phone numbers", timestamp, sentAt: timestamp, note: "No alert phone numbers configured" };
    addLog(entry);
    return entry;
  }

  const results = [];
  for (const to of numbers) results.push(await sendSingleSms({ to, body: message, zoneId, zoneName, type, recipients }));
  return results.length === 1 ? results[0] : results;
}

function getLog() {
  return smsLog;
}

function isConfigured() {
  return twilioConfigured && getAlertNumbers().length > 0;
}

module.exports = { sendSms, getLog, isConfigured };
