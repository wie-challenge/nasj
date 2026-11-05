#!/usr/bin/env bash
# Installs a pinned Gitleaks release in CI, after verifying its published SHA-256 checksum.
# To upgrade: change both values, from https://github.com/gitleaks/gitleaks/releases (checksums.txt).
set -euo pipefail
version=8.30.1
sha256=551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb

archive="gitleaks_${version}_linux_x64.tar.gz"
curl -sSfL -o "$RUNNER_TEMP/$archive" \
  "https://github.com/gitleaks/gitleaks/releases/download/v${version}/${archive}"
echo "$sha256  $RUNNER_TEMP/$archive" | sha256sum --check --strict
tar -xzf "$RUNNER_TEMP/$archive" -C "$RUNNER_TEMP" gitleaks
echo "$RUNNER_TEMP" >>"$GITHUB_PATH"
