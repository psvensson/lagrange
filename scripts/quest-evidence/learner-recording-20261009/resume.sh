#!/usr/bin/env bash
set -euo pipefail
carrier="$GITHUB_WORKSPACE/carrier-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT/scripts/quest-evidence/learner-recording-20261009"
out="$GITHUB_WORKSPACE/learner-recording-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
node --input-type=module -e "import {refuseUnderProbe} from './src/test-helpers/probe-guard.js'; refuseUnderProbe('the learner recording continuation');"
mkdir -p "$out"
export RECORD_CARRIER="$carrier" RECORD_OUT="$out"
python3 - <<'PY'
from pathlib import Path
import hashlib,os
c=Path(os.environ['RECORD_CARRIER']);o=Path(os.environ['RECORD_OUT'])
p=(c/'tests.patch').read_text()
assert hashlib.sha256(p.encode()).hexdigest()=='8322e93c13847549b54e446cf4caebc04b23577bbbafb905f289469cc104bf2d'
a='diff --git a/test/test-helpers/message-group-learner-record-worker.js b/test/test-helpers/message-group-learner-record-worker.js\n'
assert p.count(a)==1
(o/'corrected-tests.patch').write_text(p.replace(a,a+'new file mode 100644\n',1))
s=(c/'run.sh').read_text()
assert s.count('"$carrier/tests.patch"')==2
s=s.replace('"$carrier/tests.patch"','"$out/corrected-tests.patch"')
a=' measure test-lint npm exec --no -- eslint "$test_file" "$worker" --fix'
assert s.count(a)==1
s=s.replace(a,' python3 "$carrier/prepare-tests.py"\n'+a,1)
a=' git apply "$carrier/source.patch"'
assert s.count(a)==1
s=s.replace(a,a+'\n python3 "$carrier/prepare-source.py"',1)
(o/'executed-run.sh').write_text(s)
PY
bash "$out/executed-run.sh" "$1"
