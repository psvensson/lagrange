# Insight proof matrix - initial planning snapshot

Date: 2026-10-20. Source anchor: `be25caa5f0c3612feec662d4feaa9ba28f8f34df`.
Status: planning index, not an acceptance ledger or runtime authority.

Read [the execution plan](insight-execution-plan-2026-10-20.md) and the
[preserved review](evidence/insight-review-2026-10-20/REVIEW.md).
The eight abstract negative controls reproduce and all eight revised
abstractions engage a positive case with no modeled violation. Those results
are not eight demonstrated production bugs, fixes, or independent approvals.

## Initial correspondence

| ID / package | Claim and abstract counterexample | Existing owner / inspected boundary | First real-owner evidence required | Initial production disposition |
| --- | --- | --- | --- | --- |
| M1 / A | Blocking recovery prerequisites can form an initial deadlock | Existing seed/participant release and control-fact producer; `PARTICIPANT_RELEASE_MISSING_FACT.CURRENT_CONTROL_OWNER` | Trace the first `current_control_owner_fact` refusal to its producer and durable origin; prove the actual prerequisites, then engage fresh and intact-restart paths without early traffic admission | UNRESOLVED. A dependency cycle is a hypothesis, not an established diagnosis |
| M2 / B | A pre-await currentness check does not fence a later STOP | U1 generic removal calls `ServiceLifecycleManager.stopReplica`; exact admitted memo is checked at the caller | Delay the real lower-owner effect across successor installation; demonstrate exact physical selection, sink admission, and retained custody after timeout | UNRESOLVED. Caller checks are observed; production reachability and the lower-owner guarantee are not certified |
| M3 / C | Two independent grants can spend the same spare allowance | Existing spread-cure authorization in `steps_history`, partition capacity and committed-membership owners | Concurrent distinct operations sharing one allowance; current membership/target checks; lost admission response and restart | UNRESOLVED. The carrier exists; `MEMBERSHIP_FENCE_NOT_EVALUATED` must not become HONOURED |
| M4 / A and C | Read-then-subscribe without recheck can lose a wake | Existing OwnerKeyReconcileQueue and REPLACE owner level-triggered wake | Changes before subscription, while a turn is held, remotely, after response loss and across restart; dropped callbacks must leave a recovery trigger | UNRESOLVED as a complete production guarantee. Existing register/recheck and retained-turn mechanisms must be reused |
| M5 / D | New actor epoch must not erase a historical durable COMMIT | Existing TX1 decision record, coordinator recovery and participant identity | Lose the decision response, replace the coordinator, recover the exact transaction and prepared manifest; reject mismatched bodies without revoking a valid commit | UNRESOLVED. No new transaction service or parallel-commit protocol is authorized |
| M6 / D and E | Data-only handoff can permit duplicate replay after a lost response | Existing TX1/TX2, outcome/replay, snapshot and topology owners | Preserve prepared obligations and replay-result resolution before exposing the successor route; use frozen terminal routes where the existing contract requires them | UNRESOLVED. Reference to a surviving authoritative receipt owner may satisfy the contract; arbitrary participant remapping may not |
| M7 / E | A global maximum can discard an unseen event from another stream | Existing snapshot/replay, message-group, CDC retention and cache owners | Independently ordered streams; gap/compaction detection; snapshot handoff; split/merge coverage and lineage transfer | UNRESOLVED. A maximum or HLC conflict order is not a complete applied frontier |
| M8 / D | Local TTL deletion while accepting an old identity permits duplicate work | Existing retry identity, result retention, acknowledgement and reclamation owners | Lost response, metadata reclamation and delayed old retry; establish identity retirement or equivalent authority before collecting evidence | UNRESOLVED. No blanket promise of infinite replay with finite retained metadata |

## Evidence and acceptance discipline

For each activated row, record the actual execution SHA, affected source blobs,
real entry path, owning sealed unit, first effect, authoritative commit or
settlement point, assumptions, raw positive/negative results and reviewer.
Keep the verdicts for safety, recovery progress, and resource/performance
behavior separate. All three are currently UNMEASURED for production by this
planning publication.

Allowed investigation outcomes are DEMONSTRATED DEFECT, ALREADY PROTECTED,
EXCLUDED BY A NAMED ENFORCED INVARIANT, or UNRESOLVED. A successful abstract
model, failed setup, all-skipped test, or inability to reproduce a schedule
cannot supply a production acceptance verdict.

Historical first causes are indexed in the existing research record at
[immutable historical-ledger input](https://github.com/psvensson/lagrange/blob/bdc94775708e357c5b0129fded70be4cea48079b/solve/epics/raft-rs-full-cutover/historical-failure-ledger-2026-10-20.md).
Do not map a test to a model solely because its name matches. Retain the
original candidate and predecessor output, and append causal findings to the
existing owner record. This matrix points to those records; it does not replace
them or declare inherited failures harmless.

## Immediate allocation

A is the first high-leverage causal investigation; B is the direct U1 safety
review. Coordinate any changes to their shared lifecycle/release boundary.
C can begin with read-only authorization/concurrency mapping. Existing TX1
work continues within its own prerequisites; D/E analysis can proceed in
parallel. One writer per changing interaction, not one writer per filename.
No production task, independent approval, new Quest seal, or release decision
is issued by this snapshot.
