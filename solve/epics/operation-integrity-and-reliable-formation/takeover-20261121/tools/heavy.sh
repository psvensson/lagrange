#!/bin/bash
# One heavy local job at a time across ALL agents (commit hooks, generators, multi-file lint).
# usage (from the worktree):  /mnt/data/peter/projects/lagrange-takeover-20261121/tools/heavy.sh git commit -m "..."
exec 9>/tmp/lagrange-local-heavy.lock
flock -w 5400 9 || { echo "heavy.sh: lock not obtained within 90 min" >&2; exit 98; }
for i in $(seq 1 80); do
  load=$(cut -d' ' -f1 /proc/loadavg); avail=$(awk '/MemAvailable/{print int($2/1048576)}' /proc/meminfo)
  ok=$(awk -v l="$load" -v a="$avail" 'BEGIN{print (l<10 && a>=8)?1:0}')
  [ "$ok" = 1 ] && break
  echo "heavy.sh: waiting (load=$load availGB=$avail)" >&2; sleep 30
done
[ "$ok" = 1 ] || { echo "heavy.sh: machine not ready after 40 min (load=$load availGB=$avail)" >&2; exit 97; }
if [ -f scripts/checks/wait-for-thermal-headroom.js ]; then node scripts/checks/wait-for-thermal-headroom.js >&2 || exit 96; fi
echo "heavy.sh: start $(date -u +%T) load=$load availGB=$avail: $1 $2" >> /mnt/data/peter/projects/lagrange-takeover-20261121/lab/heavy.log
nice -n 19 ionice -c3 "$@"; rc=$?
echo "heavy.sh: end   $(date -u +%T) rc=$rc: $1 $2" >> /mnt/data/peter/projects/lagrange-takeover-20261121/lab/heavy.log
exit $rc
