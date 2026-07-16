# Closure record ↔ TLA+/model spec index

Design-class closure records (circular formation/recovery dependencies, lost
wakeups, liveness stalls) are bugs the docker stat-gate can never prove *fixed* —
it can only fail to disprove them. The right proof for that class is a model check:
TLC exhaustively verifies the liveness property holds under the fix and exhibits the
bug as a counterexample without it (DT7 in
[`docs/deterministic-directed-testing-plan.md`](../docs/deterministic-directed-testing-plan.md)).

Each model carries a `_bug.cfg` (the property must FAIL — the counterexample is the
bug) and a `_fixed.cfg` (the property must HOLD under the modelled fix). `npm run
model:tlc` runs them all and asserts the inverted expectations; it is wired into CI
via `npm run model:check` in `test:ci`.

| CL / concern | Spec | Property | Fix modelled |
| --- | --- | --- | --- |
| Active-gate snapshot convergence (bounded re-entry) | `active-gate/ActiveGate.tla` | `EventuallyConverged` | bounded snapshot re-entry |
| Startup readiness handoff (lost wake / unsafe ready) | `readiness-handoff/ReadinessHandoff.tla` | `ReadyRequiresCanonicalServiceability`, `DeferredOutcomeHasRecoverableWake` | recoverable deferred-outcome wake |
| CL-028 / coupled admission oscillation | `readiness-starvation/CoupledAdmission.tla` | `EventuallySteady` | decouple admission from the readiness it reopens |
| CL-001 / CL-036 readiness-starvation (priority inversion) | `readiness-starvation/ReadinessStarvation.tla` | starvation-freedom | reserve query lane / gate spread on self-ready |
| CL-001 publication convergence (lost wakeup) | `readiness-starvation/PublicationConvergence.tla` | `EventuallySteady` | `ScheduledReconcile` — owner-command independent of the diagnostic probe |
| Priority spread closure and schema admission | `priority-spread-coverage/PrioritySpreadCoverage.tla` | `PublicationRequiresCoveredSpread`, `UncoveredSpreadRetainsFollowup`, `SchemaAdmissionRequiresCoveredSpread`, `SchemaAdmissionRequiresPublishedSummary` | consume the numeric spread gap and distinct eligible operation targets instead of collapsing operation presence to a Boolean, then require the published zero-gap summary before schema admission |
| **CL-039 publication write-leadership fail-back** | **`leadership-failback/LeadershipFailback.tla`** | **`EventuallyClosed`** | **`FailBack` — leadership transfers back to a reachable seed when stranded on a restarting replica** |
| Ledger self-move re-mint livelock (formation-ledger-self-move-blocks-cluster-ops) | `ledger-selfmove-remint/LedgerSelfMoveRemint.tla` | `EventuallySettled` | `IdempotentReplan` — a leadership flap carries the in-flight spread self-move over (authoritative in-flight recognition, c7a3bf19) instead of re-minting it, so it terminalizes |
| Serialized incremental REPLACE spread | `incremental-replace-spread/IncrementalReplaceSpread.tla` | `OpenGapRetainsSerializedProgressOwner`, `SpreadNeverRegresses`, `EventuallyReachesPublishedTarget` | enforce the published target as an eventual destination and current→projected non-regression as the per-operation remove-safety floor, so `1→2→3` can complete without admitting `2→1` |

## Adding a spec for a design-class CL

1. Author `models/<area>/<Spec>.tla` with a fix toggle CONSTANT, a liveness PROPERTY,
   and `_bug.cfg` (fix off → property fails) + `_fixed.cfg` (fix on → property holds).
   Liveness models with an intentional terminal stutter need `CHECK_DEADLOCK FALSE`.
2. Add two CONFIGS entries to `scripts/model-tlc.js` (`expectConverged: true` for
   fixed; `false` + `expectedFailurePattern` for bug).
3. Run `npm run model:tlc` — every config must report `met=true`.
4. Add the row above and cite the spec from the CL record's `reproducedBy`.
