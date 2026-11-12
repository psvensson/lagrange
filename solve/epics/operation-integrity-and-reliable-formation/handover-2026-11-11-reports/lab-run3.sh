#!/bin/bash
set -euo pipefail
cd /mnt/data/peter/projects/lagrange-wip-lab
test -z "$(git status --porcelain)"
npm run -s test:metadata:refresh
git add -A test docs scripts 2>/dev/null || true
if ! git diff --cached --quiet; then LAGRANGE_SKIP_PRECOMMIT=1 git commit -q -m "wip: regenerate test metadata after triage units A-D"; fi
test -z "$(git status --porcelain)"
TIP=$(git rev-parse HEAD)
echo "TIP=$TIP $(date +%T)"
git ls-remote origin refs/heads/wip/formation-stability-20261111
git push origin "$TIP:refs/heads/wip/formation-stability-20261111"
echo "PUSHED $(date +%T)"
node scripts/lab.js test all --lane all --sha "$TIP" --split
echo "LAB_DONE $(date +%T)"
