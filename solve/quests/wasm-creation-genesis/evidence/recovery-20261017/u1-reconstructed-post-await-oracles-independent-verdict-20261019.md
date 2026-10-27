# U1 reconstructed actual-return oracles: independent verdict

Date: 2026-10-19. Reviewer: `subagent:/root/lifecycle_design_research`.

## Verdict and immutable subject

**APPROVE** the five newly reconstructed actual-return witnesses and their
shared helpers in the 818-line draft
`/workspace/scratch/580a63fb23ca/u1-physical-lifetime-oracles-draft.js`, SHA256
`7f59f5869ee85849e2030e1cd28282f66e8bc893ea6f6965d40f1cf9c7532ce2`.
The intended repository path is
`test/wasm-service/bound-creation-physical-custody.integration.test.js`.
Approval applies to those exact bytes if installed unchanged at that path.

The reviewer did not author the source or tests, make source/test edits, or
execute tests or mutations. The source examined for this verdict is the
production set at `a55ab41296faf30a4c404c56117eacbaa993c903`, with individual
hashes below. The shared checkout also contains root's separately reviewed
handler gate and strict legacy-read test changes; they are outside this
physical-test delta.

The diff preserves all fourteen preceding test bodies, adds the production
`deriveEndpointId` import, and appends three explicit tests plus two instances
of the services/endpoint loop. Thus nineteen cases are declared in the
candidate source; this is not a runner-reported count or an execution result.
This review does not reopen or transfer approval for the preceding fourteen
test bodies merely because their bytes are retained.

These are new reconstructed bytes, not recovered original bytes. The missing
714-line checkpoint and its old approval are documented separately in
`u1-missing-post-await-oracles-lineage-20261019.md` (SHA256
`05c9fbcf11712567d4bc86476cb2b31d3875dedc84b86d04b309f86163d80724`).
No old source approval, assertion count, lab receipt or mutation outcome is
inherited by this reconstruction.

## Contract authority and valid invocation boundary

The governing v3 contract sections 6, 7, 7a and 8 distinguish handler
scheduling, exact physical custody, canonical projections and original
journal completion. Section 6 explicitly keeps the physical lifecycle
authoritative for direct manager callers. Sections 7/7a require immediate
physical-current observation before canonical writes or later physical
admission; a completed earlier READY/PUBLISHED answer is not future
permission. The v3 addendum supplies the ordered CURRENT/ABSENT/DIFFERENT/
UNAVAILABLE observation table. Its design approval is
`u1-inventory-v3-independent-design-verdict-20261018.md`.

The suspended original calls enter existing public owner APIs:
`manager.resumeConsensusCreation`, `driver.start`, or `runtime.start` with
the real retained intent/token and its derived exact descriptor. They do not
call `routeRuntimeServiceCreate` without its installed handler execution
entry. The original journal was retained and the original physical replica
was already legitimately PUBLISHED before those calls. Runtime and driver
capture the full supplied origin; the adapter forwards that origin rather
than reconstructing it from service-keyed bookkeeping.

Sources: `src/service/service-lifecycle-manager.js:630–632`;
`src/service/service-consensus-bootstrap.js:39–58,178–204,219–222`;
`src/service/adapters/runtime-service-adapter.js:84–104`;
`src/runtime/service-runtime-lifecycle-operation-methods.js:154–172,295–314`;
`src/runtime/service-runtime-consensus-bootstrap.js:14–33`.

This makes the lower-owner interleaving a valid component obligation even
though the handler's canonical gate normally serializes its own CREATE and
REMOVE calls. It does not claim that a single handler admitted both effects
through the same gate simultaneously.

## Actual effects, retirement, successor and progress prerequisites

`pauseOwnerReturn` at draft lines 480–504 awaits the original collaborator
using `Reflect.apply`, retains its unmodified answer, and withholds only that
answer's delivery. Only the first matching completed call pauses. Later
calls needed by retirement and successor creation remain ordinary owner
calls. An original call that settles before reaching the required seam makes
the witness fail; an owner exception cannot become a manufactured success.

Before any late-return claim, `replaceReturnedCreation` at lines 539–603:

1. Requires a real initialized, serving original I that the physical owner
   recognizes as CURRENT.
2. Sends an actual REMOVE envelope through the handler and waits for exactly
   one matching REMOVE_COMPLETED executor outcome. It independently checks
   original journal COMPLETED, local RETIRED, old native database released,
   no active old object, exact metadata ADMITTED/CLOSED token, and absent
   old physical services and endpoint rows.
