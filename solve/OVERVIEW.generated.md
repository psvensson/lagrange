# Work overview — top-down

Hierarchy: roadmap → epic → spec → quest → attempt, with the closure ledger
tracking cross-quest invariants alongside. Roadmap / epic / spec / ledger are
static documents you read; the **Quest log is the only moving part**, and a
Quest closes only by the Solver terminal state (SOLVED / EXHAUSTED). This is a
projection — act on a record only after reading its file.

## 1 · Roadmap rows in play — 1
_Scope authority (roadmap.md). A row is in play when an epic or quest cites it via links.roadmapRow._

| row                       | epics                          | quests                         |
| ------------------------- | ------------------------------ | ------------------------------ |
| RM-0.1-fs-rolling-restart | topology-convergence-hardening | rolling-restart-core-stability |

## 2 · Epics — 2
_Lightweight planning above specs (.kiro/epics/) — sharpen intent before a sealed doneWhen exists._

| id                             | status     | roadmapRow                | graduatesTo                                 |
| ------------------------------ | ---------- | ------------------------- | ------------------------------------------- |
| steering-doc-clarity           | graduated  | —                         | —                                           |
| topology-convergence-hardening | sharpening | RM-0.1-fs-rolling-restart | membership-lifecycle-placement-hard-cutover |

## 3 · Specs — 9 (1 with open quests)
_Detailed planning (.kiro/specs/): design + requirements + tasks. Implemented by quests, not a closure surface._

| spec                                        | quests (open/total) | quest ids                                                                                                                                                                           |
| ------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| activation-cost-aware-placement             | 0/0                 | —                                                                                                                                                                                   |
| core-topology-control-plane-rewrite         | 0/5                 | model-bounded-retry-exit-routing, model-owner-trace-validation, model-owner-transition-recoverable-wake, model-projection-freshness-epoch-fencing, model-readiness-handoff-liveness |
| developer-experience-remediation            | 0/0                 | —                                                                                                                                                                                   |
| hlc-cross-leader-monotonicity               | 0/1                 | hlc-cross-leader-monotonicity                                                                                                                                                       |
| membership-lifecycle-placement-hard-cutover | 2/2                 | membership-publication-drain-determinism, rolling-restart-core-stability                                                                                                            |
| metastable-convergence-resilience           | 0/0                 | —                                                                                                                                                                                   |
| proximity-spray-cdc-propagation-overlay     | 0/1                 | cdc-cache-delete-resurrection                                                                                                                                                       |
| raft-logic-migration                        | 0/0                 | —                                                                                                                                                                                   |
| spec-led-runtime-modularization             | 0/0                 | —                                                                                                                                                                                   |

## 4 · Quests — 3 open / 19 terminal
_The only measured layer (solve/quests/). Sealed goal; attempts and findings live in the append-only log._

### Open

| id                                       | class   | spec                                        | attempts | reopens | closes                 |
| ---------------------------------------- | ------- | ------------------------------------------- | -------- | ------- | ---------------------- |
| membership-publication-drain-determinism | product | membership-lifecycle-placement-hard-cutover | 0        | 0       | CL-001                 |
| non-docker-validation-green              | product | —                                           | 0        | 0       | —                      |
| rolling-restart-core-stability           | product | membership-lifecycle-placement-hard-cutover | 74       | 13      | CL-001, CL-004, CL-030 |

### Terminal

| id                                        | class   | outcome | attempts |
| ----------------------------------------- | ------- | ------- | -------- |
| alloy-execution-guardrails-verifier-fix   | product | solved  | 1        |
| autonomy-and-parallel-defaults            | process | solved  | 0        |
| cdc-cache-delete-resurrection             | product | solved  | 1        |
| core-system-logic-alloy-adjacency         | product | solved  | 1        |
| core-system-logic-model-adjacency         | product | solved  | 1        |
| hlc-cross-leader-monotonicity             | product | solved  | 1        |
| legacy-work-tracker-removal               | product | solved  | 1        |
| model-bounded-retry-exit-routing          | product | solved  | 1        |
| model-owner-trace-validation              | product | solved  | 1        |
| model-owner-transition-recoverable-wake   | product | solved  | 1        |
| model-projection-freshness-epoch-fencing  | product | solved  | 1        |
| model-readiness-handoff-liveness          | product | solved  | 1        |
| quest-git-handoff-requirement             | product | solved  | 1        |
| quest-model-guidance-theory-use           | product | solved  | 1        |
| quest-source-change-subagent-verification | product | solved  | 1        |
| quest-system-continuation-gates           | process | solved  | 1        |
| quest-workflow-signal-quality             | process | solved  | 1        |
| steering-doc-clarity                      | process | solved  | 0        |
| workflow-linking-and-memory-loop          | process | solved  | 0        |

## 5 · Closure frontier — 15 active of 42
_Cross-quest invariant tracking (closure-ledger/CL-###), grouped by subsystem. Quests claim these via links.closesCL._

Areas: harness-control-snapshot (2) · harness-oracle (2) · membership-publication (2) · placement-planning-feedback (1) · placement-priority-spread (3) · readiness-projection (3) · restart-rejoin-identity (1) · transport-replication-backpressure (1)

### harness-control-snapshot — 2

| id     | status   | last gate | concern                  |
| ------ | -------- | --------- | ------------------------ |
| CL-002 | narrowed | —         | harness-control-snapshot |
| CL-025 | narrowed | —         | harness-control-snapshot |

### harness-oracle — 2

| id     | status | last gate        | concern                                                     |
| ------ | ------ | ---------------- | ----------------------------------------------------------- |
| CL-030 | open   | 20260612T173105Z | harness-oracle (primary) + node-resource-safety (secondary) |
| CL-031 | open   | 20260612T223302Z | harness-oracle (blindness) + node-resource-safety (root)    |

### membership-publication — 2

| id     | status   | last gate        | concern                                                                          |
| ------ | -------- | ---------------- | -------------------------------------------------------------------------------- |
| CL-001 | narrowed | 20260616T071019Z | membership-publication                                                           |
| CL-039 | open     | 20260615T205549Z | membership-publication write-substrate / control-plane raft leadership placement |

### placement-planning-feedback — 1

| id     | status   | last gate        | concern                     |
| ------ | -------- | ---------------- | --------------------------- |
| CL-008 | narrowed | 20260611T061307Z | placement-planning-feedback |

### placement-priority-spread — 3

| id     | status   | last gate | concern                                                 |
| ------ | -------- | --------- | ------------------------------------------------------- |
| CL-023 | narrowed | —         | placement-priority-spread                               |
| CL-028 | narrowed | —         | placement-priority-spread                               |
| CL-029 | narrowed | —         | placement-priority-spread (operation workflow liveness) |

### readiness-projection — 3

| id     | status   | last gate        | concern              |
| ------ | -------- | ---------------- | -------------------- |
| CL-004 | narrowed | —                | readiness-projection |
| CL-005 | narrowed | —                | readiness-projection |
| CL-022 | narrowed | 20260612T085908Z | readiness-projection |

### restart-rejoin-identity — 1

| id     | status   | last gate | concern                 |
| ------ | -------- | --------- | ----------------------- |
| CL-024 | narrowed | —         | restart-rejoin-identity |

### transport-replication-backpressure — 1

| id     | status | last gate        | concern                            |
| ------ | ------ | ---------------- | ---------------------------------- |
| CL-009 | open   | 20260611T052934Z | transport-replication-backpressure |

---
Drill in: `npm run solve:status -- --id <q>` · `npm run trace -- --spec <s>` · `npm run solve:report -- --id <q>` · `npm run frontier`
