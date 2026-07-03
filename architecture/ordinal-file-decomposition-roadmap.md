# Ordinal-File Decomposition Roadmap

## Document Role

This document is the **roadmap** for removing mechanically-split, ordinally-named
source and test files (`-segment-N`, `-stage-N`, `-part-N`, and compounds such as
`-segment-4-stage-2`) and replacing them with semantically-named owner-boundary
modules.

It is the scope/sequencing companion to three existing artifacts and does not
duplicate them:

- `test-output/analysis/ordinal-segments.{json,md}` — the diagnostic inventory
  (cluster membership + proposed module names). Source of truth for *what files
  belong to which cluster*.
- `architecture/current-owner-maps.md` — the per-file **removal ledgers** (target
  owner file + deletion condition). Source of truth for *where each file's content
  goes* once a cluster is laddered. That file explicitly excludes "roadmap scope
  decisions", which is why this roadmap is separate.
- `docs/steering/system-guidelines.md` §8–9 — the durable rule forbidding new
  ordinal/grab-bag filenames. Source of truth for *the standard we are converging on*.

This roadmap is planning-only. It does not rename or move any runtime module.

## Status — COMPLETE (2026-07-03)

**The ordinal-file removal is done.** A live scan with `ORDINAL_FILE_PATTERN`
finds **0 ordinal source files and 0 ordinal test files** remaining in the tree;
every one of the original 24 clusters has been decomposed into semantically-named
owner modules (final cluster `operation-workflow-owner` landed in `c86718f6`,
Wave D). The ordinal-file count — the progress meter this roadmap tracked — has
reached zero.

This document is retained as the **reference for the sanctioned decomposition
shapes** (cited from `docs/steering/code-style.md`) and for the historical
cluster catalog below. It is no longer an active work queue.

Residual bookkeeping only (not blocking): reconcile any remaining
"Delete after …" wrapper rows in the `current-owner-maps.md` removal ledgers so
the ledgers reflect the completed state.

## Scope

**In scope:** every file whose name matches the ordinal regex
`/-(?:segment|stage|part)-\d+(?=-|\.js$)/u` (the `ORDINAL_FILE_PATTERN` in
`scripts/check-file-size-thresholds.js`), plus the `*.test-part-N` and
`*-core-NN-test-cases` test variants.

**Out of scope — legitimately numbered, intentionally NOT matched by the regex:**

- `examples/distributed-sql/01-…` … `07-…` — ordered tutorial steps.
- `src/runtime/endpoint-sync-k8s-*` — "k8s" is a domain term (Kubernetes).
- `test/solve/phase3-convergence.test.js`, `…/task27-…` — references to spec
  phases/tasks, not mechanical splits.
- `src/node/services-p1-diagnostic-logger.js` and its test — `p1` is ambiguous;
  outside the regex. **Confirm intent before touching**; treat as out of scope
  unless the owner says otherwise.

## Root cause and the two anti-patterns

The ordinal files exist because `scripts/check-file-size-thresholds.js` enforces an
**800-line cap** on source files (1500 on tests). When a file grew past the cap it
was sliced — almost always as a *class inheritance chain*:
`foo-part-1` declares a base class, `foo-part-2 extends FooPart1`, … and a stable
entry file (e.g. `partition-service.js`) re-exports the final link under the public
name. The cuts are mid-class and arbitrary; they carry no responsibility boundary.

Two tempting "fixes" are dead ends:

1. **Merge the chunks back into one file** → instantly re-violates the 800-line
   cap and re-triggers the size gate.
2. **Rename `segment-1` → `foo-a`** → cosmetic; still non-semantic, still flagged by
   the ordinal regex and forbidden by steering §9.

The only durable fix is **responsibility extraction**: pull cohesive method/concern
groups out into semantically-named modules *behind the existing stable entry point*,
then delete the ordinal chunk once nothing extends it. This is exactly what the
file-size checker's `--owner-boundary-guidance` output and the removal ledgers
prescribe.

