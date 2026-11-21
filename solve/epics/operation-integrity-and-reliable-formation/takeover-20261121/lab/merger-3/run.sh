#!/bin/bash
# usage: run.sh <label> <sha40> <listfile>
# Rotate the three lab hosts until one accepts the run (runner failures are not results).
label=$1; sha=$2; list=$3
L=/mnt/data/peter/projects/lagrange-takeover-20261121/lab/merger-3
cd /mnt/data/peter/projects/.worktrees/integration-candidate-20261121
for i in $(seq 1 60); do
  for h in tv-dator adam-laptop adams-gamla; do
    out=$L/$label-$h
    LAGRANGE_LAB_AGENT=claude:merger-3 node /mnt/data/peter/projects/lagrange-takeover-20261121/tools/focused.mjs \
      "$sha" "$h" 0dbed1718c2d07c1fcb8bbe56b87ac41763c262c "$out" $(cat "$list") > "$out.console" 2>&1
    if grep -q "not a ready lab machine\|no lab machine is ready\|is busy\|machine lock" "$out.console" && [ ! -s "$out/test-results.ndjson" ]; then
      mv "$out.console" "$out.runner-failure-$i.console"; rm -rf "$out"; sleep 20; continue
    fi
    echo "RUN-DONE $label $h"; exit 0
  done
done
echo "RUN-GAVE-UP $label"
