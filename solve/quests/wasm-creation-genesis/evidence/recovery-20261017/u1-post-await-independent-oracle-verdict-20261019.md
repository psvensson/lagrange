# U1 actual-return lifetime oracles: independent review

Reviewer: `agent:/root`. Test author:
`subagent:/root/f1_independent_review`. Date: 2026-10-19.

**APPROVE these five additional native component oracles for immutable
preservation, focused Harnessd execution and subsequent source-only control
experiments. This is an oracle review, not an executed result or acceptance
of U1.**

The complete reviewed file is
`test/wasm-service/bound-creation-physical-custody.integration.test.js`,
714 lines, SHA256
`f0c173a391906e94c0d31d480b4515bb7546176066ce69a2f4442d3529f11bb7`.
It contains the prior fourteen cases plus five actual-return races. The
existing fourteen bodies are unchanged except that the pre-start case now
asserts `OLD_CONTEXT_STARTED_A_SUCCESSOR_THROUGH_SERVICE_ID` before checking
the returned carrier. A control which actually starts J under an old I
context must first fail that forbidden-effect assertion. Imports and the
new shared helpers do not change the original scenarios.

The source subject is still the independently reviewed U1 production tree
`10a9c9d676d5b71e1b5d522f84882c596440e26a`. Root read the complete delta and
traced it against the actual driver, manager, runtime and physical-owner
continuation paths. No behavioral or native test ran locally. The author
reports Node 22 syntax, ESLint and read-only scoped fast-static PASS in
20,552 ms. Final combined metadata and source/test tree identity remain an
integration gate.

## Actual owner effects and the replacement prerequisite

Every new test begins from the real C6 fixture with all three original
founders natively PUBLISHED. `pauseOwnerReturn` calls and awaits the original
collaborator first, then withholds delivery of that exact unmodified answer.
It neither invents a result nor pauses before the effect under examination.
The first matching completed call is held once; subsequent calls needed by
retirement and successor creation proceed normally.

While that caller remains suspended, the shared replacement helper invokes
actual coordinator REMOVE for I. It waits for the original coordinator's
REMOVE_COMPLETED result and checks original journal COMPLETED, local
RETIRED, actual resource CLOSED, old native database released and old
physical services/endpoint rows removed. It then asks the real metadata
owner to select a new instance, durably retains J, and sends actual CREATE
J through the handler. J must own an initialized native READY/HELD replica,
a HELD handler memo and a STARTING manager record. Physical observations
must be CURRENT for J and DIFFERENT for I.

J intentionally remains HELD: `_running` and `_replicaContexts` must be
absent, so an old PUBLISHED answer's incorrect writes cannot be hidden by
an already running successor. The helper snapshots the actual J prepared
object, lifecycle entry, manager record, exact replica, memo, physical rows
and all original journal rows. There are no authored target rows, scripted
physical-currentness answers, fabricated grants or test-side native READY
assignments.

## Five distinct awaited boundaries

| Awaited completed owner answer | Trigger and decisive effect oracle |
| --- | --- |
| Driver prepare returned to the manager | A direct original manager resume reaches the actual driver READY answer and pauses its delivery. After real J replacement, the old STARTING projection may not replace J's manager record, driver maps or memo. The following old start must still respect physical currentness. |
| Physical PUBLISHED returned to the driver | The real lifecycle start returns PUBLISHED with started true and the exact old token. After replacement, the old answer must not add `_running` or install I's context over native HELD J; the driver then reports its existing failure carrier. Forbidden map assertions precede the carrier assertion. |
| Authoritative PUBLISHED confirmation returned to the manager | The seam arms only after the actual runtime returns PUBLISHED, rather than a guessed metadata-call count. The exact owner's ADMITTED/PUBLISHED confirmation for I is held across J replacement. The late answer cannot change J's canonical manager record or other captured state. |
| Completed ACTIVE services writer returned to the runtime | The actual old write has returned, while the next endpoint owner has not been invoked. After retirement and J replacement, releasing the answer must not invoke the old endpoint writer at all. The observed invocation counter is checked before returned status. |
| Completed endpoint writer returned to the runtime | Exactly one actual old endpoint call has completed, and the physical PRESENT mark has not been invoked. After replacement, releasing that answer must not reach the old physical mark or recreate retired I rows. The mark invocation counter is checked before returned status. |

Each case then checks the same direct state population: no running/context
entry under I, identical J prepared and lifecycle object references,
unchanged J manager record, exact native object and handler memo, CURRENT J,
unchanged J rows, absent retired I rows, and unchanged original journals.
This checks preservation of the actual successor alongside the local
forbidden next-step assertion.

## Cleanup, scope and control requirements

Every gate is resolved in `finally`, its collaborator restored and the
already admitted pending call joined with `Promise.allSettled`. The runtime
cases restore both their endpoint and mark counting wrappers. Fixture
cleanup remains the real resource owner. A failed prerequisite, unrelated
setup exception or timeout is not a meaningful mutation result.

The services and endpoint cases wait for the original effect to finish
before withholding its answer, then remove that effect through real
retirement. Their claim is that U1 cannot admit a *later* step or overwrite
canonical state after a fresh physical observation. Cancellation or
supersession of a write still pending in another asynchronous owner is
activation A5 and is not proved by these tests. The manager confirmation
case likewise preserves the existing per-request result mapping; its
contract is canonical projection ownership.

This fixture contains real native replicas, SQLite owners and physical
process-directory custody within one component test process. It does not
prove separate-machine metadata consensus, abrupt-process crash recovery,
real cross-node network delivery or production activation wiring.

Root requires the complete corrected candidate to pass these unchanged
test bytes in Harnessd. Each source-only control must retain the entire
final test tree and fail the specific intended state or next-owner effect
assertion. Pre-start, post-return driver, manager prepare, manager
confirmation and the two runtime awaits are distinct guard sites; one
control result cannot be reported as proof of all of them. Their mutation
matrix remains a plan until full original logs establish the actual first
failures. U1 remains unaccepted while the current 11-file candidate's first
failures and these additional experiments are unresolved.
