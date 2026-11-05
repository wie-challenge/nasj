import type { DeviceAdapter, Sample } from './simulator.js';
export const FIXTURE_START = Date.parse('2026-10-19T08:00:00+01:00');
/** Hardcoded surrogate values requested while hardware is unavailable. All acceleration is in g. */
export function fixtureSample(monotonicMs: number, active = true): Sample {
  return {
    monotonicMs,
    wallMs: FIXTURE_START + monotonicMs,
    connected: true,
    accelerationG: active ? [0, 0, 1.25] : [0, 0, 1],
  };
}
export class FixedDevice implements DeviceAdapter {
  *samples() {
    for (let time = 0; time <= 41 * 60_000; time += 1000) yield fixtureSample(time);
    for (let time = 41 * 60_000 + 1000; time <= 43 * 60_000; time += 1000)
      yield fixtureSample(time, false);
  }
}
