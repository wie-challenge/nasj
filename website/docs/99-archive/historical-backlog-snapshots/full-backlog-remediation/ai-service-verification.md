# AI service verification — FPA-01

Verified locally on 2026-10-30, baseline AI commit `529335efe3a2fc4e7e087814904ebf1e1e4221cb`.

FPA-01's package/import defect is fixed and local software checks pass. The source directory was `src/hirfacare_ai`, while every import, wheel package declaration, Docker factory, script, test and documented command used `nasj_ai`. Before editing, a direct import failed with `ModuleNotFoundError` (exit 1) and pytest failed during conftest collection (exit 4).

The canonical namespace is now `nasj_ai`. All 24 Python files moved from `src/hirfacare_ai/` to corresponding paths under `src/nasj_ai/` without changing their bytes. README documents the distribution/import distinction. CI now installs the built wheel in an isolated virtualenv and imports the factory from `/tmp` with `python -I`. Existing imports, Docker command, package metadata and tests already used the canonical name, so they need no substitutions. Dependency metadata, lockfile, credentials, runtime rules, API schema and examples are unchanged.

Changed product files: `.github/workflows/ci.yml`, `README.md`, and the 24 moves individually enumerated in [namespace-rename-proof.json](evidence/ai-service/namespace-rename-proof.json). The repository index is untouched; unstaged status therefore shows deletions plus an untracked replacement directory.

| Verification | Result | Evidence |
| --- | --- | --- |
| Baseline import / pytest collection | Reproduced failure, exits 1 / 4 | `baseline-import.log`, `baseline-local-pytest.log` |
| Fresh production environment, frozen lock, no editable install | PASS, 17 packages; isolated factory import PASS | `clean-production-sync.log`, `clean-production-import.log` |
| Build sdist and wheel from sdist | PASS | `wheel-build.log`; retained wheel and tarball |
| Separate clean wheel environment | PASS; import resolves inside its site-packages | `wheel-install.log`, `wheel-import.log` |
| Pytest against installed wheel using `python -I` | 34 passed | `wheel-pytest-pass.log` |
| Existing environment regression suite | 34 passed | `local-pytest.log` |
| Ruff lint / formatting | PASS, 39 formatted files | `lint.log`, `format.log` |
| Mypy | PASS, 32 source files | `typecheck.log` |
| Lock consistency / diff whitespace | PASS | `lock-check.log`, `diff-check.log` |
| OpenAPI export | PASS; checked-in schema byte unchanged | `openapi.log`, `source-hashes.json` |
| Actual ASGI process and HTTP socket | PASS | `asgi-contract-results.json`, `asgi-contract-final.log`, `asgi-server.log` |

The HTTP verifier starts the installed wheel in a disposable working directory with an explicit disposable service key and production settings. It checks live/ready health, hidden docs/schema, and matching/pricing/forecast previews over loopback. Each preview returns 401 without credentials, 200 with credentials, repeatable output, synthetic evidence, limitations and required human review. Only the checked-in synthetic examples are submitted. The process is stopped in `finally`; no database or business record is touched.

Full development-environment sync was attempted but bounded while registry downloads of the uncached 14 MiB mypy and 10 MiB Ruff wheels remained slow. The offline attempt failed with an uncached-wheel error; online attempts were explicitly terminated (exit -15). This limits reproduction of the entire fresh development toolchain, while the fresh production install, separate wheel tests, and existing static tools pass. One exploratory dependency change was reverted after confirming Starlette 1.9 supports the existing `httpx2`; metadata and lockfile hashes match the baseline.

Docker daemon 29.9.2 is available. The first build was explicitly interrupted after roughly 165 seconds of slow base-image pulls (exit 130), before application build execution. The final build hit its hard 50-second timeout during the uv base-image pull (exit 124); the exact result is recorded in `docker-build-final.log` and `commands.jsonl`. Container build/start verification remains an explicit environment gate. No container runtime success is claimed from an import or HTTP process test.

This work verifies packaging and the current deterministic advisory baseline. It does not claim trained ML, forecast calibration, production deployment, website integration, or completion of issue #156. Its external data, evaluation and integration requirements remain separate gates.

All commands, timestamps, exits and logs are in [evidence/ai-service](evidence/ai-service/). `source-hashes.json` records tested sources and configuration; `namespace-rename-proof.json` compares every moved file with the captured baseline; `artifact-hashes.json` hashes the retained evidence. `baseline-wheel.log` is a post-fix preliminary wheel build despite its early label. No commits, staging, resets, stashes, pushes, deployment, GitHub changes, or persistent-database changes were performed.
