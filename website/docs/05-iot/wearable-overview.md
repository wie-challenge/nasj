# IoT simulator and website boundary

The fixed wearable simulator lives exclusively in the independent **iot** repository at [`iot/simulator`](../../../iot/simulator/README.md). It is not a website workspace package or runtime dependency. Website installation, builds, CI and tests work without that sibling checkout.

From a checkout of the IoT repository:

```sh
cd simulator
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm demo
```

The simulator owns its pinned Node 24/pnpm 11.3.0 toolchain configuration, lockfile, twelve tests, fixed input values, replaceable device/motor adapters and local weekly-summary implementation. Its README records configuration, expected/observed simulator results and pending physical-board/wiring/driver verification. Values remain explicitly SIMULATED until the device arrives. Cross-repository documentation links are optional references, not build dependencies.

Device-to-website communication is deferred as requested. No HTTP/MQTT/Bluetooth/serial transport or sensor upload has been added. Website strict schemas continue rejecting individual monitoring fields, and commerce/analytics/settlement never consume simulator values. The earlier standalone-process commercial-independence observation remains historical evidence; the website integration suite no longer launches simulator code from another repository.

Physical ESP32/IMU/motor selection, wiring/build, accuracy, vibration/power behavior, persistent local storage deletion and actual device packet captures remain BLOCKED pending device/drivers. Software simulator results cannot pass those physical rows. When communication is implemented, specify its purpose, privacy boundary and failure behavior separately; this move creates no implicit upload contract.