3. Obtains a new binding from the actual metadata selection owner, retains
   successor J through the manager, and sends J's original CREATE through
   the handler under the same canonical replica ID.
4. Requires J's actual initialized native READY/HELD object, local ADMITTED
   record, HELD memo and STARTING manager record carrying J's exact token.
   The physical owner must answer CURRENT for J and DIFFERENT for I. The
   actual prepared descriptor and lifecycle entry must name J, while the
   driver's running set/context and J's discovery rows must be absent.

I and J are not created by test-side row insertion, token fabrication,
currentness stubbing, native-state assignment or memo replacement. Making J
HELD is deliberate: a stale PUBLISHED write cannot hide behind a successor
that is already running. The shared preservation check snapshots reference
identity and complete values for the real manager record and handler memo,
driver preparation/lifecycle entries, native object, local record, physical
rows and all creation journals.

After each forbidden-effect check, `redriveReturnedSuccessor` at lines
640–663 sends J's exact CREATE again. It requires the actual IN_PROGRESS
reply and one additional J CREATE_HELD outcome, the same native J, exact
currentness and token, unchanged journals, and an empty handler execution
map. Therefore an overbroad refusal that preserves state by blocking all
future work cannot satisfy the complete witness. It establishes one
successful existing-trigger continuation while J's unchanged owner
prerequisite still leaves it HELD; it does not claim eventual quorum or
serving activation.

Sources: `test/wasm-service/bound-creation-handler-embedding-fixture.js:20–27,
207–216,227–280,308–352`; `src/node/runtime-service-bound-creation-route.js:
177–190,245–285,300–328,380–390,478–490`;
`src/service/service-consensus-bootstrap.js:125–146`;
`src/service/service-consensus-creation-intent.js:393–415`.

## Five separate return-boundary dispositions

| Draft case | Owner obligation and decisive oracle | Verdict |
| --- | --- | --- |
| Lines 665–694: actual driver READY to manager | I's manager resume reaches the actual prepare return. After I is fully retired and J owns the canonical state, the old STARTING projection cannot replace or mutate J's exact manager record. The old start makes no physical start call. The existing permanent CONTENT_CONFLICT result remains under I. | APPROVE |
| Lines 696–725: actual physical PUBLISHED to driver | The actual lifecycle answer has started true and I's exact token. After replacement, the late return may neither add the running-set entry nor install I's context over HELD J. Both forbidden driver effects are asserted before the existing FAILED/UNAVAILABLE carrier. | APPROVE |
| Lines 727–768: actual authoritative PUBLISHED confirmation to manager | The metadata seam arms only after this actual runtime invocation has returned PUBLISHED. The original owner's ADMITTED/PUBLISHED answer for I is held; it cannot overwrite J's record after replacement. The existing per-request PUBLISHED presentation still identifies I and its token. | APPROVE |
| Lines 770–818, services branch: completed ACTIVE writer to runtime | The real services writer completes before the endpoint writer is called. After retirement removes I's rows and J is established, returning I's answer must cause zero new I endpoint-writer calls. The invocation assertion precedes the stale-result carrier. | APPROVE |
| Lines 770–818, endpoint branch: completed endpoint writer to runtime | The real endpoint owner returns success and its exact I endpoint row exists; one I endpoint call has completed, and zero physical PRESENT calls have begun. After replacement, the old return may not call I's physical PRESENT mark. The invocation assertion precedes the carrier. | APPROVE |

The first and third cases bind the two manager projection sites through
`projectCreationReplicaState`, whose exact currentness guard is at
`src/service/service-lifecycle-state-record.js:15–27`. The await sites are
`src/service/service-consensus-bootstrap.js:164–169,185–188`. The first
case also observes zero late physical start calls, but its stale descriptor
already differs from J's descriptor. It is not an independent discriminator
for deleting only the driver's currentness half of the pre-start check;
the preceding dedicated pre-start witness retains that separate purpose.

The driver return guard and writes are at
`src/runtime/wasm-component-driver-consensus.js:74–86`, following the actual
physical start await at `:113–116`. Runtime services and endpoint return
guards are separately at
`src/runtime/service-runtime-consensus-publication.js:108–117`.

