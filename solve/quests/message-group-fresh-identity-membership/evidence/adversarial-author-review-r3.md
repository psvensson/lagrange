# PR109 adversarial author review - R3

Basis: reviewed source `5c1595e7ea46be54f7114657b2117571f14a5c16`, its original
R2 red/green/source-revert evidence, independent review 5460759075 and the
actual owner implementations. Followup evidence is published through
`589ce68278bd85c148bdc4568038ac3284ec2953`.

This is the author's adversarial self-review requested by the user, NOT an
independent verification, Solver landing or completion receipt. No `src/`
file changed during this R3 review and continuation.

## Verdict

**REJECT activation/main integration as a complete membership protocol.**
Preserve the useful existing operation/native boundaries. Do not add a third
metadata reread, another progress store or a second authorization coordinator.
The new fixture correction and native invalidation controls are measured
improvements, not closure of the outstanding authorization or duration gates.

## A. Repeated observation is not action-time atomicity

The source snapshots request and host bindings, reads the exact operation,
reads canonical node boots, rereads the operation, checks claim expiry and
returns OBSERVED. The existing group-admission owner then checks its actual
port and invokes native same-turn term/configuration/lifecycle/runtime fences.

R2 correctly refuses operation renewal or successful terminal settlement
occurring during its boot read. But its final operation read is asynchronous.
R3 held that exact second operation read, changed the actual fixture's node
row from boot 1 to 2, and resumed. The operation still matched and the old boot
reached the real native proposal. The intended refusal assertion failed.

A further boot read merely moves the unchecked operation window. Even one
atomic observation does not itself promise that global facts stay unchanged
while a later remote action waits. A correct design must name the action's
validity/ordering boundary, not count the SELECTs preceding it.

Three different claims must stay separate:

1. The immutable action was validly issued by its durable operation authority.
2. Required owner observations matched during the request.
3. All global facts remain current at the instant of a later native effect.

The current tests support bounded parts of the first two. They do not prove
the third. The R3 counterexample refutes a blanket action-time current-boot
claim; it does NOT by itself prove corrupted membership, an executed stale
physical CREATE, or a reachable malicious network request. Its sender and
recipient share a fixture node, the old native port stays alive, and the action
was already durably issued. Actual remote restart and the complete production
dispatch/transport binding are not exercised in that cell.

Ordinary failure, holder renewal, a node boot transition, committed membership
and physical cleanup are different facts. Failed ordinary settlement retains
an already-issued action under the sealed contract. Do not turn a metadata
check into an undocumented cancellation protocol, nor use this observation
limit to waive the sealed stale-traffic negative controls.

### Counterexample evidence

Actions 37822317153 retained the full temporarily extended test and its patch.
The additional final-read boot case fails at:
`stale boot after final operation await must not reach native proposal`.
Its other existing controls engage; the original test was restored after the
measurement. This red cell remains an open owner-interaction finding, not an
ordinary passing test or a silently adopted change in acceptance.

## B. Actual native invalidation is already effective at two boundaries

As the immediate continuation, Actions 37823435436 added and executed two
permanent cases in the existing native-consumer integration witness. The real
final repository read is held with an explicit barrier, not a timer:

- Closing the actual receiving port while the read is held prevents the old
  request from reaching a native proposal. The original durable intent remains.
- Proposing and applying another learner through the actual native port on all
  surviving voters advances the configuration generation. The delayed original
  action is refused as STALE_CONFIGURATION and issues no additional proposal.

The intervening native action is explicitly privileged fixture actuation, not
proof of a second admitted workflow. Native status is not mocked. No physical
target files or network ingress are created. The final-read metadata-only
counterexample is NOT marked fixed by these two positive refusal controls.

Source-bound test commit: `6af5472ae19ddc7ab2552e674d7702bd712ec5fa`.
The consumer passed 22 reported assertions in 1953 ms (30000-ms limit).
The unchanged branch/lane/workflow/reservation files passed 161 reported
assertions at 1048, 1075, 1327 and 1179 ms (each 2000-ms limit).
A temporary mutation removing native configuration-generation/key checking
failed at the NEW intervening-configuration assertion. Original source was
restored exactly. Strict test complexity, lint and regenerated metadata/shard
checks passed. No independent approval follows from these author measurements.

## C. Correct the fixture journal, without claiming the timing gate is fixed

`PartitionNodeCluster.buildReplica` originally opened raw better-sqlite3
files. Its fresh mode was measured as DELETE/FULL. Production
`SQLiteStore.initialize` explicitly selects WAL. `RaftRsDurableStore` uses
the connection supplied by that owner and applies its existing must-sync rule;
it does not make this test fixture's journal a production configuration.

The corrected default fixture now selects the existing production WAL
constant and explicitly selects FULL synchronization on every open/reopen.
It asserts both. It does NOT copy production's ordinary NORMAL setting or
change native must-sync behavior. Specialized tests with explicit database
wrappers retain their own declared instrumentation/configuration; this is not
a claim that such overrides cannot choose another setting.

The first experiment, 37821588598, caught a mistake in the experiment itself:
reopening WAL could return NORMAL by default. Its FULL assertion correctly
failed and prevented publication. It ran no later counterexample/mutation
controls. That failed archive is retained, not reported as a speedup.
The corrected experiment explicitly selects FULL on every reopened connection.

Paired run 37822317153, unchanged restart test:

| Stage | Reported cases | Whole-file duration |
| --- | ---: | ---: |
| Original raw journal | 16 | 6959 ms |
| WAL with explicit FULL | 16 | 3501 ms |
| Exact committed correction | 16 | 3494 ms |

