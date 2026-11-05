# E16 release readiness — 2026-10-20

Eleven stories meet the implemented local synthetic scope. #30 now passes ordinary frozen fresh-source install and the full quality pipeline. #197's simulator/matrix deliverables are implemented in IoT and tested; physical observations remain deferred until the device arrives, as agreed. The user selected local-demo operations only. See [acceptance](e16-acceptance-matrix.md) for each criterion.

## Release A — November 5, 2026

**GO for local synthetic engineering validation.** Current fresh-source install, setup/client generation, lint/typecheck, 46 website unit tests, 58 disposable integration scenarios, 15 optimized-browser cases, dependency audit and production build pass. The authoritative domain/tenant/role/money/quantity/replay boundaries are verified independently of UI behavior. The clean pipeline uses dedicated test ports and preserves the unrelated service on 3000; an empty package cache is not claimed.

## Release B — December 10, 2026

**CONDITIONAL GO for the disclosed local simulator demo.** Buyer/artisan/operator journeys through separate payout/closure, reports/CSV/inbox, keyboard/mobile/tablet/desktop and emulated slow-device behavior pass. IoT independently passes install/audit/lint/types/12 tests/build/demo. Fixed values remain SIMULATED. Daily local encrypted backups and conditional five-minute health monitoring are configured with a private alert log; actual backup, outage/recovery and isolated all-table restore have been observed.

**NO-GO for claims of complete physical-device or hosted-production verification.** No board/IMU/motor/build/storage deletion/packet capture is available yet. Hosted deployment, off-host storage and external paging were explicitly excluded from the selected local-demo work. Reviewed 24h RPO/4h RTO/7d retention remain local targets, not production guarantees while a host/user manager is off. Both feature branches have been published with explicit authorization. Website source da170ab and independent IoT f471b2b passed their hosted workflows; exact results are linked in the test report.

## Remaining work

| Gate | Required action / dependency | Provisional effort |
|---|---|---|
| Device | Select/record board, IMU, motor, driver/build/wiring; observe timing, power/reset, local deletion and packet captures | 2–4 engineer-days after device/drivers arrive; implementation estimate separate |
| Future hosted scope | Provision off-host encrypted storage/key recovery, schedule/alert destination and ingress/provider checks when a host is supplied | 1–3 engineer-days plus hosting/operator inputs |
| Independent evaluation | Screen-reader/cross-browser/physical low-end device checks | 1–2 engineer-days with testers/devices |
| Separate product work | Real contracts/settlements, amendments/dispute remedies, tax/accounting and growth-scale load targets | Requires reviewed product/provider contracts |

The software implementation and local quality/operations gates are complete. Physical rows stay pending; synthetic values are not measurements. No live financial transaction, production cutover, external message, issue closure or deployment occurred. Both feature branches were pushed with explicit user authorization.
