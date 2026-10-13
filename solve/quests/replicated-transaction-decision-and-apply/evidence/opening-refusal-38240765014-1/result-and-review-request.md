# Opening refusal — measured result and independent review request

Status: focused native/structural proof passed; independent source approval,
static closure, Quest landing and main integration remain withheld.

Measured candidate: `5b2d26f18a17362e301c76893c97261de1064d96`.
Measured baseline: `5b39cf01d8a5652652ca087b79c1637755560292`.
Source/evidence publication: `62ed226b6bd007d522738879c36b3daf155aa2bf`.
Run: `38240765014`; artifact: `11743043021`.
Archive SHA256: `b8d974f054435a4eaee72eefe51c3ea819724c405b2c30388092c6a27120cadc`.
Local content candidate: `069ea51cce08f486f8dee77e24dbf3f862986112`.
The Actions preparation checked exact SHA256 equality for all five production
files, the native test, owning impact contract and bounded design. It did not
assume the local and Actions Git commit identities were interchangeable.

## Interaction corrected

PR117 review 5489491066 / comment 4247007955 found that runtime replacement
refuses an opening with HOST_FAILURE while three production startup adapters
recognize only CORE_REFUSED. Their startup wrapper and partition cleanup were
therefore bypassed. One predicate in the canonical operation-port module now
recognizes the named failure vocabulary; all three adapters consume it and
retain the exact immutable consensus answer and original remaining retry time.
Unrelated errors are not reclassified. Existing service lifecycle owners retain
shutdown and database cleanup; there is no new cleanup coordinator or retry loop.

The native witness also confirmed a reservation-owner publication defect:
registration happened before runtime construction could refuse. A refused
same-name opening overwrote the existing live callback. Publication is now after
successful port construction. Merely unregistering an already overwritten entry
would not have restored the original owner. The successful port retains its
exact existing close/unregister lifetime; its close function is hoisted without
adding mutable registration state. The existing already-closed scalar is named
in that same owner, with no outcome-byte change or baseline increase.

## Exact measurements

- Ten unchanged native tests: baseline 0 pass / 10 behavioral failures;
  candidate 10 pass / 0 fail; source-only revert 0 pass / the same 10 failures.
  Both negative arms reach ERR_ASSERTION with the intended adapter or registry
  assertion. Setup/import failures and empty output are not accepted as reds.
- Six initializer cases use real PartitionService, MessageGroupService and
  WasmServiceReplica initialization and shutdown, both before shared recovery
  and inside an actual shared failure's retry window. They require exact typed
  owner data, no native entry for refused work, released connections, absent
  reservation callbacks and successful ordinary reopening on the same file.
- Four native constructor cases exercise UNHEALTHY and REPLACING with a fresh
  identity and with a live same-name owner. Subsequent reservation must reach
  the original database, never the rejected constructor's database.
- Sixteen regression files: 80 pass / 0 fail, including the new ten and the
  earlier native replacement cases. Every measured case is within the unchanged
  unit/integration duration bar. Maximum unit case: 1745.200997 ms; maximum
  integration case: 391.443351 ms. These are case times, not file/runner times.
- Focused ESLint, changed-production literal audit, impact registry and whitespace
  checks pass. Registry reports 60 contracts / 31 coupled pairs. The witness is
  registered in the existing interactions and their exactly two endpoints;
  generated metadata is refreshed through the existing producer.

The full guideline command still stops at 311 above-baseline literal violations
and 1267 matched inherited entries. Baseline and candidate outputs are identical.
Later checks in that chained command are NOT claimed green. The actual operation
boundary audit still rejects the unchanged snapshot-install lifecycle import.
No allowlist exception, baseline increase or gate waiver was introduced. The
workflow remains red and allRunGatesPassed remains false, while focusedProofPassed
is true.

## Earlier local attempts retained separately

The source workspace and npm-ci dependencies were recovered from verified Actions
artifact 11741252299; its source tree and input commit were reconstructed exactly.
Local Node v22.16.0 and Actions Node v22.23.3 both measured the final content.
The local evidence package retains first native reds, an early fixture assertion
that required null rather than permitting the partition's absent undefined port,
an outer command interruption, structural lint/registry diagnostics and the
312-count intermediate literal failure. They are not overwritten or counted as
successful final measurements. The final local ten-case matrix and 80-case run
were repeated after the last source correction. The authoritative hosted result
for this publication is the candidate and raw outputs named above.

## Independent review requested

Read design-opening-refusal-20261012.md and this run's source.patch, prepare.log,
baseline/candidate/revert raw TAP, regressions.json and audit outputs. Review
recovery-replay, admission-gating, concurrency-serialization, owner-interaction
and harness-fidelity against the current source, not just the first one-line
runtime patch. Attack exact startup failure propagation, identity and deadline
preservation, all acquired resource cleanup, refused same-name publication,
ordinary errors versus canonical failures, deferred identity acknowledgement,
closure ordering and fresh opening after owned recovery. Confirm the original
runtime repair and retained startup/certification obligations are not weakened.

This is in-process native evidence with real service initializers and injected
core-boundary faults, not physical RF3/multi-host certification, all storage-fault
permutations, full SQL/CDC startup or complete release readiness. No directly
launched subagent or approving Solver verification is claimed. The independent
review must report its actual scope and all unresolved findings. Main remains
outside this review-only PR.
