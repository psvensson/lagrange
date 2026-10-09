#!/usr/bin/env bash
set -euo pipefail
node --input-type=module -e "import {refuseUnderProbe} from './src/test-helpers/probe-guard.js'; refuseUnderProbe('registered learner continuation');"
out="$GITHUB_WORKSPACE/registered-learner-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
mkdir -p "$out"
ops="$GITHUB_WORKSPACE/carrier-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT/scripts/quest-evidence/registered-learner-20261009"
cp "$ops/refine.py" "$CARRIER/refine.py"
cp "$ops/continue.sh" "$CARRIER/continue.sh"
if [ "$1" = measure ]; then
  gh api repos/psvensson/lagrange/actions/artifacts/11629001065/zip > "$out/second-37957083569.zip"
  echo "976b896fcd04def6053e6fffb8cc1ba461a8268281edb024e585db1b64033b2b  $out/second-37957083569.zip" | sha256sum -c -
fi
python3 - <<'PY'
import os
from pathlib import Path
p=Path(os.environ['CARRIER'])
s=(p/'run.sh').read_text()
a='  measure test-lint npm exec --no -- eslint "${tests[@]}" --fix'
assert s.count(a)==1
s=s.replace(a,'  python3 "$CARRIER/refine.py"\n'+a)
(p/'executed-run.sh').write_text(s)
PY
bash "$CARRIER/executed-run.sh" "$1"
