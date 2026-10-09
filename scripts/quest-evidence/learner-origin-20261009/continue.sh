#!/usr/bin/env bash
set -euo pipefail
carrier="$GITHUB_WORKSPACE/carrier-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT/scripts/quest-evidence/learner-origin-20261009"
out="$GITHUB_WORKSPACE/learner-origin-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
node --input-type=module -e "import {refuseUnderProbe} from './src/test-helpers/probe-guard.js'; refuseUnderProbe('the learner-origin continuation');"
mkdir -p "$out"
export CARRIER_DIR="$carrier" PROOF_OUT="$out"
export CONTINUATION_SCOPE='2026-10-09 continuation from preserved failed origin attempts 37892536228 and 37917632948. PR110 corrected generic reads are published separately at 44e968be4e2f2db03b37d8a26470fd0a3b256fee and not overwritten or hot-path wired here. Reopen preserves physical lifecycle; assert replaced connection/port and actual runtime reconstruction. Tick both election survivors and settle initial applied progress. Canonical checkpoint descriptors omit absent origins. The rollback fixture now supplies the existing virtual time source and advances only the actual recovery owner retryAfterMs after fault removal; no runtime timing/quorum/deadline changes. Decode failure is an explicit named outcome and the schema column name lives with its existing constant owner. JSON audit violation counts must be zero, not merely process exit success. Original failures, J1, no reissue/CREATE/main approval and the full lab FAIL remain.'
python3 - <<'PY'
import os
from pathlib import Path
p=Path(os.environ['CARRIER_DIR'])/'run.sh';s=p.read_text()
a='  metrics before'
assert s.count(a)==1
s=s.replace(a,a+'\n  node scripts/solve.js note --id "$QUEST" --finding "$CONTINUATION_SCOPE" --kind decision --json > "$out/continuation-scope.json"',1)
a='  measure test-lint npm exec --no -- eslint "$test_file" --fix'
assert s.count(a)==1
s=s.replace(a,'  python3 "$carrier/correct-continuation.py" tests\n  python3 "$carrier/finish-continuation.py" tests\n'+a,1)
a="  python3 - <<'PY'\nimport json\nfrom pathlib import Path\np=Path('test/shards/impact-contracts.json')"
assert s.count(a)==1
s=s.replace(a,'  python3 "$carrier/correct-continuation.py" source\n  python3 "$carrier/finish-continuation.py" source\n'+a,1)
a='  measure literals node scripts/check-guideline-literals.js --json "${source_files[@]}"'
assert s.count(a)==1
check='''
  python3 - <<'CHECK_AUDITS'
from pathlib import Path
import json,os
out=Path(os.environ['PROOF_OUT'])
for name in ['decisions','grammar','literals']:
    result=json.loads((out/(name+'.stdout.txt')).read_text())
    assert result['totalViolationCount']==0,(name,result)
CHECK_AUDITS
'''
s=s.replace(a,a+check,1)
a="  test -z \"$(git status --porcelain)\"\n  ;;\npublish)"
assert s.count(a)==1
s=s.replace(a,'  bash "$carrier/mutate-continuation.sh"\n'+a,1)
(Path(os.environ['PROOF_OUT'])/'executed-run.sh').write_text(s)
PY
if [ "$1" = measure ]; then
  cp "$carrier/correct-continuation.py" "$carrier/finish-continuation.py" "$carrier/mutate-continuation.sh" "$out/"
fi
bash "$out/executed-run.sh" "$1"
