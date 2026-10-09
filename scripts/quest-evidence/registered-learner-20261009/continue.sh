#!/usr/bin/env bash
set -euo pipefail
node --input-type=module -e "import {refuseUnderProbe} from './src/test-helpers/probe-guard.js'; refuseUnderProbe('registered learner continuation');"
out="$GITHUB_WORKSPACE/registered-learner-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
mkdir -p "$out"
ops="$GITHUB_WORKSPACE/carrier-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT/scripts/quest-evidence/registered-learner-20261009"
cp "$ops/refine.py" "$CARRIER/refine.py"
cp "$ops/finish.py" "$CARRIER/finish.py"
cp "$ops/engagement.py" "$CARRIER/engagement.py"
cp "$ops/continue.sh" "$CARRIER/continue.sh"
if [ "$1" = measure ]; then
  gh api repos/psvensson/lagrange/actions/artifacts/11632185295/zip > "$out/fifth-37961559860.zip"
  echo "2af78ed6f98732745468ff4e683c5800d4637a4c7a28558e2048521b614f41a8  $out/fifth-37961559860.zip" | sha256sum -c -
  python3 "$CARRIER/finish.py" tools
fi
python3 - <<'PY'
import os
from pathlib import Path
p=Path(os.environ['CARRIER'])
s=(p/'run.sh').read_text()
a='  measure test-lint npm exec --no -- eslint "${tests[@]}" --fix'
b='  measure source-lint npm exec --no -- eslint "${sources[@]}" --fix'
assert s.count(a)==s.count(b)==1
s=s.replace(a,'  python3 "$CARRIER/refine.py"\n  python3 "$CARRIER/finish.py" tests\n  python3 "$CARRIER/engagement.py"\n'+a)
s=s.replace(b,'  python3 "$CARRIER/finish.py" source\n'+b)
(p/'executed-run.sh').write_text(s)
PY
bash "$CARRIER/executed-run.sh" "$1"
