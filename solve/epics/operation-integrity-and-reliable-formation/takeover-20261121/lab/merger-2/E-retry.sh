#!/bin/bash
# Rotate the three lab hosts until one accepts the run (runner failures are not results).
cd /mnt/data/peter/projects/.worktrees/integration-candidate-20261121
for i in $(seq 1 40); do
  for h in tv-dator adam-laptop adams-gamla; do
    out=/mnt/data/peter/projects/lagrange-takeover-20261121/lab/merger-2/E-8d897772b-$h
    LAGRANGE_LAB_AGENT=claude:merger-2 node /mnt/data/peter/projects/lagrange-takeover-20261121/lab/../tools/focused.mjs 8d897772b95e07b7b16862def21c1a7bbf81ae45 $h 0dbed1718c2d07c1fcb8bbe56b87ac41763c262c $out $(cat /mnt/data/peter/projects/lagrange-takeover-20261121/lab/merger-2/E-list.txt) > $out.console 2>&1
    if grep -q "not a ready lab machine\|no lab machine is ready" $out.console; then mv $out.console $out.runner-failure-$i.console; rm -rf $out; sleep 20; continue; fi
    echo "E-RUN-DONE $h"; exit 0
  done
done
echo E-RUN-GAVE-UP
