import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { FixedDevice, fixtureSample, FIXTURE_START } from '../src/fixtures.js';
import { DEFAULTS, LocalWearable } from '../src/simulator.js';
function setup(settings: Parameters<typeof LocalWearable.prototype.configure>[0] = {}) {
  const pulses: number[] = [];
  let stops = 0;
  const model = new LocalWearable(
    {
      pulse: (n) => {
        pulses.push(n);
      },
      stop: () => {
        stops++;
      },
    },
    settings,
  );
  return { model, pulses, stops: () => stops };
}
function feed(model: LocalWearable, from: number, to: number, active = true) {
  for (let ms = from; ms <= to; ms += 1000) model.sample(fixtureSample(ms, active));
}
test('default 40-minute threshold has exact before/at boundary and bounded simulated pulse', () => {
  const { model, pulses } = setup();
  feed(model, 0, DEFAULTS.thresholdMs - 1000);
  assert.deepEqual(pulses, []);
  model.sample(fixtureSample(DEFAULTS.thresholdMs));
  assert.deepEqual(pulses, [200]);
  assert.equal(model.state, 'COOLDOWN');
  assert.equal(model.summary()[0].activityMs, DEFAULTS.thresholdMs);
});
test('editable threshold validates settings atomically; configuring never pulses', () => {
  const { model, pulses } = setup({ thresholdMs: 3000 });
  assert.throws(() => model.configure({ thresholdMs: NaN }));
  assert.throws(() => model.configure({ pulseMs: 1001 }));
  feed(model, 0, 3000);
  assert.equal(pulses.length, 1);
  model.configure({ thresholdMs: 4000 });
  assert.equal(pulses.length, 1);
  assert.equal(model.state, 'IDLE');
});
test('rest only resets accumulated activity after sustained rest; no false stationary reminders', () => {
  const { model, pulses } = setup({ thresholdMs: 5000, restResetMs: 3000 });
  feed(model, 0, 4000);
  feed(model, 5000, 9000, false);
  feed(model, 10000, 14000);
  assert.equal(pulses.length, 0);
  model.sample(fixtureSample(15000));
  assert.equal(pulses.length, 1);
  const stationary = setup({ thresholdMs: 1000 });
  feed(stationary.model, 0, 10000, false);
  assert.equal(stationary.pulses.length, 0);
});
test('short rest pauses rather than inventing activity duration', () => {
  const { model, pulses } = setup({ thresholdMs: 5000, restResetMs: 10000 });
  feed(model, 0, 4000);
  model.sample(fixtureSample(5000, false));
  model.sample(fixtureSample(6000));
  assert.equal(pulses.length, 0);
  model.sample(fixtureSample(7000));
  assert.equal(pulses.length, 1);
});
test('cooldown, dismiss, reset and disable preserve participant control', () => {
  const { model, pulses, stops } = setup({ thresholdMs: 2000, cooldownMs: 5000 });
  feed(model, 0, 8000);
  assert.equal(pulses.length, 1);
  model.sample(fixtureSample(9000));
  assert.equal(pulses.length, 2);
  model.dismiss();
  model.setEnabled(false);
  feed(model, 10000, 20000);
  assert.equal(model.state, 'DISABLED');
  assert.equal(pulses.length, 2);
  model.setEnabled(true);
  model.reset();
  assert.equal(pulses.length, 2);
  assert.ok(stops() >= 4);
});
test('NaN, infinity, out-of-range and disconnected signals break continuity', () => {
  for (const accelerationG of [
    [NaN, 0, 1],
    [Infinity, 0, 1],
    [17, 0, 1],
  ] as const) {
    const { model, pulses } = setup({ thresholdMs: 3000 });
    feed(model, 0, 2000);
    model.sample({ ...fixtureSample(3000), accelerationG });
    feed(model, 4000, 6000);
    assert.equal(pulses.length, 0);
    assert.equal(model.summary()[0].missingIntervals, 1);
  }
  const { model, pulses } = setup({ thresholdMs: 3000 });
  feed(model, 0, 2000);
  model.sample({ ...fixtureSample(3000), connected: false });
  feed(model, 4000, 6000);
  assert.equal(pulses.length, 0);
  model.sample(fixtureSample(7000));
  assert.equal(pulses.length, 1);
});
test('missing samples and duplicate/reordered monotonic clocks cannot create reminders', () => {
  for (const invalid of [1000, 2000, -1, NaN]) {
    const { model, pulses } = setup({ thresholdMs: 3000 });
    feed(model, 0, 2000);
    model.sample(fixtureSample(invalid));
    feed(model, 3000, 5000);
    assert.equal(pulses.length, 0);
  }
  const { model, pulses } = setup({ thresholdMs: 3000 });
  feed(model, 0, 2000);
  model.sample(fixtureSample(1_000_000));
  model.sample(fixtureSample(1_001_000));
  assert.equal(pulses.length, 0);
});
test('motor failure stops output and requires a fresh model before resuming', () => {
  let stops = 0;
  const model = new LocalWearable(
    {
      pulse: () => {
        throw Error('driver failure');
      },
      stop: () => {
        stops++;
      },
    },
    { thresholdMs: 1000 },
  );
  feed(model, 0, 10000);
  model.reset();
  assert.equal(model.state, 'MOTOR_FAILED');
  assert.ok(stops >= 1);
  assert.equal(model.summary()[0].reminders, 0);
});
test('weekly coverage splits at Tunis Monday boundary with bounded retention and defensive copies', () => {
  const { model } = setup();
  const start = Date.parse('2026-10-18T23:59:59+01:00');
  model.sample({ ...fixtureSample(0), wallMs: start });
  model.sample({ ...fixtureSample(2000), wallMs: start + 2000 });
  assert.deepEqual(
    model.summary().map((r) => [r.week, r.coveredMs]),
    [
      ['2026-10-12', 1000],
      ['2026-10-19', 1000],
    ],
  );
  model.summary()[0].activityMs = 999;
  assert.equal(model.summary()[0].activityMs, 1000);
  for (let week = 1; week <= 10; week++)
    model.sample({ ...fixtureSample(2000 + week * 1000), wallMs: start + week * 7 * 86400000 });
  assert.equal(model.summary().length, 8);
  assert.ok(model.summary().every((r) => r.provenance === 'SIMULATED'));
});
test('wall-clock jumps do not add invented summary time; monotonic threshold remains authoritative', () => {
  const { model, pulses } = setup({ thresholdMs: 2000 });
  model.sample(fixtureSample(0));
  model.sample({ ...fixtureSample(1000), wallMs: FIXTURE_START - 100000 });
  model.sample(fixtureSample(2000));
  assert.equal(
    model.summary().reduce((n, r) => n + r.coveredMs, 0),
    0,
  );
  assert.equal(pulses.length, 1);
});
test('local deletion clears summaries and threshold state without any pulse', () => {
  const { model, pulses } = setup({ thresholdMs: 3000 });
  feed(model, 0, 2000);
  model.deleteLocalData();
  assert.deepEqual(model.summary(), []);
  feed(model, 3000, 5000);
  assert.equal(pulses.length, 0);
  assert.ok(!JSON.stringify(model.summary()).includes('acceleration'));
});
test('entire fixed-device lifecycle runs with fetch and sockets blocked and zero attempts', () => {
  const originalFetch = globalThis.fetch;
  const originalConnect = net.Socket.prototype.connect;
  let attempts = 0;
  const deny = () => {
    attempts++;
    throw Error('NETWORK_FORBIDDEN');
  };
  globalThis.fetch = deny;
  net.Socket.prototype.connect = deny as typeof originalConnect;
  try {
    const { model, pulses } = setup();
    for (const input of new FixedDevice().samples()) model.sample(input);
    model.dismiss();
    model.setEnabled(false);
    model.setEnabled(true);
    model.sample({ ...fixtureSample(3_000_000), connected: false });
    model.sample(fixtureSample(3_001_000));
    assert.equal(pulses.length, 1);
    assert.ok(model.summary().length > 0);
    model.deleteLocalData();
    assert.deepEqual(model.summary(), []);
    assert.equal(attempts, 0);
  } finally {
    globalThis.fetch = originalFetch;
    net.Socket.prototype.connect = originalConnect;
  }
});
