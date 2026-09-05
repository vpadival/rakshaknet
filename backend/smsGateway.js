const smsLog = [];

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER,
  ALERT_PHONE_NUMBERS,
} = process.env;

function validTwilioConfig() {
  return Boolean(
    TWILIO_ACCOUNT_SID &&
    TWILIO_ACCOUNT_SID.startsWith("AC") &&
    TWILIO_AUTH_TOKEN &&
    TWILIO_PHONE_NUMBER
  );
}

let client = null;

if (validTwilioConfig()) {
  try {
    const twilio = require("twilio");
    client = twilio(
      TWILIO_ACCOUNT_SID,
      TWILIO_AUTH_TOKEN
    );

    console.log("[SMS] Twilio configured successfully");
  } catch (error) {
    console.error(
      "[SMS] Twilio initialization failed:",
      error.message
    );

    client = null;
  }
} else {
  console.warn(
    "[SMS] Twilio is not configured correctly. Running in simulation mode."
  );
}

function getAlertNumbers() {
  if (!ALERT_PHONE_NUMBERS) {
    return [];
  }

  return ALERT_PHONE_NUMBERS
    .split(",")
    .map((number) => number.trim())
    .filter(Boolean);
}

function addLog(entry) {
  smsLog.unshift(entry);

  if (smsLog.length > 200) {
    smsLog.length = 200;
  }
}

async function sendSingleSms({
  to,
  body,
  zoneId,
  zoneName,
  type = "zone-alert",
}) {
  if (!client) {
    const entry = {
      id: `sms-sim-${Date.now()}-${Math.random()}`,
      status: "simulated",
      provider: "none",
      to,
      zoneId,
      zoneName,
      type,
      message: body,
      sentAt: new Date().toISOString(),
      note: "Twilio unavailable or incorrectly configured",
    };

    addLog(entry);

    console.log(`[SMS SIMULATION] ${to}: ${body}`);

    return entry;
  }

  try {
    const message = await client.messages.create({
      body,
      from: TWILIO_PHONE_NUMBER,
      to,
    });

    const entry = {
      id: message.sid,
      status: message.status || "queued",
      provider: "twilio",
      to,
      zoneId,
      zoneName,
      type,
      message: body,
      sentAt: new Date().toISOString(),
    };

    addLog(entry);

    console.log(`[SMS] Sent to ${to}: ${message.sid}`);

    return entry;
  } catch (error) {
    const entry = {
      id: `sms-error-${Date.now()}-${Math.random()}`,
      status: "failed",
      provider: "twilio",
      to,
      zoneId,
      zoneName,
      type,
      message: body,
      sentAt: new Date().toISOString(),
      error: error.message,
    };

    addLog(entry);

    console.error(
      `[SMS] Failed to send to ${to}:`,
      error.message
    );

    return entry;
  }
}

async function sendSms({
  zoneId,
  zoneName,
  message,
  phoneNumbers,
  type = "zone-alert",
}) {
  const recipients =
    Array.isArray(phoneNumbers) && phoneNumbers.length
      ? phoneNumbers
      : getAlertNumbers();

  if (!recipients.length) {
    const entry = {
      id: `sms-no-recipient-${Date.now()}`,
      status: "not-sent",
      provider: client ? "twilio" : "none",
      zoneId,
      zoneName,
      type,
      message,
      sentAt: new Date().toISOString(),
      note: "No alert phone numbers configured",
    };

    addLog(entry);

    return entry;
  }

  const results = [];

  for (const to of recipients) {
    results.push(
      await sendSingleSms({
        to,
        body: message,
        zoneId,
        zoneName,
        type,
      })
    );
  }

  return results;
}

function getLog() {
  return smsLog;
}

function isConfigured() {
  return Boolean(
    client &&
    getAlertNumbers().length
  );
}

module.exports = {
  sendSms,
  getLog,
  isConfigured,
};
