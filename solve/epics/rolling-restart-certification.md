---
id: rolling-restart-certification
status: open
proof: certification
roadmapRow: RM-0.1-fs-rolling-restart
graduatesTo: null
quests:
  - rolling-restart-representative-certification
authorizes:
  - test/distributed
  - scripts/checks
  - scripts/rolling-restart-stat-gate.sh
  - scripts/rolling-restart-stat-gate-summary.js
  - scripts/calibrate-machine.js
  - docs/convergence-donewhen-metric.md
doneWhen:
  probe: script
  args:
    command: node scripts/checks/certification-verdict.js --scenario rolling-restart --metric
---

# Rolling-restart certification

A rolling restart of every node keeps the cluster serving and converges back to full replication.

Derived by the solve-v2 migration from the quests listed above (amendment 7).
The operator seals `doneWhen` and `authorizes` before new quests start here;
until then the epic is `legacy: true` and its scope is unenforced.

## Sealed acceptance

Sealed 2026-09-07 from the derived-epic packet in
`solve/epics/solve-v2/derived-epic-sealing-packets.md`.

`doneWhen` measures the canonical stat-gate verdict through the generic
certification projector: the gate runs the window, the summary tool classifies
it, `test/distributed/config/convergence-sealed-bars.json` holds the population
it must be drawn from, and the projector reports what the newest window does
not carry. It recomputes nothing.

A pass means one clean fixed-code window of at least fifteen runs on
`calibrated-local-container-v1` produced an ABOVE_BAR verdict with a Wilson-95
lower bound at or above the sealed 0.357, and that no run in it lost or failed
to verify an acknowledged write, corrupted data, exited a node unexpectedly,
blinded the oracle or executed stale source.

**What this does not demonstrate.** The sentence above - that a rolling restart
keeps the cluster serving. A lower bound of 0.357 is compatible with most runs
in the window failing; the bar is a floor on a pass rate, set where the evidence
was. It says nothing about other hardware classes, other node counts, or other
restart schedules. Proving the liveness sentence is a separate claim and needs
its own quest.

`authorizes` covers the harness, the gate scripts, the sealed-bar file and the
projector. Not `src/`: this epic certifies behaviour, it does not change it.
