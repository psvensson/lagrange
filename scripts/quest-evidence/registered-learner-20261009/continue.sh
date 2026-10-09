#!/usr/bin/env bash
set -euo pipefail
node --input-type=module -e "import {refuseUnderProbe} from './src/test-helpers/probe-guard.js'; refuseUnderProbe('registered learner continuation');"
out="$GITHUB_WORKSPACE/registered-learner-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
mkdir -p "$out"
ops="$GITHUB_WORKSPACE/carrier-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT/scripts/quest-evidence/registered-learner-20261009"
cp "$ops/refine.py" "$CARRIER/refine.py"
cp "$ops/finish.py" "$CARRIER/finish.py"
cp "$ops/continue.sh" "$CARRIER/continue.sh"
if [ "$1" = measure ]; then
  gh api repos/psvensson/lagrange/actions/artifacts/11630291233/zip > "$out/fourth-37958694617.zip"
  echo "7e7febf44889239257375d97548ad453c1127fd898bb839d504477a7f3778e44  $out/fourth-37958694617.zip" | sha256sum -c -
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
s=s.replace(a,'  python3 "$CARRIER/refine.py"\n  python3 "$CARRIER/finish.py" tests\n'+a)
s=s.replace(b,'  python3 "$CARRIER/finish.py" source\n'+b)
(p/'executed-run.sh').write_text(s)
PY
bash "$CARRIER/executed-run.sh" "$1"
