---
id: solve-v2
status: active
proof: deterministic
doneWhen:
  probe: script
  args:
    command: node scripts/checks/solve-v2-budget.js
quests:
  - solve-v2-phase-0-inventory
  - solve-v2-phase-1
  - solve-v2-phase-2
  - solve-v2-phase-3
  - solve-v2-phase-4
authorizes:
  - scripts/solve
  - test/solve
  - solve
  - docs/steering
  - AGENTS.md
  - CLAUDE.md
  - .githooks
---

# solve-v2 — refactor the epic/quest system

Brief of 2026-09-06 (operator). Goal: a quest system a fresh session can
operate from a 60-line `AGENTS.md`, that can express and authorize
architecture-level work, keeps binary evidence out of git, and is small enough
to read in one sitting. Design note and measured inventory:
`solve/epics/solve-v2/design.md`. Acceptance is measured by
`scripts/checks/solve-v2-budget.js`.

## Phases

| Phase | Quest | Stop |
| --- | --- | --- |
| 0 inventory and design note | `solve-v2-phase-0-inventory` | Authorization: review the design note before any deletion |
| 1 weight | `solve-v2-phase-1` | gate: no tarball tracked, no file > 1 MB under solve/, pre-commit check in place; history purge deferred (amendment 10) |
| 2 schema and CLI cutover | `solve-v2-phase-2` | gate: solve/ < 20 MB after the directory collapse; v2 solver runs phases 3–4 |
| 3 steering diet | `solve-v2-phase-3` | — |
| 4 prove it | `solve-v2-phase-4` | — |

## Acceptance metrics

Baseline measured 2026-09-06 on 14df53ccc (`--phase-0`, `wc -l` line convention). "After" columns are
appended at the end of each phase. Amendments of 2026-09-06 (design note
section 0): the 20 MB row is due at the end of phase 2, the file-count row is
replaced by the quest-directory shape row.

| Metric | Budget | Phase 0 |
| --- | --- | --- |
| solve/ on disk | < 20 MB | 324.9 MB tracked (the main tree carries a further 23 MB of untracked solve/state) |
| files > 1 MB under solve/ | 0 | 16 |
| quest directories off shape (closed: quest.json + log.ndjson; open: + evidence/) | 0 | 856 (every legacy quest file; 4947 tracked files under solve/) |
| scripts/solve.js + scripts/solve/ lines | ≤ 6000 | 34604 |
| test/solve/ lines | ≤ 6000 | 29794 |
| docs/steering/ lines | ≤ 3000 | 22316 |
| always-load lines incl. AGENTS.md | ≤ 360 | 553 (AGENTS 88 + core 277 + boot 188; CLAUDE.md is a copy of AGENTS.md) |
| rules.json | absent | present, 708 rules |
| rules.md | ≤ 25 rules | absent |
| one location per concept | yes | no: quest state in quests/, log/, changes/, artifacts/, evidence/, oracle/, report/ |
| `npm run check` and CI green at every commit | yes | measured per phase |
| phase-4 walkthrough finding with timings | present | — |

## Concepts removed (running list)

Appended per phase: phase 0 removes nothing.

## Decision log

- 2026-09-06 — `solve-v2-phase-0` was sealed solved at declaration by v1's oracle probe (metric 0 before any attempt) and could not land its script; redeclared as `solve-v2-phase-0-inventory`. Recorded in the design note as a measured v1 trap.
- 2026-09-06 — Design note approved for phase 1 with ten amendments (start
  refuses a green probe; land honors the last verdict; phase-1 gate = no
  tarballs, no file > 1 MB, pre-commit check; file-count row replaced by quest
  directory shape; migration mapping report; open-only frontier splits;
  orphans/drafts; rules seeded from evidence; evidence pre-release checks;
  history purge deferred). Recorded in design note section 0.
- 2026-09-06 — Phase 0 opened on 14df53ccc. The in-flight process quest
  `solver-friction-2026-09-06` (seven gate fixes to the v1 solver, unverified
  round 3) is parked, not landed: every file it touches is deleted in phase 2,
  and its lessons are folded into the v2 design (probe kind at declaration,
  no theory rung, scope counted as authored files). The readiness owner quest
  `critical-topology-readiness-under-source-change` keeps its recorded
  falsifier finding and is re-expressed under v2 in phase 4.
