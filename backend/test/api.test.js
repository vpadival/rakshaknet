const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
// Tests must never dispatch external messages, even on a configured developer machine.
delete process.env.TWILIO_ACCOUNT_SID;
delete process.env.ALERT_PHONE_NUMBERS;
process.env.DEMO_MODE = 'true';
const app = require('../server');
let server, base;
before(async () => {
  server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => server.close(resolve)));
async function post(path, body) {
  const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
test('hardware lifecycle: empty, connected, invalid and out-of-order readings', async () => {
  const initial = await (await fetch(base + '/api/zones/z4')).json();
  assert.equal(initial.level, 'unknown');
  const timestamp = Date.now();
  const result = await post('/api/zones/z4/telemetry', { nodeId: 'RN-SENSOR-01', timestamp, sensors: { tempC: 27, humidityPct: 60, soilMoisturePct: 50, mq2Raw: 1200, mq2Ratio: 1.2, rainIntensityPct: 10, waterLevelM: 0.2 } });
  assert.equal(result.status, 200);
  assert.equal(result.body.zone.level, 'severe');
  assert.equal(result.body.zone.nodeStatus.online, true);
  assert.deepEqual(result.body.rangeWarnings, []);
  const invalid = await post('/api/zones/z4/telemetry', { nodeId: 'RN-SENSOR-01', sensors: { waterLevelM: -1, tempC: 'bad', unexpected: '<img>', windGustKmh: 'fast', pollutants: { CO: -2 } } });
  assert.equal(invalid.body.zone.sensors.waterLevelM, 0.2);
  assert.equal(invalid.body.zone.sensors.tempC, 27);
  assert.equal(invalid.body.rangeWarnings.length, 5);
  assert.equal((await post('/api/zones/z4/telemetry', { nodeId: 'n', timestamp: timestamp - 1000 })).status, 409);
});
test('malformed telemetry and location are rejected without breaking the server', async () => {
  for (const extra of [{ sensors: [] }, { timestamp: 1e100 }, { peopleDetected: { count: -1 } }, { cameraFireConfirmed: 'yes' }]) {
    assert.equal((await post('/api/zones/z4/telemetry', { nodeId: 'n', ...extra })).status, 400);
  }
  assert.equal((await post('/api/checkin', { lat: 91, lng: 0 })).status, 400);
  assert.equal((await post('/api/checkin', { lat: 12.935, lng: 77.614 })).body.zone.id, 'z4');
  assert.equal((await fetch(base + '/api/health')).status, 200);
});
test('telemetry preserves explicit hazard reports', async () => {
  await post('/api/zones/z2/telemetry', { nodeId: 'camera', cameraFireConfirmed: true });
  const fire = await post('/api/zones/z2/telemetry', { nodeId: 'sensor', sensors: { tempC: 25 } });
  assert.match(fire.body.zone.mlCause, /Camera/);
  await post('/api/zones/z5/earthquake', { magnitude: 6 });
  const quake = await post('/api/zones/z5/telemetry', { nodeId: 'sensor', sensors: { tempC: 25 } });
  assert.equal(quake.body.zone.level, 'severe');
  assert.match(quake.body.zone.mlCause, /magnitude 6/);
});
test('only public dashboard files are served', async () => {
  for (const file of ['/backend/server.js', '/firmware/sensor-node/sensor-node.ino', '/backend/package.json']) assert.equal((await fetch(base + file)).status, 404);
  assert.equal((await fetch(base + '/')).status, 200);
  assert.equal((await fetch(base + '/app.js')).status, 200);
});
test('fractional AQI concentrations do not extrapolate from the highest band', () => {
  const { subIndex } = require('../aqiFormula');
  assert.equal(subIndex('PM2.5', 30.5), 51);
  assert.equal(subIndex('CO', 1.05), 51);
  assert.equal(subIndex('CO', 'bad'), null);
  assert.equal(subIndex('toString', 1), null);
});