The services writer legitimately returns void. That is not a scripted
permission: the fixture installs the actual
`projectRuntimeReplicaServicesRow`, which awaits its real update/insert
owner path and throws on failed projection rather than returning retained
success. Its owned idempotent success remains a completed real call. The
runtime then creates the actual `{stateRow, projectionResult}` carrier.
Consequently deleting only the post-services currentness check would reach
the next endpoint invocation rather than escaping through a scripted
SERVICES_ROW_RETAINED result. Sources:
`src/query/runtime-replica-state-projection.js:52–84,156–202,221–249`;
`src/runtime/service-runtime-lifecycle.js:473–501`;
`src/runtime/service-runtime-consensus-publication.js:28–41`.

The call observers preserve each original value/promise and receiver. In
particular, the `markServicesRowPresent` observer is synchronous; it does not
turn the physical owner's PRESENT result into a promise and induce an
unrelated refusal. Exact endpoint IDs are derived through the production
`deriveEndpointId` owner.

## Frozen-test mutation discrimination still requires execution

The following are source-reasoned discriminators, not observed mutant
failures. Tests must remain byte-identical for each source-only control.

| Isolated source regression | Required meaningful failure |
| --- | --- |
| Allow stale manager STARTING projection after prepare | `LATE_ORIGINAL_RETURN_REPLACED_SUCCESSOR_MANAGER_RECORD` or the paired record-mutation assertion in the READY-return case |
| Allow stale manager RUNNING projection after authoritative confirmation | The same exact record-preservation assertion in the confirmation-return case |
| Remove the driver's post-PUBLISHED currentness guard | `LATE_PUBLISHED_DRIVER_RETURN_MARKED_HELD_SUCCESSOR_RUNNING` or the paired old-context assertion, before result-carrier assertions |
| Remove only the runtime post-services currentness check | `LATE_SERVICES_RETURN_INVOKED_RETIRED_CREATIONS_ENDPOINT_WRITER`, even if the endpoint owner subsequently refuses |
| Remove only the runtime post-endpoint currentness check | `LATE_ENDPOINT_RETURN_INVOKED_RETIRED_CREATIONS_PHYSICAL_MARK`, even if the physical mark subsequently refuses |

The corrected full candidate must first reach and pass every unchanged
witness. A setup failure, missed return seam, failed I retirement, missing J
admission or bounded-settle failure cannot be promoted to an intended
forbidden-effect mutation result. The two manager projection sites and the
two runtime awaits remain distinct obligations even where a shared source
helper enforces them. One control's first failure is not proof that every
guard site was independently distinguished.

## Cleanup and precise evidence ceiling

Every new test places its await/assertion/replacement work inside a
`try/finally`, releases the held answer in `finally`, restores all installed
collaborators and joins the original pending call with
`Promise.allSettled`. The runtime cases restore the nested endpoint wrapper
in the correct order. The actual fixture cleanup then shuts down the handler
and physical lifecycle before releasing process-directory custody. No added
wall-clock timer, unbounded retry mechanism or production scheduler is
introduced by these witnesses.

The replacement helper calls `handler.handleMessage` directly through the
fixture and observes the real `ExecutorOutcomeEmitter`. It does **not**
instantiate the operation coordinator or execute its reply reconciliation,
timeout recovery, authoritative source-absence observation or durable
workflow transition. REMOVE_COMPLETED here proves the handler's actual
physical/journal settlement prerequisites, not coordinator convergence.

These witnesses hold delivery after the original services/endpoint owner
effect has completed and then remove that effect through actual retirement.
They prove exclusion of a later step following a stale return. Cancellation
or fencing of a write still pending inside another asynchronous owner
remains the distinct activation A5 obligation. The retained I PUBLISHED
presentation in the manager-confirmation case does not authorize writing
canonical J state or emitting a fresh handler outcome.

The fixture supplies real native raft-rs replicas, component SQLite
metadata/journal/services/endpoints, real files and process-directory custody
in one process with queued loopback transport. It does not prove native
metadata consensus, production cross-host delivery, abrupt-process failure,
full activation wiring, or all physical STOP lifetime intervals. This oracle
approval does not accept production U1, discharge exact-candidate execution
or negative controls, or open U2.

## Complete-file byte bindings

Hashes identify reviewed bytes without expanding this verdict beyond the
five named new cases and their supporting owner interactions.

