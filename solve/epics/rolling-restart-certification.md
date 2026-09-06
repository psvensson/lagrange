---
id: rolling-restart-certification
status: open
proof: certification
legacy: true
roadmapRow: RM-0.1-fs-rolling-restart
graduatesTo: null
quests:
  - rolling-restart-representative-certification
authorizes: []
---

# Rolling-restart certification

A rolling restart of every node keeps the cluster serving and converges back to full replication.

Derived by the solve-v2 migration from the quests listed above (amendment 7).
The operator seals `doneWhen` and `authorizes` before new quests start here;
until then the epic is `legacy: true` and its scope is unenforced.
