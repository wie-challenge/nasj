/** Local-only accelerated software model. No clinical calibration or physical motor evidence. */
export const BUILD = 'wearable-simulator/0.1.0';
export const DEFAULTS = Object.freeze({
  thresholdMs: 40 * 60_000, // Backlog starting value, unvalidated; editable locally.
  restResetMs: 60_000,
  cooldownMs: 5 * 60_000,
  maxGapMs: 2000,
  pulseMs: 200,
  motionDeviationG: 0.1,
});
export type Settings = { [K in keyof typeof DEFAULTS]: number };
export interface Sample {
  monotonicMs: number;
  wallMs: number;
  connected: boolean;
  accelerationG: readonly [number, number, number];
}
/** Replace these adapters with real drivers later; the engine imports no network or commerce code. */
export interface DeviceAdapter {
  samples(): Iterable<Sample>;
}
export interface MotorAdapter {
  pulse(durationMs: number): void;
  stop(): void;
}
export interface WeeklySummary {
  week: string;
  timezone: 'Africa/Tunis';
  provenance: 'SIMULATED';
  build: typeof BUILD;
  activityMs: number;
  coveredMs: number;
  missingIntervals: number;
  reminders: number;
}
export type State = 'IDLE' | 'ACTIVE' | 'REST' | 'COOLDOWN' | 'DISABLED' | 'MOTOR_FAILED';
// Tunisia UTC+01:00; fixture wall times deliberately use this documented local-week boundary.
const OFFSET = 60 * 60_000;
const WEEK = 7 * 86_400_000;
function weekStart(wallMs: number) {
  const local = new Date(wallMs + OFFSET);
  const daysSinceMonday = (local.getUTCDay() + 6) % 7;
  return (
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - daysSinceMonday) -
    OFFSET
  );
}
function validSettings(settings: Settings) {
  for (const key of ['thresholdMs', 'restResetMs', 'cooldownMs', 'maxGapMs', 'pulseMs'] as const)
    if (!Number.isSafeInteger(settings[key]) || settings[key] < 1 || settings[key] > WEEK)
      throw new RangeError(`Invalid ${key}.`);
  if (
    settings.pulseMs > 1000 ||
    settings.maxGapMs > 60_000 ||
    !Number.isFinite(settings.motionDeviationG) ||
    settings.motionDeviationG < 0.01 ||
    settings.motionDeviationG > 2
  )
    throw new RangeError('Invalid simulator bounds.');
}
export class LocalWearable {
  private settings: Settings;
  private enabled = true;
  private previous?: Sample;
  private previousActive = false;
  private lastMonotonic = -1;
  private activeMs = 0;
  private restMs = 0;
  private cooldownUntil = 0;
  private weeks = new Map<number, WeeklySummary>();
  private newestWeek = -Infinity;
  state: State = 'IDLE';
  constructor(
    private readonly motor: MotorAdapter,
    settings: Partial<Settings> = {},
  ) {
    this.settings = { ...DEFAULTS, ...settings };
    validSettings(this.settings);
  }
  configure(settings: Partial<Settings>) {
    const next = { ...this.settings, ...settings };
    validSettings(next);
    this.reset();
    this.settings = next;
  }
  private stop() {
    try {
      this.motor.stop();
      return true;
    } catch {
      this.state = 'MOTOR_FAILED';
      return false;
    }
  }
  reset() {
    this.stop();
    this.previous = undefined;
    this.previousActive = false;
    this.activeMs = this.restMs = this.cooldownUntil = 0;
    if (this.state !== 'MOTOR_FAILED') this.state = this.enabled ? 'IDLE' : 'DISABLED';
  }
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.reset();
  }
  dismiss() {
    this.stop();
    this.activeMs = 0;
    this.cooldownUntil = this.lastMonotonic + this.settings.cooldownMs;
    if (this.enabled && this.state !== 'MOTOR_FAILED') this.state = 'COOLDOWN';
  }
  deleteLocalData() {
    this.reset();
    this.weeks.clear();
    this.newestWeek = -Infinity;
  }
  summary(): WeeklySummary[] {
    return [...this.weeks.entries()].sort(([a], [b]) => a - b).map(([, value]) => ({ ...value }));
  }
  private bucket(wallMs: number): WeeklySummary | undefined {
    const start = weekStart(wallMs);
    this.newestWeek = Math.max(this.newestWeek, start);
    // Keep at most eight local weeks; a backwards wall-clock change cannot resurrect expired data.
    for (const key of this.weeks.keys())
      if (key < this.newestWeek - 7 * WEEK) this.weeks.delete(key);
    if (start < this.newestWeek - 7 * WEEK) return;
    let row = this.weeks.get(start);
    if (!row) {
      row = {
        week: new Date(start + OFFSET).toISOString().slice(0, 10),
        timezone: 'Africa/Tunis',
        provenance: 'SIMULATED',
        build: BUILD,
        activityMs: 0,
        coveredMs: 0,
        missingIntervals: 0,
        reminders: 0,
      };
      this.weeks.set(start, row);
    }
    return row;
  }
  sample(input: Sample) {
    if (
      !Number.isSafeInteger(input.monotonicMs) ||
      input.monotonicMs < 0 ||
      input.monotonicMs <= this.lastMonotonic ||
      !Number.isSafeInteger(input.wallMs) ||
      input.wallMs < 0 ||
      input.wallMs > 8_000_000_000_000_000
    ) {
      // Reject duplicate/reordered clock values and break continuity; never subtract negative time.
      this.previous = undefined;
      this.activeMs = this.restMs = 0;
      this.stop();
      if (this.state !== 'MOTOR_FAILED') this.state = this.enabled ? 'IDLE' : 'DISABLED';
      return;
    }
    this.lastMonotonic = input.monotonicMs;
    if (!this.enabled || this.state === 'MOTOR_FAILED') return;
    const row = this.bucket(input.wallMs);
    const valid =
      input.connected &&
      input.accelerationG.length === 3 &&
      input.accelerationG.every((value) => Number.isFinite(value) && Math.abs(value) <= 16);
    const elapsed = this.previous ? input.monotonicMs - this.previous.monotonicMs : 0;
    const gap = elapsed > this.settings.maxGapMs;
    if (!valid || gap) {
      if (row) row.missingIntervals++;
      this.previous = valid ? { ...input, accelerationG: [...input.accelerationG] } : undefined;
      this.previousActive = false;
      this.activeMs = this.restMs = 0;
      if (this.stop()) this.state = 'IDLE';
      return;
    }
    // A deliberately simple fixed-fixture surrogate, not a validated human-activity classifier.
    const active =
      Math.abs(Math.hypot(...input.accelerationG) - 1) >= this.settings.motionDeviationG;
    const continuous = this.previous !== undefined;
    const wasActive = this.previousActive;
    const activeElapsed = continuous && active && wasActive ? elapsed : 0;
    if (continuous) {
      // Allocate interval coverage across local weeks; wall-clock jumps contribute no invented duration.
      const prior = this.previous!;
      if (input.wallMs - prior.wallMs === elapsed) {
        let cursor = prior.wallMs;
        while (cursor < input.wallMs) {
          const end = Math.min(input.wallMs, weekStart(cursor) + WEEK);
          const part = this.bucket(cursor);
          if (part) {
            part.coveredMs += end - cursor;
            if (activeElapsed) part.activityMs += end - cursor;
          }
          cursor = end;
        }
      } else if (row) row.missingIntervals++;
    }
    this.previous = { ...input, accelerationG: [...input.accelerationG] };
    this.previousActive = active;
    if (input.monotonicMs < this.cooldownUntil) {
      this.state = 'COOLDOWN';
      return;
    }
    if (active) {
      this.restMs = 0;
      this.activeMs += Math.min(activeElapsed, Math.max(0, input.monotonicMs - this.cooldownUntil));
      this.state = 'ACTIVE';
      if (this.activeMs >= this.settings.thresholdMs) {
        try {
          this.motor.pulse(this.settings.pulseMs);
        } catch {
          this.state = 'MOTOR_FAILED';
          this.stop();
          return;
        }
        if (row) row.reminders++;
        this.activeMs = 0;
        this.cooldownUntil = input.monotonicMs + this.settings.cooldownMs;
        this.state = 'COOLDOWN';
      }
    } else {
      this.state = 'REST';
      this.restMs += continuous && !wasActive ? elapsed : 0;
      if (this.restMs >= this.settings.restResetMs) this.activeMs = 0;
    }
  }
}
