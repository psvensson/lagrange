#!/bin/bash
# Preserve-then-remove for listed worktrees. Never removes a tree whose preservation failed.
C=/mnt/data/peter/projects/lagrange-takeover-20261121
LOG=$C/prune/prune-log.tsv
for path in $(cat "$@"); do
  [ -d "$path" ] || { printf 'SKIP-missing\t%s\n' "$path" >> $LOG; continue; }
  short=$(basename "$path"); ok=1; note=""
  cd "$path" || continue
  head=$(git rev-parse HEAD) || { printf 'FAIL-head\t%s\n' "$path" >> $LOG; continue; }
  parent=$head
  if [ -n "$(git status --porcelain)" ]; then
    itree=$(git write-tree 2>/dev/null)
    if [ -n "$itree" ] && [ "$itree" != "$(git rev-parse HEAD^{tree})" ]; then
      parent=$(git commit-tree "$itree" -p "$head" -m "preserve(index): staged state of worktree $short before prune 2026-11-21 (unreviewed)") || ok=0
      note="$note index=$parent"
    fi
    tmpidx=$(mktemp); cp "$(git rev-parse --git-path index)" "$tmpidx"
    GIT_INDEX_FILE=$tmpidx git add -A 2>/dev/null || ok=0
    wtree=$(GIT_INDEX_FILE=$tmpidx git write-tree) || ok=0
    rm -f "$tmpidx"
    if [ $ok = 1 ]; then
      wc=$(git commit-tree "$wtree" -p "$parent" -m "preserve(worktree): uncommitted state of worktree $short before prune 2026-11-21 (unreviewed)") || ok=0
      [ $ok = 1 ] && git update-ref "refs/heads/preserve/20261121/$short" "$wc" && note="$note snapshot=$wc"
      [ "$(git rev-parse -q --verify refs/heads/preserve/20261121/$short^{tree})" = "$wtree" ] || ok=0
    fi
  fi
  # ignored, non-symlink residue except node_modules
  resid=$(git status --porcelain --ignored | awk '/^!! /{print substr($0,4)}' | grep -v '^node_modules' | while read -r p; do [ -L "$p" ] || [ ! -e "$p" ] || printf '%s\n' "$p"; done)
  if [ -n "$resid" ]; then
    printf '%s\n' "$resid" | nice -n 19 ionice -c3 tar --zstd -cf "$C/prune/residue/$short.tar.zst" -T - 2>/dev/null && zstd -tq "$C/prune/residue/$short.tar.zst" || ok=0
    note="$note residue=$(stat -c %s "$C/prune/residue/$short.tar.zst" 2>/dev/null)"
  fi
  cd /mnt/data/peter/projects/lagrange
  if [ $ok = 1 ]; then
    if nice -n 19 ionice -c3 git worktree remove --force "$path" 2>>$C/prune/prune-err.log; then
      printf 'REMOVED\t%s\t%s\t%s\n' "$path" "${head:0:9}" "$note" >> $LOG
    else printf 'FAIL-remove\t%s\t%s\t%s\n' "$path" "${head:0:9}" "$note" >> $LOG; fi
  else printf 'KEPT-preserve-failed\t%s\t%s\t%s\n' "$path" "${head:0:9}" "$note" >> $LOG; fi
done
echo prune-pass-done >> $LOG
