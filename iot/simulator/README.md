# Local wearable simulator and device verification

The user confirmed on 2026-10-20 that the physical device will arrive later and requested hardcoded values meanwhile. `iot/simulator` is an independent local software model, version **wearable-simulator/0.1.0**. It has no runtime dependencies, network client, database client or commerce import. It is not ESP32 firmware and does not establish a supported board, IMU, wiring, calibration or physical vibration result.

From `iot/simulator`, run `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm demo`. The simulator has its own pinned development tools and lockfile; no website toolchain or checkout is needed. Fixtures accelerate timestamps; they do not wait 43 minutes. The CLI emits a clearly labelled SIMULATED local summary and simulated pulse durations; it makes no HTTP request. No environment variables, enrollment credentials or backend connection are needed.

`DeviceAdapter.samples()` and `MotorAdapter.pulse/stop()` are the replaceable hardware boundaries. Fixed inputs in `src/fixtures.ts` use acceleration `[0,0,1.25]` g for active and `[0,0,1]` g for rest, every 1000 ms. The surrogate classifies a magnitude deviation of at least 0.1 g as active. These are unvalidated fixture assumptions, not a human-activity or medical classifier. The default editable activity threshold is 40 minutes, sustained-rest reset 60 seconds, cooldown five minutes, maximum valid gap two seconds and simulated motor pulse 200 ms (maximum configurable pulse one second). Configure locally through `LocalWearable.configure`; settings changes reset accumulation without pulsing.

The monotonic clock controls accumulation; duplicate/reordered/negative/nonfinite timestamps break continuity. Disconnected, nonfinite or component-outside-±16 g samples and missing intervals never accumulate activity. Reconnection starts fresh. Short rest pauses activity; sustained rest resets it. Cooldown does not accumulate reminder-triggering activity. Dismiss stops output and restarts cooldown; disable stops and clears accumulation. Motor failure stops processing and requires a fresh instance. Real nonblocking actuator timing must be implemented and observed in the eventual driver.

Weekly summaries contain only activity/covered milliseconds, missing-interval/reminder counts, Monday week, Africa/Tunis timezone, simulator build and SIMULATED provenance. Tunisia's UTC+01:00 local week is explicit; intervals split at Monday boundaries. Wall-clock jumps do not invent summary duration, while monotonic reminder timing remains independent. At most eight local weeks are retained, with no expired-week resurrection after backward clock changes. Only one previous sample is held temporarily in memory. Summaries and settings are session-local; no raw sample file or persistent device storage exists. `deleteLocalData()` clears summaries, previous sample and accumulation. Durable on-device storage/deletion remains a hardware integration requirement.

| Case | Expected | Actual evidence / outcome |
|---|---|---|
| Valid signal and 40-minute threshold | No early pulse; exactly one at threshold | PASS, accelerated simulator test |
| Editable threshold and invalid settings | Atomic validation, no pulse on reconfigure | PASS, simulator test |
| Sustained/short rest; false stationary reminders | Reset/pause respectively; stationary never pulses | PASS, simulator tests |
| Dismiss/reset/disable/cooldown | Participant control; no unintended pulse | PASS, simulator test |
| NaN/infinite/out-of-range/disconnected | Break continuity; account missing coverage | PASS, simulator test |
| Reconnect, missing/reordered timestamps | Start fresh, no gap accumulation | PASS, simulator tests |
| Motor exception | Stop; report MOTOR_FAILED; no successful reminder count | PASS, simulated adapter failure |
| Local week, clock changes, retention and deletion | Correct bounded aggregates, defensive copies, clearing | PASS, simulator tests |
| Simulator non-upload | Entire fixture lifecycle makes zero fetch/TCP attempts | PASS, fetch/socket hooks deny calls; zero attempts; not a device packet capture |
| Capacity opt-in and wearable-field rejection | Voluntary consent; strict schemas reject monitoring input | PASS, actual website integration suite |
| Commerce/capacity independence | Simulator process leaves DB records and event counts unchanged | Historical PASS before relocation, actual website integration before/after comparisons; the website suite no longer launches a sibling simulator |
| ESP32/IMU wiring, build, calibration and accuracy | Record selected board, driver, build and observed measurements | BLOCKED pending device; no physical measurements |
| Physical vibration, pulse timing, reset/power and sustained use | Observe actuator behavior on actual board | BLOCKED pending board/motor/driver |
| Actual device storage deletion and network non-upload | Verify persistent storage and packet capture across lifecycle | BLOCKED pending device/app; simulator evidence cannot pass this row |

Simulator tests are executable in `test/simulator.test.ts`. Physical verification must record board/IMU/motor identifiers, firmware commit, wiring, settings, operator/date, expected/observed outcome and capture/reference for each case. E12 dependency snapshots (#162/#163/#164/#170/#171) are in the optional sibling `website/docs/engineering/issues`. Device arrival does not authorize wearable upload: personal signals stay local and never determine commercial capacity, offers, analytics or settlement.


## Repository boundary

This code lives exclusively in IoT. Website installation, build, CI and tests do not run it or require this checkout. Communication will be designed separately; no device/backend transport is implemented here. Simulator tests remain twelve local software checks; website/API checks are separate evidence.


## Verified standalone setup

On 2026-10-20, standalone `pnpm install --offline --frozen-lockfile`, lint, typecheck, all 12 tests, build and demo passed in this directory using its own installed tools. The initial install correctly required explicit esbuild build-script allowance; `pnpm-workspace.yaml` records that allowance. No website package or sibling service is required. Physical verification remains pending.
