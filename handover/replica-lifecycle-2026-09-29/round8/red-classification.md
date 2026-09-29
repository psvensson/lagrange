# Round 8: classification of the candidate-only reds (owner ruling 2026-09-29g section 3)

First divergence for both: the WIP tree 78b0cfbd3 over base 6831054b1.

## bootstrap-mode-routing.property (test/cdc) — FIXTURE DEBT, FIXED
- Refusal is intended: `src/cdc/cdc-integration-service-mutations.js:166-170` (SERVICES_UPSERT_FORBIDDEN) and the gateway
  `assertSystemTableMutationAllowed`; ledger rows I3/I6; quest log.ndjson:9 verifier REJECT led to it.
- Failing seeds: -1913585971 (path 7:2:2:2:2), 1468758261 (path 4:2:2:2:2).
- Applied in commit: the three routing properties exclude only (services, upsert) via `fc.pre`; a new property pins the
  refusal in every mode (red at base). Both seeds 5/5, 15/15 unseeded. TODO: record in fixture-incarnation-inventory.md.

## formation-sim-production-partitions C-1/C-2 (and C-3 passes) — FIXTURE DEBT, NOT APPLIED (owner confirm)
- `src/bootstrap/phases/seed-partitions-phase.js:77-91,217-221` fails closed when `startupServicesAdmission` is null.
  Production supplies it (`src/lagrange-runtime-startup.js:417` readSeedStartupStorageAdmission); cluster-test-helpers was
  already adapted. The simulator seed host (`test/simulation/formation-sim-production-seed-host.js:323`) does not.
- Fix: `sim-seed-host-admission.patch` (pass a virgin/empty admission). Tested: 3/3 green. Test-only, follows a constructor
  contract this quest changed; the simulator freeze (solve/epics/formation-seed-decoupling.md) forbids realism work, so the
  owner should confirm this counts as contract adaptation, not simulator work.

## NEW, not in the handover: more candidate-only simulator reds, same root cause — OWNER DECISION NEEDED
- formation-sim-charged-seed-host #6-8 and formation-sim-production-handoff D-1..D-5 (base: handoff 5/5 green).
- After the admission patch the next gap: `PartitionServiceRowOwner requires ReplicaStateMachine for activation`
  (src/partition/partition-service-row-owner.js:338-341); the candidate creates the RSM in the seed workflow REGISTRATION
  checkpoint (bootstrap-service-seed-workflow.js:290-294), which the sim host skips (it calls phaseRegistration directly).
- `sim-seed-host-replica-state-machine.patch` mirrors that step: D-1/D-2 pass, but the charged host and D-3..D-5 then fail
  the seam guard `nondeterministic_owner_seam: setInterval` from ReplicaStateMachine.startTimeoutChecker
  (src/node/replica-state-machine-timeouts.js:21, real setInterval instead of the node clock).
- Options: inject the node clock into ReplicaStateMachine timeouts (src, in this quest), or treat as simulator work (frozen).