This is a paired observation, not a statistical speedup or power-loss proof.
**3494 ms still exceeds the 2000-ms unit-file limit.** The neighboring proposal-
ingress file also functionally passed but exceeded its unit limit at 2516 ms.
Admission-liveness passed at 1211 ms; the consumer passed at 1584 ms in that
same exact-head run. No overall timing success is claimed.

All sixteen restart cases, independent readonly disk observations, histories,
election storms, native Ready application and refusal controls remain. No
history caching, matrix deletion, file reclassification, timeout increase,
weaker synchronous level or production persistence change was made. The two
mutations removing WAL selection and substituting NORMAL for FULL fail their
specific configuration assertions. The shared helper has more users than
this bounded run exercised; its complete change-impact gate remains required
before acceptance. The helper's preexisting broader early-open failure/lifetime
behavior is not certified by this timing experiment.

Fixture/test-metadata commit: `310cb0209d92ecc38cc82bda5dd3d398e8dc4ebd`.
Evidence-bearing commit: `7cc110614db84a6d65e00438452fb935dc199179`.

## D. Corrected historical prose; original evidence is unchanged

The machine evidence for 37803287356 says that
`test/rebalancer/replace-replica-workflow.test.js` passed at BOTH GCP checkouts.
`rebalance-coordinator-owner-path-convergence.test.js` failed at both. The
previous prose incorrectly named the latter as the both-green file.

The machine record's three matching canonical digest fields contain:
`8b56d1f9f56a60058dbe354bee8429830c87a812c3cbfeef7c4191108820ee17`.
The old prose's `d1183234...a516bb` value was not that canonical digest.

[The explicit additive correction](lab-attribution-37803287356-correction.md)
overwrites neither the original machine evidence nor append-only history.
It corrects attribution, not the original lab FAIL or an underlying defect.

## E. Immediate next owner interaction and stop conditions

Continue under the existing FreshMG Quest, not a new architecture epic.
The next source increment is the **issued-action -> actual recipient -> exact
committed learner outcome** interaction. It precedes any planner/handler
unpark and physical CREATE. Prepare its red witness before source changes.

The existing `RouterConnectionAuthorityOwner` already owns adopted-primary
connection identity, current boot evidence and replacement/disconnection.
Its watermark is explicitly NOT proof of the live primary. Its general
UNKNOWN compatibility policy must not become an implicit grant for privileged
membership traffic. Reuse that owner for actual sender/recipient bindings,
not request fields or a second table-derived connection registry. No transport
code is changed by this review.

Required work in dependency order:

1. Specify the point at which an issued action remains owed, and the exact
   existing transition/fence that invalidates a delayed conflicting action.
   Keep J1 forward recovery after durable promotion authorization. If current
   sealed terms require a different policy, record explicit supersession;
   this author review grants none.
2. Bind actual transport/host lifetime to the native consumer. Test a replaced
   or closed connection during a held authorization read, old recipient port,
   successor holder, failed ordinary settlement, and an unavailable owner.
   Observed metadata and actual live-connection evidence are not interchangeable.
3. Obtain the committed outcome from the existing native owner, bound to the
   original operation/transition/permit and permanent target identity. A
   PROPOSED reply or role-only ALREADY_LEARNER does not prove that exact entry
   committed, and cannot alone authorize CREATE or release the membership lane.
4. Test a lost proposal reply, exact replay after restart and wrong-action
   committed evidence. Then let the existing repository conditionally advance
   its existing learner stamp/phase; do not create another receipt ledger.
5. Only after those proofs, connect the existing CREATE admission and state-
   transfer path. Full two-replacement off-seed acceptance remains subsequent.

Do not keep iterating arbitrary metadata rereads to satisfy a local example.
Do not use the remaining duration failure as a reason to weaken durable state
or defer the actual operation indefinitely. Continue profiling the remaining
WAL/FULL work only at its demonstrated owner, while treating the timing bound
as an unresolved gate, not a new product feature.

## Integrity and limits

All work here ran on GitHub-hosted Ubuntu/Node22 with the existing one-worker
cap, NOT a GCP/multi-host acceptance run. Existing GCP/lab acceptance remains
required; no local lab process or GCP service was reconfigured.

37822317153 Actions ZIP SHA256:
`4bdd6ee66155128e9e4c6e7e6b5024b23c9f7c8695055a450c52be35f245a5cb`.
All 70 named manifest members independently rehashed and matched.
Canonical Solver ZIP SHA256:
`9d2b578c0b7c62624ac62907f5c26a8e607dcf4ac275ce7a50c9d21a72dfb2aa`.

37823435436 Actions ZIP SHA256:
`60804e94883a5d4c8fa00138475267a6dfd521864b2f9e77b73dfc97a61a4246`.
All 17 named manifest members independently rehashed and matched.
Canonical Solver ZIP SHA256:
`ba15cb427cbec54dc8fbc7adb5ecbc8adb23fc6a2dd198e851896568660f95ba`.
Canonical uploads were through the existing evidence owner; these archive
rehash claims refer to the separately downloaded Actions ZIPs, not an
unperformed second download of the distinct canonical ZIPs.

Both final measured checkouts were clean. Ordinary non-force Git pushes
checked expected-before and exact-after remote heads. Both whole Actions
retain RED for unresolved complete acceptance despite successful bounded
steps. Original full lab: FAIL, 941 selected / 918 process-level passes /
23 failures. No C0/FreshMG terminal receipt, independent approval, main merge,
final cutover or A1-v13 compatibility gate is advanced.
