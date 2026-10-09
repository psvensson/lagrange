#!/usr/bin/env bash
set -euo pipefail
carrier="$GITHUB_WORKSPACE/carrier-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT/scripts/quest-evidence/learner-recording-20261009"
out="$GITHUB_WORKSPACE/learner-recording-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
node --input-type=module -e "import {refuseUnderProbe} from './src/test-helpers/probe-guard.js'; refuseUnderProbe('learner recording continuation');"
mkdir -p "$out"
export CARRIER="$carrier" PROOF_OUT="$out"
if [ "$1" = measure ]; then
  gh api repos/psvensson/lagrange/actions/artifacts/11622271959/zip > "$out/previous-37943410091.zip"
  echo "039c0510ef673fe7edaca266623c9f7f278e9a12b696911f2fd4a0fce1294ef5  $out/previous-37943410091.zip" | sha256sum -c -
fi
python3 - <<'PY'
import os
from pathlib import Path
carrier=Path(os.environ['CARRIER']);out=Path(os.environ['PROOF_OUT'])
s=(carrier/'run.sh').read_text()
a='  measure tests-lint npm exec --no -- eslint "${tests[@]}" --fix'
b='  measure source-lint npm exec --no -- eslint "${sources[@]}" --fix'
c='  test -z "$(git status --porcelain)"\n  ;;\npublish)'
assert s.count(a)==s.count(b)==s.count(c)==1
s=s.replace(a,'  python3 "$carrier/refine.py" tests\n'+a)
s=s.replace(b,'  python3 "$carrier/refine.py" source\n'+b)
s=s.replace(c,'  PYTHONDONTWRITEBYTECODE=1 python3 "$carrier/mutations.py" "$PWD" "$out/mutations"\n'+c)
(out/'executed-run.sh').write_text(s)
for name in ['refine.py','mutations.py']:(out/name).write_text((carrier/name).read_text())
(out/'corrective-scope.txt').write_text('Prior missing-writer red and formatting/static failures retained. Same-module decision decomposition; named original settlement predicates; fixture uses canonical stamp serialization; explicit unavailable-readback assertion message. Mutation execution reuses exact PR110 owned-process cleanup and Node event reporter. No gate/budget weakening, new authority, source approval or physical acceptance.\n')
PY
bash "$out/executed-run.sh" "$1"
