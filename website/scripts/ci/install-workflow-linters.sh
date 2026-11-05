#!/usr/bin/env bash
# Installs pinned actionlint and zizmor releases in CI, after verifying their SHA-256 checksums.
# To upgrade: change the version and checksum (actionlint: checksums.txt; zizmor: release asset digest).
set -euo pipefail
actionlint_version=1.7.12
actionlint_sha256=8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8
zizmor_version=1.31.1
zizmor_sha256=d185f726bdaf92df78273217dfdd24ebcd6b0ef48cf3ce776ff5762b6e138c99

install() { # name url sha256
  local dir="$RUNNER_TEMP/$1" archive="$RUNNER_TEMP/$1.tar.gz"
  curl -sSfL -o "$archive" "$2"
  echo "$3  $archive" | sha256sum --check --strict
  mkdir -p "$dir"
  tar -xzf "$archive" -C "$dir"
  echo "$dir" >>"$GITHUB_PATH"
}

install actionlint \
  "https://github.com/rhysd/actionlint/releases/download/v${actionlint_version}/actionlint_${actionlint_version}_linux_amd64.tar.gz" \
  "$actionlint_sha256"
install zizmor \
  "https://github.com/zizmorcore/zizmor/releases/download/v${zizmor_version}/zizmor-x86_64-unknown-linux-gnu.tar.gz" \
  "$zizmor_sha256"
