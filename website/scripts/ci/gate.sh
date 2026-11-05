#!/usr/bin/env bash
# Turns a scanner's exit code into a CI result, and writes one line to the job summary.
#   usage: gate.sh <tool> <exit-code> <findings-exit-code> <enforce: true|false>
#   clean (0)               -> pass
#   findings (findings code) -> fail when enforced, warning when report-only
#   anything else            -> tool error: always fails, so a broken scanner never looks green
set -u
tool="$1"
code="$2"
findings_code="$3"
enforce="$4"
summary="${GITHUB_STEP_SUMMARY:-/dev/null}"
printf '| Scanner | Result | Meaning |\n|---|---|---|\n' >>"$summary"

if [ "$code" = "0" ]; then
  echo "| $tool | ✅ clean | – |" >>"$summary"
  echo "$tool: clean"
  exit 0
fi

if [ "$code" = "$findings_code" ]; then
  if [ "$enforce" = "true" ]; then
    echo "| $tool | ❌ findings | blocking: fix them or register an exemption |" >>"$summary"
    echo "::error title=$tool::Findings detected (see the report artifact)."
    exit 1
  fi
  echo "| $tool | ⚠️ findings | report-only: not blocking yet |" >>"$summary"
  echo "::warning title=$tool::Findings detected (report-only mode, not blocking yet)."
  exit 0
fi

echo "| $tool | ❌ tool error (exit code '${code}') | the scanner did not run correctly |" >>"$summary"
echo "::error title=$tool::Scanner failed to run (exit code '${code}')."
exit 1