Note the corollary of over-splitting: where a cluster's *combined* responsibility
fits under 800 lines, the extraction target may be a **single** semantically-named
file rather than several (e.g. some 2-file `*-class-part` clusters). Let the size
cap, not the original chunk count, decide how many files a cluster collapses to.

## The standard recipe (per cluster, behavior-preserving)

1. **Pin the seam.** Identify the public entry file every external caller imports
   (e.g. `partition-service.js`, `query-executor.js`, `admin-control-snapshot.js`).
   Its exported name and shape stay stable for the whole migration.
2. **Map responsibilities, not cuts.** Read the full chain and group methods by
   *actual* responsibility (e.g. admin-control-snapshot's 7 parts collapse to
   ~diagnostics / repair-orchestration / publication-handoff). The inheritance links
   are noise; the responsibilities underneath are the real modules.
3. **Extract one concern at a time** into a semantically-named module. Use the
   inventory's proposed name and — for laddered clusters — the ledger's exact target
   owner file. Wire it behind the seam by composition or an explicit
   `applyX(proto)` mixin, **never** a new numbered link. One decision table / state
   model / evidence-normalizer per extraction (the checker guidance).
4. **Keep behavior unchanged** and prove it with the cluster's existing tests.
   "Same behavior" is the contract; this is not the place to fix logic bugs.
5. **Delete the ordinal chunk** once its deletion condition is met (laddered rows
   state these explicitly), remove its ledger row, and re-run the inventory generator
   so the ordinal-file count (the real progress meter) drops.
6. **De-ordinalize the matching tests** as a follow-on (see Test Track).

## Structural-pattern playbook

The clusters fall into three structural shapes; the extraction tactic differs:

- **Inheritance chain** (`*-class-part-N`, most `*-segment-N`): `part-1` base,
  each successor `extends` the prior, public file re-exports the last link.
  *Tactic:* lift each responsibility's methods into a standalone module that takes
  the instance (or augments the prototype via a named `applyX` helper); collapse the
  chain into one thin class in the entry file that composes the named modules.
  *Verified examples:* `admin-control-snapshot-class` (A), `partition-service` (B,
  two-level segment→part), `query-executor` (C, mixed: segment-1 full base then
  part-split successors).
- **Mixin/hybrid** (`unified-rebalancer`): inheritance **plus**
  `applyUnifiedRebalancerSegmentNMethods(proto)` calls **plus** nested
  `segment-4-stage-*`. *Tactic:* the `applyX` mixins are already responsibility-ish;
  rename/relocate them to semantic modules and drop the numbered staging.
  *Verified example:* `unified-rebalancer` (E).
- **Functional pipeline** (`priority-recovery-snapshot`, `message-router-shared`):
  no classes; `stage-N` exports pure builder functions, a top stage aggregates the
  public API. *Tactic:* group functions by pipeline phase into named modules
  (`…-ingress.js`, `…-eligibility.js`, `…-publication.js`, …) — the control-plane
  snapshot ledger already names these. *Verified examples:* `priority-recovery-snapshot`
  (D), `message-router-shared` (F).

Patterns marked *verified* were confirmed by reading the chain. For all other
clusters, confirm the shape in step 2 before extracting.

## Cluster catalog (all 24)

Legend — **Ladder:** ✅ = per-file rows exist in `current-owner-maps.md`;
⬜ = inventory proposed-name only (needs laddering). **Pattern:** chain = inheritance,
pipeline = functional, hybrid = inheritance+mixin; *(v)* = verified.

