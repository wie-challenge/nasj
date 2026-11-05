#!/usr/bin/env bash
# Runs Semgrep (NASJ rules in .semgrep/ + registry rulesets) and exits with a gate code:
#   0 = no ERROR-level finding, 99 = ERROR-level findings, anything else = Semgrep failed.
# Full reports (all severities): reports/semgrep.json and reports/semgrep.sarif.
set -u
semgrep="${SEMGREP:-semgrep}"
python="${PYTHON:-python3}"
mkdir -p reports

"$semgrep" scan --metrics=off --disable-version-check --quiet \
  --config .semgrep \
  --config p/typescript --config p/nodejs --config p/react --config p/nextjs --config p/owasp-top-ten \
  --json-output=reports/semgrep.json --sarif-output=reports/semgrep.sarif \
  apps packages scripts tests
code=$?
[ "$code" = "0" ] || exit "$code"

# Semgrep itself exits 0 with or without findings: count the ERROR-level ones.
counts=$("$python" -c '
import json
report = json.load(open("reports/semgrep.json"))
results = report["results"]
blocking = [r for r in results if r["extra"]["severity"] == "ERROR"]
print(len(results), len(blocking), len(report["errors"]))
') || exit 2
read -r total blocking rule_errors <<<"$counts"
line="Semgrep: $total finding(s), $blocking at ERROR level; $rule_errors rule error(s)"
echo "$line"
echo "$line" >>"${GITHUB_STEP_SUMMARY:-/dev/null}"
[ "$blocking" -gt 0 ] && exit 99
exit 0
