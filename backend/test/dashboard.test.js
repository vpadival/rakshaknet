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


test('citizen directions follow checked location rather than the selected zone', async () => {
  const elements = new Map();
  const element = () => ({ innerHTML: '', style: {}, dataset: {}, listeners: {}, classList: { add() {}, remove() {} }, setAttribute() {}, addEventListener(name, fn) { this.listeners[name] = fn; }, appendChild() {}, insertAdjacentHTML() {} });
  const get = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
  const citizenTab = element(); citizenTab.dataset.view = 'citizen';
  const authorityTab = element(); authorityTab.dataset.view = 'authority';
  const intervals = [];
  const zone = { id: 'z1', name: 'Yamuna Ghat', lat: 28.667, lng: 77.245, hazard: 'flood', level: 'severe', sensors: {}, peopleDetected: { count: 0, note: '' }, updatedAt: new Date().toISOString(), confidence: 1, safeZone: { name: 'Nearby shelter', lat: 28.671, lng: 77.230 }, cameraStatus: { available: true, live: false, lastSeen: new Date().toISOString(), cameraId: 'real-camera' } };
  let safety = 'safe', offline = false, denied = false, legacy = false, malformed = false;
  const map = { setView() { return this; }, flyTo() {} };
  const context = vm.createContext({
    console: { error() {} }, AbortSignal, Date,
    navigator: { geolocation: { getCurrentPosition(resolve, reject) { denied ? reject({ code: 1 }) : resolve({ coords: { latitude: 12.935, longitude: 77.614 } }); } } },
    document: { getElementById: get, querySelector: get, querySelectorAll: () => [authorityTab, citizenTab], createElement: element },
    L: { map: () => map, tileLayer: () => ({ addTo() {} }), divIcon: x => x, marker: () => ({ addTo() { return this; }, on() {}, setIcon() {} }) },
    setInterval: (fn, ms) => intervals.push({ fn, ms }), setTimeout() {},
    fetch: async url => {
      if (offline) throw Error('offline');
      const checkinZone = { ...zone, level: safety === 'safe' ? 'safe' : safety === 'unknown' ? 'unknown' : 'severe' };
      const checkin = malformed ? {} : legacy
        ? { matched: safety !== 'outside', zone: safety === 'outside' ? undefined : checkinZone }
        : { safety, evacuationRequired: safety === 'risk', message: 'Location assessment', zone: safety === 'outside' ? undefined : checkinZone };
      const result = url.endsWith('/api/zones') ? [zone] : url.endsWith('/api/checkin') ? checkin : [];
      return { ok: true, json: async () => result };
    },
  });
  const root = path.join(__dirname, '../..');
  vm.runInContext(fs.readFileSync(path.join(root, 'data.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), context);
  await new Promise(setImmediate);
  assert.match(get('detailPanel').innerHTML, /OFFLINE · Last received image/);
  assert.match(get('detailPanel').innerHTML, /camera\/latest.jpg/);
  assert.doesNotMatch(get('detailPanel').innerHTML, /Camera intelligence/);
  citizenTab.listeners.click();
  assert.doesNotMatch(get('detailPanel').innerHTML, /maps\/dir|Nearby shelter/);
  await get('detailPanel').listeners.click({ target: { id: 'useLocationBtn' } });
  assert.match(get('detailPanel').innerHTML, /already in a safer area/);
  assert.doesNotMatch(get('detailPanel').innerHTML, /maps\/dir|Nearby shelter|Nearest safe/);
  const poll = intervals.find(timer => timer.ms === 5000).fn;
  for (const status of ['outside', 'unknown', 'risk']) {
    safety = status;
    await poll();
    if (status === 'risk') assert.match(get('detailPanel').innerHTML, /origin=12.935,77.614&destination=28.671,77.23/);
    else assert.doesNotMatch(get('detailPanel').innerHTML, /maps\/dir|Nearby shelter/);
  }
  // Reproduce the response from a backend that has not been restarted.
  legacy = true;
  for (const status of ['safe', 'outside', 'unknown', 'risk']) {
    safety = status;
    await poll();
    const html = get('detailPanel').innerHTML;
    assert.doesNotMatch(html, /undefined/);
    if (status === 'safe') assert.match(html, /already in a safer area/);
    if (status === 'unknown') assert.match(html, /Safety unknown/);
    if (status === 'risk') assert.match(html, /origin=12.935,77.614&destination=28.671,77.23/);
    else assert.doesNotMatch(html, /maps\/dir|Nearby shelter/);
  }
  malformed = true;
  await poll();
  assert.match(get('detailPanel').innerHTML, /Safety unknown/);
  assert.doesNotMatch(get('detailPanel').innerHTML, /undefined|maps\/dir/);
  malformed = false;
  offline = true;
  await poll();
  assert.doesNotMatch(get('detailPanel').innerHTML, /maps\/dir/);
  assert.match(get('detailPanel').innerHTML, /Unable to check/);
  offline = false; denied = true;
  await get('detailPanel').listeners.click({ target: { id: 'useLocationBtn' } });
  assert.match(get('detailPanel').innerHTML, /permission denied/);
  assert.doesNotMatch(get('detailPanel').innerHTML, /maps\/dir/);
});
