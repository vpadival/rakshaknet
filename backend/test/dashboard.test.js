const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('dashboard recovers after failed startup and safely renders hardware and SMS data', async () => {
  const elements = new Map();
  const element = () => ({ innerHTML: '', style: {}, classList: { add() {}, remove() {} }, addEventListener() {}, appendChild() {}, insertAdjacentHTML(_, html) { this.innerHTML += html; } });
  const get = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
  const intervals = [];
  let available = false, markerCount = 0;
  const zone = { id: 'z4', name: 'Hardware', lat: 12, lng: 77, hazard: 'flood', level: 'safe', sensors: { mq2Ratio: 1.2, rainIntensityPct: 30 }, peopleDetected: { count: 0, note: '<img src=x onerror=alert(1)>' }, nodeStatus: { online: true, nodeId: '<script>bad</script>', lastSeen: new Date().toISOString() }, updatedAt: new Date().toISOString(), confidence: 0.9, modelType: 'rules', mlCause: 'Normal' };
  const map = { setView() { return this; }, flyTo() {} };
  const context = vm.createContext({
    console: { error() {} }, AbortSignal, Date,
    document: { getElementById: get, querySelector: get, querySelectorAll: () => [], createElement: element },
    L: { map: () => map, tileLayer: () => ({ addTo() {} }), divIcon: x => x, marker: () => { markerCount++; return { addTo() { return this; }, on() {}, setIcon() {} }; } },
    setInterval: (fn, ms) => { intervals.push({ fn, ms }); }, setTimeout() {},
    fetch: async url => {
      if (!available) throw Error('offline');
      return { ok: true, json: async () => url.endsWith('/api/zones') ? [zone] : [{ sentAt: new Date().toISOString(), zoneName: 'Hardware', status: 'not-sent', message: '<script>bad</script>' }] };
    },
  });
  const root = path.join(__dirname, '../..');
  vm.runInContext(fs.readFileSync(path.join(root, 'data.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), context);
  await new Promise(setImmediate);
  assert.match(get('zoneItems').innerHTML, /Can't reach/);
  available = true;
  for (const timer of intervals.filter(item => item.ms === 5000)) await timer.fn();
  assert.equal(markerCount, 1);
  assert.match(get('detailPanel').innerHTML, /Sensor node: ONLINE/);
  assert.match(get('detailPanel').innerHTML, /Rain plate wetness/);
  assert.doesNotMatch(get('detailPanel').innerHTML, /<script>|<img src=x/);
  assert.match(get('smsEntries').innerHTML, /not-sent/);
  assert.doesNotMatch(get('smsEntries').innerHTML, /Invalid Date|<script>/);
  zone.nodeStatus.online = false;
  await intervals.find(item => item.ms === 5000).fn();
  assert.equal(markerCount, 1);
  assert.match(get('detailPanel').innerHTML, /Sensor node offline/);
});
