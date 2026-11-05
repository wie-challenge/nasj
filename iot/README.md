# nasj IoT

Wearable firmware and local device tooling live in this independent repository. The executable [fixed wearable simulator](simulator/README.md) is available now; physical ESP32/IMU/motor drivers, wiring and board verification await the device.

```sh
cd simulator
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm demo
```

Requires Node 24 and pnpm 11.3.0. The simulator uses hardcoded, explicitly SIMULATED values and replaceable device/motor adapters. Personal sensor readings and local summaries remain separate from commercial platform data. No website checkout, database, backend service or environment credentials are required.

Device-to-application communication is deferred. No HTTP, MQTT, Bluetooth, serial transport or backend upload is implemented by this simulator. Define and review that boundary separately when communication is built; the simulator's local values must not silently become commercial inputs.

See [shared documentation](../docs/README.md) and [product backlog](../docs/nasj_FINAL_Detailed_Backlog.md) for requirements. Cross-repository links assume optional sibling checkouts. Origin: https://github.com/wie-challenge/iot.