| # | Cluster | Files | Proposed module / ledger target | Pattern | Ladder | Wave |
|---|---------|------|----------------------------------|---------|:------:|:----:|
| 1 | `replica-handler-class` | 2 | `replica-handler-workflow.js` | chain | ⬜ | A |
| 2 | `table-creation-service-class` | 2 | `table-creation-workflow.js` | chain | ⬜ | A |
| 3 | `message-group-service-class` | 2 | `message-group-service-workflow.js` | chain | ⬜ | A |
| 4 | `message-group-service-runtime-methods-class` | 2 | `message-group-runtime-methods.js` | chain | ⬜ | A |
| 5 | `bootstrap-readiness-owner-class` | 2 | `bootstrap-readiness-projection.js` | chain | ⬜ | A |
| 6 | `admin-websocket-api` | 3 | `admin-websocket-routing.js` | chain | ⬜ | B |
| 7 | `cdc-integration-service` | 3 | `cdc-integration-workflow.js` | chain | ⬜ | B |
| 8 | `control-plane-system-table-gateway` | 3 | `control-plane-system-table-gateway.js` | chain | ⬜ | B |
| 9 | `message-router` | 3 | `message-router-workflow.js` | chain *(v)* | ⬜ | B |
| 10 | `message-router-shared` | 4 | `message-router-shared-transport.js` | pipeline *(v)* | ⬜ | B |
| 11 | `replica-dispatch-service` | 4 | `replica-dispatch-workflow.js` | chain | ⬜ | B |
| 12 | `priority-recovery-observation-snapshot` | 4 | `priority-recovery-observation-snapshot.js` | pipeline | ⬜ | B |
| 13 | `membership-publication-coordinator` | 4 | `membership-publication-coordination.js` | pipeline | ⬜ | B |
| 14 | `membership-publication-coordinator-class` | 3 | `membership-publication-coordination.js` | chain | ⬜ | B |
| 15 | `node-joining-service` | 5 | `node-joining-workflow.js` | chain | ⬜ | B |
| 16 | `rebalance-coordinator` | 5 | `replica-operation-coordination.js` (+ ledger) | chain | ✅ | B |
| 17 | `admin-control-snapshot-class` | 7 | `admin-control-snapshot-projection.js` | chain *(v)* | ⬜ | C |
| 18 | `query-executor` | 7 | `query-execution-workflow.js` | chain *(v)* | ⬜ | C |
| 19 | `sql-query-engine` | 7 | `sql-query-planning-execution.js` | chain | ⬜ | C |
| 20 | `control-plane-readiness-service` | 10 | `control-plane-readiness-workflow.js` | chain | ⬜ | C |
| 21 | `priority-recovery-snapshot` | 11 | per-file ledger (`…-ingress/eligibility/publication/…`) | pipeline *(v)* | ✅ | D |
| 22 | `unified-rebalancer` | 11 | per-file ledger (`move-planner`, `rebalance-health-evaluation`, …) | hybrid *(v)* | ✅ | D |
| 23 | `partition-service` | 13 | `partition-service-workflow.js` | chain *(v)* | ⬜ | D |
| 24 | `operation-workflow-owner` | 19 | per-file ledger (`priority-publication-safety`, `…-recovery-*`, …) | chain | ✅ | D |

> For laddered clusters (16, 21, 22, 24) the **ledger rows in
> `current-owner-maps.md` are authoritative** and finer-grained than the single
> proposed module name in the inventory — they split one cluster across several
> named owner files. Follow the ledger, not the inventory's one-line proposal.

## Sequencing waves

Ordered by leverage: prove the recipe on small, peripheral clusters before the
large, central ones.

