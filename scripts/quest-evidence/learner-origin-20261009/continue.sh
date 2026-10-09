#!/usr/bin/env bash
set -euo pipefail
carrier="$GITHUB_WORKSPACE/carrier-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT/scripts/quest-evidence/learner-origin-20261009"
out="$GITHUB_WORKSPACE/learner-origin-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
node --input-type=module -e "import {refuseUnderProbe} from './src/test-helpers/probe-guard.js'; refuseUnderProbe('the learner-origin continuation');"
mkdir -p "$out"
export CARRIER_DIR="$carrier" PROOF_OUT="$out"
python3 - <<'PY'
import os
from pathlib import Path
p=Path(os.environ['CARRIER_DIR'])/'run.sh';s=p.read_text()
a='  measure test-lint npm exec --no -- eslint "$test_file" --fix'
assert s.count(a)==1
s=s.replace(a,'  python3 "$carrier/correct-continuation.py" tests\n'+a,1)
a="  python3 - <<'PY'\nimport json\nfrom pathlib import Path\np=Path('test/shards/impact-contracts.json')"
assert s.count(a)==1
s=s.replace(a,'  python3 "$carrier/correct-continuation.py" source\n'+a,1)
a="  test -z \"$(git status --porcelain)\"\n  ;;\npublish)"
assert s.count(a)==1
s=s.replace(a,'  bash "$carrier/mutate-continuation.sh"\n'+a,1)
(Path(os.environ['PROOF_OUT'])/'executed-run.sh').write_text(s)
PY
if [ "$1" = measure ]; then
  cp "$carrier/correct-continuation.py" "$carrier/mutate-continuation.sh" "$out/"
  node scripts/solve.js note --id "$QUEST" --finding '2026-10-09 continuation from preserved failed origin attempt 37892536228. The corrected generic recovery package is already published separately at 44e968be4e2f2db03b37d8a26470fd0a3b256fee (PR110); it is not overwritten or hot-path wired here. Same-file reopen retains physical lifecycle identity; measure new connection/port and actual runtime reconstruction instead. Advance all surviving native clocks for election. Settle the founding no-op before transaction-cut comparison. Absent per-peer origins are omitted in canonical checkpoint descriptors, not serialized as forbidden null. Existing native/source identities, J1, noncommitment refusals, release gates and original failed artifacts remain intact. This is necessary origin/apply/checkpoint work in the existing FreshMG Quest, not main merge authorization.' --kind decision --json > "$out/continuation-scope.json"
fi
bash "$out/executed-run.sh" "$1"
