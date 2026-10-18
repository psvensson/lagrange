#!/usr/bin/env bash
# Verifier: scoped static at the snapshot, then whole-tree complexity and test
# duplication at the BASE 7696c3d8e by restoring ONLY the diffed src/test paths
# in the verify worktree (worktree only, never the index), then restoring them
# from the index (= HEAD 300c360ba). The lead's expected seal modification
# (test/shards/impact-graph-seal.json) is not in the diff and is never touched.
set -u
WT=/mnt/data/peter/projects/.worktrees/verify-serving-publication-1
V=/tmp/claude-1000/-mnt-data-peter-projects-lagrange/52d74044-bacb-41c7-9eb9-7fdbcbd93317/scratchpad/verify
cd "$WT" || exit 9
MOD_SRC=$(git diff --name-only --diff-filter=M 7696c3d8e 300c360ba -- src/)
ADD_SRC=$(git diff --name-only --diff-filter=A 7696c3d8e 300c360ba -- src/)
MOD_TEST=$(git diff --name-only --diff-filter=M 7696c3d8e 300c360ba -- test/)
ADD_TEST=$(git diff --name-only --diff-filter=A 7696c3d8e 300c360ba -- test/)
ALL="$MOD_SRC $ADD_SRC $MOD_TEST $ADD_TEST"
echo "modified src: $(echo $MOD_SRC | wc -w); added src: $(echo $ADD_SRC | wc -w); modified test: $(echo $MOD_TEST | wc -w); added test: $(echo $ADD_TEST | wc -w)"
restore() { git restore --worktree -- $ALL; }
trap restore EXIT

echo "=== [snapshot] complexity --scoped touched src ==="
node scripts/check-complexity.js --scoped $MOD_SRC $ADD_SRC > "$V/complexity-scoped.log" 2>&1; echo "EXIT=$?" >> "$V/complexity-scoped.log"
tail -6 "$V/complexity-scoped.log"
echo "=== [snapshot] cognitive --scoped touched src ==="
node scripts/check-cognitive-complexity.js --scoped $MOD_SRC $ADD_SRC > "$V/cognitive-scoped.log" 2>&1; echo "EXIT=$?" >> "$V/cognitive-scoped.log"
tail -4 "$V/cognitive-scoped.log"
echo "=== [snapshot] audit:file-size verdict ==="
npm run -s audit:file-size > "$V/file-size.log" 2>&1; echo "EXIT=$?" >> "$V/file-size.log"
grep -iE "ok|fail|exceed|threshold|hint|EXIT" "$V/file-size.log" | grep -v "^[0-9]" | head -8
echo "=== [snapshot] test:duplication ==="
npm run -s test:duplication > "$V/duplication-snapshot.log" 2>&1; echo "EXIT=$?" >> "$V/duplication-snapshot.log"
grep -E "groups|lines|baseline|EXIT|FAIL|OK|exceed" "$V/duplication-snapshot.log" | head -12

echo "=== restoring diffed paths to BASE 7696c3d8e (worktree only) ==="
git restore --source=7696c3d8e --worktree -- $MOD_SRC $MOD_TEST || { echo RESTORE_TO_BASE_FAILED; exit 8; }
rm -f $ADD_SRC $ADD_TEST
git status --short > "$V/base-state-status.txt"
echo "base-state status lines: $(wc -l < "$V/base-state-status.txt")"
echo "=== [base] complexity whole ==="
node scripts/check-complexity.js > "$V/complexity-whole-base.log" 2>&1; echo "EXIT=$?" >> "$V/complexity-whole-base.log"
head -1 "$V/complexity-whole-base.log"
echo "=== [base] test:duplication ==="
npm run -s test:duplication > "$V/duplication-base.log" 2>&1; echo "EXIT=$?" >> "$V/duplication-base.log"
grep -E "groups|lines|baseline|EXIT|FAIL|OK|exceed" "$V/duplication-base.log" | head -12

echo "=== restoring diffed paths to HEAD (from index) ==="
restore
trap - EXIT
git status --short
if git diff --quiet -- src/ test/ ':!test/shards/impact-graph-seal.json' architecture/; then echo RESTORED_BYTE_IDENTICAL; else echo RESTORE_DIFFERS; fi