| File | SHA256 |
| --- | --- |
| New 818-line draft / intended physical test | `7f59f5869ee85849e2030e1cd28282f66e8bc893ea6f6965d40f1cf9c7532ce2` |
| Prior 461-line physical test | `fa02bf81ef0e12dcef88a4be502bc3cec59e4fa6541cb59291136f0b1e618cad` |
| `test/wasm-service/bound-creation-handler-embedding-fixture.js` | `fae23bc1c01d42b70d1020bdfd4670cbef256d2d58812221529aaeec774d5515` |
| `test/service/service-consensus-creation-fixture.js` | `c2664a538eea8f83ae101960ea5d80792e931ef076878f403e1599df8637cd5a` |
| `src/service/service-lifecycle-state-record.js` | `25a1d5ea97780205dac204801d097c882365eedd47b99d3f99489653be1fb9f2` |
| `src/service/service-consensus-bootstrap.js` | `1b60a815cb70106d797a9b4e6e5b9767ce59ecbfbe5fc316e8504c98fd2008cd` |
| `src/service/service-consensus-creation-intent.js` | `19f996fc5c079db1a01096ad4d657a1ee8c4d53db1c63bcd6ffb75e18db4ed3d` |
| `src/service/adapters/runtime-service-adapter.js` | `a87ab433bd045a4d062f4180cb34422adcce4a456aeb82d671e27d4c63af3821` |
| `src/runtime/wasm-component-driver-consensus.js` | `b3065d582982d581af810134bf3d74168818b253b83c3c113b84d392b461a0c3` |
| `src/runtime/service-runtime-consensus-publication.js` | `82533d9c688f9c306f243f57f1c9ee3c1e14d4f7457c8c2abab13a0c07e496fd` |
| `src/runtime/service-runtime-consensus-bootstrap.js` | `adf37fa6eb4dba9680d5fd79c9da4e0838033011c77a35fa42e6ac69e0cd9dae` |
| `src/runtime/service-runtime-lifecycle.js` | `e51d56440f97eeb4a183df7b76165dc22abbb175023f47a9ad93f78977a7b706` |
| `src/runtime/service-runtime-lifecycle-operation-methods.js` | `62395c8a3f99b6d75912b823bf1c7e0a01ff2a2a4804fdeb3456864a3b349027` |
| `src/query/runtime-replica-state-projection.js` | `2d31fe85b2965263e81a10b47bd703c8affdef5ce648336ba6d479df8cc91078` |
| `src/runtime/runtime-endpoint-writer.js` | `42e62d1f8d7fe49e8bd4b4aa51ff52b3ff92bb4afe6f149efb23dc1a211aba9b` |
| `src/runtime/runtime-endpoint-publication-wiring.js` | `860c3bd9a6415f4f2c532cff3498ae1e8f985ba798f3feb88aa5c887e39ef9ea` |
| `src/wasm-service/wasm-service-lifecycle.js` | `1b416375caa9ceb5dc9eb876cdf766e11bb286fc8da1237260700ebef3a0b417` |
| `src/wasm-service/wasm-creation-retirement.js` | `dc1f2b1671cb5042fcb24579a69cce6e4fec84117ecc9e0254bfd3f9930c290d` |
| `src/node/runtime-service-bound-creation-route.js` | `133b5f1e4068aa1b1352f1c6305dc547bced68ef0d3eaa151e11d50634d5b98f` |
| `src/node/runtime-service-creation-execution.js` | `f7a68bd547d33128e410915ec4bda6c4cb944fa89df444a0a246fdd8fc96988e` |
| v3 contract | `6f010cc376fd3ff6bd0d7d07892636967eb3ad343915364f4c80a35c5450c048` |
| v3 addendum | `401f90a5f09a3056573ee1d8ab8b57cee6135c721355295e0e1506ceb93303ae` |
| v3 D2 current-state clarification | `64f1b2173b71717fefe031ae8ddb976d190ea577e8d5ea9401ff432632645534` |
| v3 independent design verdict | `614c2363d9975484f3b8558ab93ce5c3aadb8cbf73fd6314d0fc5a27d11d8131` |

The applicable owner-interaction, admission-gating, concurrency-serialization,
recovery-replay, transport-delivery and harness-fidelity obligations are
addressed above. The positive J redrive is the bounded progress discriminator;
the setup's real formation does not enlarge the test into metadata-consensus
or formation-policy acceptance. Existing remaining U1 gates are preserved.
