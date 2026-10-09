#!/usr/bin/env bash
set -euo pipefail
carrier="$GITHUB_WORKSPACE/carrier-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT/scripts/quest-evidence/learner-recording-20261009"
out="$GITHUB_WORKSPACE/learner-recording-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
node --input-type=module -e "import {refuseUnderProbe} from './src/test-helpers/probe-guard.js'; refuseUnderProbe('learner recording continuation');"
mkdir -p "$out"
export CARRIER="$carrier" PROOF_OUT="$out"
if [ "$1" = measure ]; then
  gh api repos/psvensson/lagrange/actions/artifacts/11622811255/zip > "$out/previous-37942867748.zip"
  echo "1ac1a001682337c3c0917ed5007b6ef9fef13b04c846c17601ff369db2d6eef4  $out/previous-37942867748.zip" | sha256sum -c -
fi
python3 - <<'PY'
import os
from pathlib import Path
carrier=Path(os.environ['CARRIER']);out=Path(os.environ['PROOF_OUT'])
s=(carrier/'run.sh').read_text()
a='  measure tests-lint npm exec --no -- eslint "${tests[@]}" --fix'
b='  measure source-lint npm exec --no -- eslint "${sources[@]}" --fix'
assert s.count(a)==s.count(b)==1
s=s.replace(a,'  python3 "$carrier/refine.py" tests\n'+a)
s=s.replace(b,'  python3 "$carrier/refine.py" source\n'+b)
(out/'executed-run.sh').write_text(s)
(out/'refine.py').write_text((carrier/'refine.py').read_text())
(out/'corrective-scope.txt').write_text('Second run measured the expected missing-writer red; static checks refused two new over-complex functions and two inherited inline SQL fragments. Separate original-origin matching and final-row completion within the same owner; name existing settlement SQL constants. Cache test expects existing canonical stamp serialization, not fixture property insertion order. No new runtime authority or weaker assertion/budget.\n')
PY
bash "$out/executed-run.sh" "$1"
