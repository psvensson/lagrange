---
audience: evidence
recorded: 2026-11-02
quest: comparative-benchmark-evidence-repair
---

# Owner report 2026-11-02: comparative benchmark evidence repair

Scope: the task brief of 2026-11-01 (repair the comparative benchmark system end to end and verify
that published claims follow from actual, semantically equivalent product execution). Branches:
work `work/benchmark-evidence-repair-20261101` (history), landing
`land/comparative-benchmark-evidence-repair-20261102` (base 62d537313, then the solve-budget fix
quest, then this quest's landing commit). Nothing was merged to main.

## Final acceptance question

Do the published comparative claims follow from actual product execution? **No claim published before
2026-11-01 does.** All 262 previously published cells are withdrawn (ledger entries inv-0001..inv-0008,
forensic raw records retained). The one claim the repaired chain publishes today is a smoke observation
of PostgreSQL 17 on the lab (attempt r9); Lagrange 0.4.0 publishes as a product failure (readiness never
reached on a fresh three-node formation); TiDB publishes as unsupported because the chain has no
semantic-gate client for it yet. There is no throughput or latency claim for any system.

## Defect ledger

`defect-ledger.md`, D01-D41, each row with the proving test and the first-divergence field.
Decisive: D01 (the driver's 5 s timer counted every request as completed; the product answered after
~29.8 s with a participant failure), D11 (scale-out dispatch ran a Scenario C SELECT), D14 (history
overwritten at 86e795c44), D33-D36 and D37-D41 (defects only live runs reached: after-window identity
dropped the version error, anonymous image VOLUME classified persistent, adapter close dropped the
dataset before the after-window check, exhausted arm read as topology mismatch, six r6 harness faults).

## Identities

- Lagrange 0.4.0 measured: Docker Hub `psvensson/lagrange@sha256:c0fcc0d3…`, content identity
  `sha256:3c263af6030eea3c663dcd863813bcbcb03acdeb3c7ded8870199f4c251e2270` (sha256 over ordered
  RootFS layer digests; store independent). Five different artefacts carried the tag 0.4.0; the lab tag
  could not start a seed and the GCP campaign digest is not on Docker Hub (live diagnosis §0.3).
- Harness identity, product pins (content identity + reported version per role) and host facts are in
  every campaign header (`data/tidb-comparison/raw-observations.ndjson`).

## Owner map (one path each)

raw record `test/distributed/harness/raw-observation-record.js`; outcomes
`benchmark-operation-outcome.js`; final state `benchmark-oltp-state-reconciliation.js`; workload
`benchmark-scenario-a-run.js` + `real-product-workload-drivers.js`; deployers
`real-product-deployer-{lagrange,tidb,postgres}.js`; readiness `real-product-readiness.js` +
`real-product-lagrange-readiness-evaluation.js`; identity `real-product-identity.js`; semantic gate
`comparative-benchmark-semantic-gate.js` → `test/distributed/scenarios/scenario-a-semantic-proof-journey.js`;
retry owner `oltp-paired-retry-owner.js` (policy v2 current, v1 readable); admission
`benchmark-claim-admission.js`; ledger `benchmark-invalidation-ledger.js`; publication regenerated from
admitted records; offline recompute `scripts/checks/comparative-benchmark-recompute.js`.

## Commands

`node docs/benchmarks/cloud/run-comparative-benchmarks.mjs --profile smoke [--dry-run]` (lab default);
`npm run -s audit:comparative-recompute`; `npm run -s audit:benchmark-history-append-only`;
`node scripts/checks/comparative-benchmark-matrix-guard.js`; `npm run -s test:static`.

## Evidence locations

`chain-design.md`, `live-diagnosis-2026-11-01-summary.md`,
`product-blocker-first-divergence-2026-11-01-summary.md`,
`systemic-analysis-serve-lane-2026-11-01.md` (this directory); the live-campaign evidence (summaries,
console logs, gate evidence, readiness samples, cleanup verification) and the raw mirrors are verified
bundles on the solve-evidence pre-release, inventoried under
`solve/changes/evidence-relocation/comparative-benchmark-evidence-repair/` and
`solve/changes/evidence-relocation/learner-host-from-committed-admission/` (the closed-quest bundle).

## Results with uncertainty

Attempt r9, profile comparative-smoke-v2 (one run per arm, 100 offered operations, not comparable):
PostgreSQL 17 valid-observed, 100/100/100 committed, gate 31 proofs passed, durability inapplicable
on container-layer storage; TiDB v8.5.8 completed 100/100/100 but unsupported for publication; Lagrange
0.4.0 readiness exhausted after 120 attempts (last answer DEGRADED, PRIORITY_CONTROL_PLANE_RECOVERY_PENDING).
A smoke run supports no capacity statement. Earlier attempts r6-r8 are withdrawn (inv-0009..inv-0012).

## Reviewer findings

Five independent fresh-context verifications are recorded in the quest log
`solve/quests/comparative-benchmark-evidence-repair/log.ndjson`: df36a6d81 approve (F1-F8
fixed), 6c7960dda..b53d58036 approve, b53d58036..14713e286 reject (corpus red + duplicate owners;
lifted by the corrective attempt), 14713e286..8dd50914a approve, 8dd50914a..54bfea6e2 approve. Named
debts carried: TiDB through the one journey (follow-up quest `semantic-gate-one-journey-all-wires`),
a duplicated event-name constant, a doc heading, a singular/plural profile key, a pg Pool outside the
census, the lab-smoke example importing pg directly.

## Product finding and status

The Lagrange execution problem is a class, not a tuning issue: 13 serving decisions consume the CDC-fed
system-table cache projection as authority (systemic analysis §1). First divergence 19:50:58.093Z:
the 750 ms cache-visibility bound exceeded 0.3 s after join_ready. One instance (learner admission and
transport) is repaired in quest `learner-host-from-committed-admission` (approved in three passes,
lands after this quest); the serve lane remains closed on fresh 3/4-node formations until the successor
quests (`replica-admission-from-committed-operation`, `serve-eligibility-committed-epoch-read`,
`write-answers-at-commit-position`) land. A 5-node formation routes after ~2 min 41 s.

## Not done

Capacity campaigns (3/4/5-node) were not run: Lagrange cannot be measured honestly until the serve lane
opens. Scenario B is a product blocker (0.4.0 compiled-service model is call binding); Scenario C was not
exercised through the new chain. TiDB is not yet behind the one semantic gate.
