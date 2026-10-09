#!/usr/bin/env bash
set -euo pipefail
carrier="$GITHUB_WORKSPACE/carrier-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT/scripts/quest-evidence/learner-recording-20261009"
out="$GITHUB_WORKSPACE/learner-recording-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
node --input-type=module -e "import {refuseUnderProbe} from './src/test-helpers/probe-guard.js'; refuseUnderProbe('learner recording continuation');"
mkdir -p "$out"
export CARRIER="$carrier" PROOF_OUT="$out"
if [ "$1" = measure ]; then
  gh api repos/psvensson/lagrange/actions/artifacts/11621514866/zip > "$out/first-37942096243.zip"
  echo "c446cfa8866a31126482417752fa68a126dc0bf70811c70556365c9456b4e6f2  $out/first-37942096243.zip" | sha256sum -c -
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
PY
bash "$out/executed-run.sh" "$1"
