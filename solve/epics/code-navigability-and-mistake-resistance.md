---
id: code-navigability-and-mistake-resistance
status: open
proof: deterministic
roadmapRow: null
graduatesTo: null
doneWhen:
  probe: script
  args:
    command: node scripts/checks/code-navigability-budget.js --metric
quests:
  - code-navigability-budget-check
  - navigability-guideline-audit
  - state-read-named-defaults
  - always-promise-port-answers
  - readiness-service-constructor-injection
  - partition-service-constructor-injection
  - system-table-row-decoders
  - source-directory-owner-index
  - failure-bundle-evidence-completeness
authorizes:
  - eslint.config.js
  - package.json
  - scripts
  - test
  - docs/development
  - docs/steering/router.md
  - src/control-plane
  - src/partition
  - src/raft
  - src/rebalancer
  - src/bootstrap
  - src/node
  - src/**/INDEX.md
---

# Code navigability and mistake resistance

Eight recurring shapes in `src/` make an agent re-derive what an owner is and
what a value means before it can change anything: feature detection on owner
ports, process-local identity-keyed stores, prototype-copy method bags and deep
inheritance chains, alias reads on row fields, defaults on state reads,
value-or-promise returns, flat directories of two hundred files, and failure
bundles whose evidence window does not cover the failure. The 2026-11-07
verification of the formation ADD admission gap found all eight on one path
(`solve/quests/fresh-formation-user-table-routability`, memory entry
`formation-add-admission-continuation-gap-2026-11-07`). This epic makes each
shape measurable once, stops its growth with a one-way ratchet, promotes the
near-zero shapes to ESLint, and retires the backlog in two pilot owners whose
cost was measured in that session. It is done when the budget below reports no
unmet row; the ratchets outlive the epic as ordinary static gates.

## Budget

Baselines were measured at `e29e295a6` (origin/main, 2026-11-08) by an espree
walk over the 2034 files under `src/`. A cap row is met when the count is at or
below its cap and the cap only moves down (R23); a zero row is the epic's work.
Change a number here and in the budget script together, never in one place.

| Row | What it counts | Baseline | Target |
| --- | --- | --- | --- |
| `navigability_patterns_without_ratchet` | patterns below with no audit baseline or ESLint rule | 7 | 0 |
| `owner_port_feature_detection` | `typeof <member> === 'function'` / `TYPE.FUNCTION` on `this.` or a parameter member | 1322 | cap 1322 |
| `owner_port_feature_detection_pilot_owners` | the same, in `control-plane-readiness-*.js`, `partition-service*.js` and the two rebalancer consumers of the planning-answer chain | 144 | 0 |
| `identity_keyed_module_state` | module-scope `new WeakMap()`, `Map()`, `Set()`, `WeakSet()` with no arguments | 87 | cap 87 |
| `identity_keyed_module_state_admission_path` | the same, in `partition-service-raft-membership-administration.js` and `raft-rs-group-membership-admission.js` (branch `work/composed-05-comparison-readiness-20261103` adds a fourth in `partition-replica-admission.js`) | 3 | 0 |
| `prototype_copy_bags` | `Object.getOwnPropertyNames(X.prototype)` copy loops | 59 | cap 59 |
| `prototype_copy_bags_partition_service` | the same, in `partition-service*.js` | 12 | 0 |
| `inheritance_depth_over_two` | classes whose `extends` chain is deeper than two | 65 | cap 65 |
| `inheritance_depth_over_two_readiness` | the same, among the control-plane readiness classes (nine `extends` today) | 7 | 0 |
| `row_field_alias_reads` | `a.x \|\| a.y` or `??` where `x` and `y` are one name in two spellings | 399 | cap 399 |
| `formation_system_tables_without_decoder` | of `services`, `nodes`, `replica_operations`, tables with no single decoder module | 3 | 0 |
| `state_read_defaults` | `\|\|` or `??` default on a `status`, `role`, `raft_role`, `workflow_step`, `phase` or `step` read | 159 | 0 |
| `value_or_promise_then_checks` | `typeof x.then === 'function'` at a call site | 26 | 0 |
| `source_directories_over_cap` | `src` directories with more than 120 `.js` files directly inside | 4 | 0 |
| `stale_owner_indexes` | `src` directories whose `INDEX.md` is missing or disagrees with its generator | 57 | 0 |
| `failure_bundle_log_windows_without_coverage` | bundle writers that truncate node logs (`LOG_TAIL_LINE_COUNT`) without recording coverage | 1 | 0 |

Deepest chains today: `OperationWorkflowOwner` (15), `SQLQueryEngine` (11).
They are recorded, not in scope (R17); the readiness chain is the pilot.

## Mechanism

- **One detector per pattern.** `scripts/checks/code-navigability-detectors.js`
  owns the AST detection; the budget script and the guideline audit both read
  it. When a pattern reaches zero it is promoted to an ESLint
  `no-restricted-syntax` selector in `eslint.config.js`, the audit drops that
  pattern, and the budget row reads the ESLint report count for the rule id.
  Detection never has two owners (R01, R05).
- **Audit first, ESLint second.** `scripts/check-guideline-navigability.js`
  follows `check-guideline-silent-catch.js`: per-violation baseline JSON,
  `--update-baseline`, the tighten hint, chained into `npm run audit:guidelines`.
  ESLint is single-file and binary, so it only gets a pattern at zero.
- **Pilot owners retire backlog.** The readiness chain (24 files) and the
  partition service (41 files, 13 `create*Methods` bags) become one class each
  with named constructor collaborators validated once; duck-typing at their
  call sites is deleted in the same change. Behaviour is unchanged; the
  formation ADD continuation owner remains the formation work's repair.
- **Rows read the tree.** Every row is computable from a checkout; no row
  reads a live run, so the probe measures and never acts (R27).

## Order

1. `code-navigability-budget-check` seals the baselines above as a script with
   a fixture-tree witness; every other quest's probe reads its rows.
2. `navigability-guideline-audit` stops growth of every pattern.
3. `state-read-named-defaults`, `always-promise-port-answers`: zero and
   promote to ESLint.
4. `readiness-service-constructor-injection`, then
   `partition-service-constructor-injection`.
5. `system-table-row-decoders`, `source-directory-owner-index`,
   `failure-bundle-evidence-completeness` in any order.

## Decision log

- 2026-11-08: created from the code-quality review that followed the
  formation ADD admission verification. The apparatus budget row `open epics`
  was already over (18 of 12); this epic makes it 19 and should close or
  graduate its ratchets into `audit:guidelines` rather than stay open as a
  home for backlog burn-down.
