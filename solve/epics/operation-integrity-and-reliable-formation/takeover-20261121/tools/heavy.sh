#!/bin/bash
# One heavy local job at a time across ALL agents (commit hooks, generators, multi-file lint),
# confined to two physical cores, niced, gated on load/memory/temperature, pausable by the thermal governor.
# The job inherits the lock descriptor, so the lock is held until the job itself ends even if this wrapper is killed.
# usage (from the worktree):  /mnt/data/peter/projects/lagrange-takeover-20261121/tools/heavy.sh git commit -m "..."
exec 9>/tmp/lagrange-local-heavy.lock
flock -w 7200 9 || { echo "heavy.sh: lock not obtained within 120 min" >&2; exit 98; }
temp() { sensors 2>/dev/null | awk '/Package id 0/{gsub(/[^0-9.]/,"",$4); print int($4)}'; }
for i in $(seq 1 120); do
  load=$(cut -d' ' -f1 /proc/loadavg); avail=$(awk '/MemAvailable/{print int($2/1048576)}' /proc/meminfo); t=$(temp)
  ok=$(awk -v l="$load" -v a="$avail" -v t="${t:-0}" 'BEGIN{print (l<10 && a>=7 && t<72)?1:0}')
  [ "$ok" = 1 ] && break
  echo "heavy.sh: waiting (load=$load availGB=$avail cpu=${t}C)" >&2; sleep 30
done
[ "$ok" = 1 ] || { echo "heavy.sh: machine not ready after 60 min (load=$load availGB=$avail cpu=${t}C)" >&2; exit 97; }
L=/mnt/data/peter/projects/lagrange-takeover-20261121/lab/heavy.log
echo "heavy.sh: start $(date -u +%T) load=$load availGB=$avail cpu=${t}C: $1 $2" >> $L
setsid taskset -c 8,9,18,19 nice -n 19 ionice -c3 "$@" &
child=$!; echo "$child" > /tmp/lagrange-local-heavy.pgid
wait $child; rc=$?
rm -f /tmp/lagrange-local-heavy.pgid
echo "heavy.sh: end   $(date -u +%T) rc=$rc: $1 $2" >> $L
exit $rc
