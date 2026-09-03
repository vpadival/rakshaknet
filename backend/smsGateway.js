// Stubbed SMS gateway. Logs and stores dispatches in memory so the dashboard
// has something real to read from. Swap sendSms()'s body for a real provider
// (e.g. Twilio) when credentials are available — the function signature and
// the log entry shape are the contract the rest of the app depends on.

const log = [];

async function sendSms({ zoneId, zoneName, message, recipients = "all registered numbers in zone" }) {
  const entry = {
    id: `sms_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    zoneId,
    zoneName,
    message,
    recipients,
    status: "sent", // stub always "succeeds"; a real provider call would set this from its response
  };

  // TODO: replace with a real provider call, e.g.:
  //   const client = require("twilio")(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
  //   await client.messages.create({ to: recipientNumber, from: process.env.TWILIO_FROM, body: message });
  console.log(`[SMS STUB] ${zoneName}: "${message}" -> ${recipients}`);

  log.unshift(entry);
  if (log.length > 200) log.pop();
  return entry;
}

function getLog() {
  return log;
}

module.exports = { sendSms, getLog };
