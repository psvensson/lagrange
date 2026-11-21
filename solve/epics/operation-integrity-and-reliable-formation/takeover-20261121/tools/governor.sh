#!/bin/bash
temp() { sensors 2>/dev/null | awk '/Package id 0/{gsub(/[^0-9.]/,"",$4); print int($4)}'; }
tree() { local p=$1; echo $p; for c in $(pgrep -P $p 2>/dev/null); do tree $c; done; }
# Targets are ONLY the published heavy job (its session/process group and descendants). Matching command lines for
# "tools/heavy.sh" also matched the agents' own wrapper shells and paused their children (commit attempts returned 147).
targets() { [ -s /tmp/lagrange-local-heavy.pgid ] || return 0; local g; g=$(cat /tmp/lagrange-local-heavy.pgid); kill -0 "$g" 2>/dev/null || return 0; { tree "$g"; pgrep -g "$g"; pgrep -s "$g"; } 2>/dev/null | sort -u; }
state=run; L=/mnt/data/peter/projects/lagrange-takeover-20261121/lab/governor.log
for i in $(seq 1 1080); do
  t=$(temp); t=${t:-0}
  if [ "$state" = run ] && [ "$t" -ge 78 ]; then p=$(targets); [ -n "$p" ] && kill -STOP $p 2>/dev/null && state=paused && echo "$(date -u +%T) PAUSE cpu=${t}C pids=$(echo $p | wc -w)" >> $L
  elif [ "$state" = paused ] && [ "$t" -le 70 ]; then p=$(targets); [ -n "$p" ] && kill -CONT $p 2>/dev/null; state=run; echo "$(date -u +%T) RESUME cpu=${t}C" >> $L
  elif [ "$state" = paused ]; then p=$(targets); [ -n "$p" ] && kill -STOP $p 2>/dev/null; fi
  # Safety net: when cool, continue any stopped process that sits in a lagrange worktree and is not currently tracked.
  if [ "$state" = run ]; then for q in $(ps -eo pid,stat | awk '$2 ~ /^T/{print $1}'); do c=$(readlink /proc/$q/cwd 2>/dev/null); case "$c" in /mnt/data/peter/projects/.worktrees/*|/mnt/data/peter/projects/lagrange*) kill -CONT $q 2>/dev/null && echo "$(date -u +%T) CONT orphan $q ($c)" >> $L;; esac; done; fi
  sleep 10
done
p=$(targets); [ -n "$p" ] && kill -CONT $p 2>/dev/null; echo "$(date -u +%T) governor window ended" >> $L
