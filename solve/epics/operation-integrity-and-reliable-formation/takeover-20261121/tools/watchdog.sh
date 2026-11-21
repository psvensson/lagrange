#!/bin/bash
# Exits (so the lead is notified) when the workstation is under pressure for two consecutive samples, or after ~50 min.
bad=0
for i in $(seq 1 100); do
  load=$(cut -d' ' -f1 /proc/loadavg); avail=$(awk '/MemAvailable/{print int($2/1048576)}' /proc/meminfo)
  cpu=$(sensors 2>/dev/null | awk '/Package id 0/{gsub(/[^0-9.]/,"",$4); print int($4)}'); ssd=$(sensors 2>/dev/null | awk '/Sensor 2/{gsub(/[^0-9.]/,"",$3); print int($3)}')
  breach=$(awk -v l="$load" -v a="$avail" -v c="${cpu:-0}" -v s="${ssd:-0}" 'BEGIN{print (l>16 || a<6 || c>=80 || s>=78)?1:0}')
  if [ "$breach" = 1 ]; then bad=$((bad+1)); else bad=0; fi
  if [ $bad -ge 2 ]; then echo "WATCHDOG BREACH $(date -u +%T) load=$load availGB=$avail cpu=${cpu}C ssd=${ssd}C"; ps -eo pid,pcpu,pmem,etimes,args --sort=-pcpu | head -8 | cut -c1-160; exit 2; fi
  sleep 30
done
echo "watchdog ok after 50 min: load=$load availGB=$avail cpu=${cpu}C ssd=${ssd}C"
