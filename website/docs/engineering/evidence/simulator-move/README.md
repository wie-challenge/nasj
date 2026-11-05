# Simulator relocation verification — 2026-10-20

Historical relocation-stage observations. Final normal fresh-install and hosted verification supersede these installation/publication limits; see `../../E16_TEST_RESULTS.md`.

The simulator was moved from the website workspace to the independent `iot/simulator` project at the user’s request. Website scripts and CI no longer build/run/test it; its old cross-repository integration scenario was removed. Communication remains deferred.

Executed: website lint/typecheck/production build and 42 unit tests plus 58 disposable integration scenarios; independent IoT offline frozen install/lint/typecheck, 12 tests, build and demo. Logs are retained here. Website dependency resolutions did not change. pnpm warns that installed workspace metadata still contains the removed package; local website checks used the existing installed toolchain with `pnpm_config_verify_deps_before_run=warn`. This warning does not skip test or compilation checks. The simulator installed and executed its own pinned tools successfully without any website reference.

Pre-move 54 combined-unit/59 integration/15 browser evidence stays in `../followup/`. No browser production source was changed for this relocation. IoT CI is configured locally and has not been published or run remotely. No environment credentials, archives or node_modules are retained in this evidence directory.
