#!/usr/bin/env bash
set -euo pipefail
carrier="$GITHUB_WORKSPACE/carrier-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT/scripts/quest-evidence/learner-process-loss-20261009"
out="$GITHUB_WORKSPACE/learner-process-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
node --input-type=module -e "import {refuseUnderProbe} from './src/test-helpers/probe-guard.js'; refuseUnderProbe('learner process-cut continuation');"
mkdir -p "$out"
export PROOF_OUT="$out" PROCESS_CARRIER="$carrier"
if [ "$1" = measure ]; then
  gh api repos/psvensson/lagrange/actions/artifacts/11624657719/zip > "$out/first-37947895412.zip"
  echo "2f64471ee5dd9014254f0857d6f21e6e08b3fd9affb5edadd65edb6387830207  $out/first-37947895412.zip" | sha256sum -c -
fi
python3 - <<'PY'
from pathlib import Path
import os
carrier=Path(os.environ['PROCESS_CARRIER']);out=Path(os.environ['PROOF_OUT'])
s=(carrier/'run.sh').read_text()
a='  python3 "$carrier/prepare.py" tests'
assert s.count(a)==1
s=s.replace(a,a+'\n  python3 "$carrier/refine.py"')
a='git add -- "$consumer" "$process_test" "${helpers[@]}" test/shards/'
assert s.count(a)==1
s=s.replace(a,'git add -- "$consumer" "$process_test" "${helpers[@]}" scripts/checks/test-subsystem-classification-constants.js test/shards/')
a='  measure test-lint npm exec --no -- eslint "$consumer" "$process_test" "${helpers[@]}" --fix'
assert s.count(a)==1
s=s.replace(a,a+'\n  measure taxonomy-lint npm exec --no -- eslint scripts/checks/test-subsystem-classification-constants.js')
a='  test -z "$(git status --porcelain)"\n  ;;\npublish)'
assert s.count(a)==1
s=s.replace(a,'  measure mutations python3 "$carrier/mutate.py"\n  measure consumer-restored npm run test:file -- "$consumer"\n  measure process-restored npm run test:file -- "$process_test"\n'+a)
s=s.replace("'processLossSchedules':3", "'mutations':json.loads((out/'mutations.json').read_text()),'processLossSchedules':3")
(out/'executed-run.sh').write_text(s)
PY
bash "$out/executed-run.sh" "$1"
