#!/usr/bin/env bash
set -euo pipefail
here="$GITHUB_WORKSPACE/carrier-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT/scripts/quest-evidence/delivery-lifetime-20261009"
if [ "$1" = measure ]; then
  # The first run's three direct refusal cases and five transport cases engaged,
  # but its queued case ended pending: native propose need not emit immediately.
  # Use the existing status-observation witness's bounded heartbeat technique;
  # no runtime changes and no sleeping/time-budget extension.
  python3 - "$here/run.sh" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]);s=p.read_text()
anchor='  git apply "$carrier/tests.patch"\n'
assert s.count(anchor)==1
s=s.replace(anchor,anchor+'  (cd "$carrier"; echo "5ad48f72d2a3a3e1c906702b86036ddb7ae4b0c693700f4d192696f05fe5a053  queue-engagement.patch" | sha256sum -c -)\n  git apply "$carrier/queue-engagement.patch"\n',1)
anchor='  git apply "$carrier/native.patch"\n'
assert s.count(anchor)==1
s=s.replace(anchor,'  grep -Fq "a queued native action must revalidate its live delivery at execution" "$out/native-red.stdout.txt"\n  if grep -Fq "cancelledByParent" "$out/native-red.stdout.txt"; then exit 2; fi\n'+anchor,1)
p.write_text(s)
PY
fi
exec bash "$here/run.sh" "$1"