- **Wave A — Pilots (5 clusters, 10 files).** The 2-file `*-class-part` clusters
  (#1–5). Smallest blast radius; validates the recipe, the tooling loop, and the
  ratchet end-to-end. Land each as its own PR.
- **Wave B — Mediums (11 clusters, ~41 files, #6–16).** 3–5 file clusters.
  Includes `rebalance-coordinator` (#16), which is already laddered and so is a good
  first taste of the ledger flow.
- **Wave C — Larges (4 clusters, 31 files, #17–20).** 7–10 file clusters. Two
  are structurally verified (`admin-control-snapshot-class`, `query-executor`).
- **Wave D — Heavies (4 clusters, 54 files, #21–24).** 11–19 files each, mostly on
  the hot path (rebalancer, partition service, priority recovery). Three are
  laddered; `partition-service` needs laddering first. Highest risk — do these last,
  one concern per PR, with the cluster's full distributed test suite as the gate.

**Lift before Wave D:** ladder `partition-service` (#23) into `current-owner-maps.md`
(it is the only Wave-D cluster without per-file rows).

## Test-file track

Each source cluster has a mirrored set of ordinal test files (~196 total). They are
**not** blockers for the source extraction but should follow it within the same wave:

- `*.test-part-N.js` → split by `describe` block into intent-named files
  (e.g. `…-repair.test.js`, `…-publication.test.js`).
- `*-core-NN-test-cases.js` → name by the case family they hold.
- Keep the public test entry (the `*.test.js` that the runner discovers) stable;
  move case bodies into named, imported case modules.
- The test cap (1500 lines) is laxer than source; some test clusters may legitimately
  collapse to a single named file once duplication is removed.

## Definition of done (per cluster)

- No `-(segment|stage|part)-N` or `*.test-part-N` files remain for the cluster
  (the **ordinal-file count is the progress meter** — track it via the inventory
  generator, 136 → 0).
- `npm run audit:owner-boundary-segments` and `npm run audit:file-size` pass with **no
  new** oversized files (the 144/60 ratchet must not regress; it may tighten if a
  large chunk is removed).
- The cluster's removal-ledger rows are deleted from `current-owner-maps.md` (or, for
  un-laddered clusters, no rows are added — they go straight to named modules).
- All new files satisfy steering §8–9 (semantic owner-boundary names, no ordinals,
  no digits, no `misc`/`helpers`/`utils` grab-bags).
- The cluster's tests pass unchanged in behavior;
  `npm run audit:guideline:decision-boundaries` shows no new violations against the
  783-entry baseline.

## Guardrails and tooling

- **Size gate / ordinal guidance:** `scripts/check-file-size-thresholds.js`
  (`audit:file-size`, `audit:owner-boundary-segments`). The 144/60 ratchet is a
  **regression guard** (don't add oversized files), not the progress meter.
- **Inventory generator / progress meter:** `node scripts/inventory-ordinal-segments.js`
  regenerates `test-output/analysis/ordinal-segments.{json,md}`. The ordinal-file
  count it reports (136 → 0) is the real tracker — re-run after each cluster.
- **Decision-boundary checker:** `scripts/check-guideline-decision-boundaries.js`
  (`audit:guideline:decision-boundaries`) with its 783-entry baseline — extractions
  must not introduce new boundary violations; re-baseline only for pure line shifts.
- **Steering rule:** `docs/steering/system guidelines.md` §8–9.

## Risks and open questions

- **Hot-path clusters (Wave D).** `unified-rebalancer`, `operation-workflow-owner`,
  `partition-service`, `priority-recovery-snapshot` sit on the convergence/rebalance
  hot path. Extraction must be behavior-identical; gate on the distributed suite, not
  just unit tests. Coordinate with any in-flight convergence work to avoid editing
  these files mid-investigation.
- **Mixin vs inheritance fidelity.** The `applyX(proto)` mixin pattern (cluster E)
  and deep inheritance chains can hide method-resolution-order subtleties (overrides,
  `super` calls). Verify the composed class exposes the identical method set before
  deleting any chunk.
- **`partition-service` not yet laddered** despite being a Wave-D heavy — ladder it
  before starting.
- **`services-p1-diagnostic-logger.js`** — confirm whether `p1` is an ordinal or a
  domain token before deciding in/out of scope.
- **Cadence.** 24 source clusters + ~196 test files is a multi-wave initiative
  (the "quality wave" track), not a single change. One cluster (or one concern within
  a heavy cluster) per PR keeps each diff reviewable and the ratchet monotonic.
