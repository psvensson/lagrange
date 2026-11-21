#!/bin/bash
temp() { sensors 2>/dev/null | awk '/Package id 0/{gsub(/[^0-9.]/,"",$4); print int($4)}'; }
tree() { local p=$1; echo $p; for c in $(pgrep -P $p 2>/dev/null); do tree $c; done; }
targets() { if [ -s /tmp/lagrange-local-heavy.pgid ]; then tree $(cat /tmp/lagrange-local-heavy.pgid); fi; for h in $(pgrep -f 'tools/heavy.sh'); do for c in $(pgrep -P $h); do tree $c; done; done | sort -u; }
state=run; L=/mnt/data/peter/projects/lagrange-takeover-20261121/lab/governor.log
for i in $(seq 1 1080); do
  t=$(temp); t=${t:-0}
  if [ "$state" = run ] && [ "$t" -ge 78 ]; then p=$(targets); [ -n "$p" ] && kill -STOP $p 2>/dev/null && state=paused && echo "$(date -u +%T) PAUSE cpu=${t}C pids=$(echo $p | wc -w)" >> $L
  elif [ "$state" = paused ] && [ "$t" -le 70 ]; then p=$(targets); [ -n "$p" ] && kill -CONT $p 2>/dev/null; state=run; echo "$(date -u +%T) RESUME cpu=${t}C" >> $L
  elif [ "$state" = paused ]; then p=$(targets); [ -n "$p" ] && kill -STOP $p 2>/dev/null; fi
  sleep 10
done
p=$(targets); [ -n "$p" ] && kill -CONT $p 2>/dev/null; echo "$(date -u +%T) governor window ended" >> $L
