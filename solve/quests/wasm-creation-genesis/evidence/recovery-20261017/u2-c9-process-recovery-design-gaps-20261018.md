# U2 C9: actual process recovery preparation and remaining design gaps

Status: **DRAFT, DESIGN ONLY. No C9 code or source tests in this branch.**
Prepared by `subagent:/root/u1_finality` on 2026-10-18 at
`f5717e6f53a3ae18c2f470a507a180c3eca2cc17`. Exact reviewed inputs are in
[u2-preparation-source-bindings-20261018.json](u2-preparation-source-bindings-20261018.json).
This preparation preserves the dependency on independent combined U1 approval
and the U2 progress/confirmation amendment. A future Harnessd request requires
the root's serialized submission and a separately reviewed test-only checkpoint.

## 1. What C9 must prove at this design version

The governing recovery witness is R2-H/P-R10 of
`RECOVERY-DESIGN-20261017.md` (733-735), together with R1-I/P-R10 and brief
G: one child process runs all three native service hosts, retains their
directories and a file-backed shared component metadata/creation journal,
and is actually SIGKILLed after a local PUBLISHED record is durable. The
parent reconstructs all three hosts over those exact directories, re-forms
the native group, and proves retained identity, old-INIT refusal and actual
confirmed publication. This is a process-crash witness with native service
consensus over component metadata, not three independent OS processes or
physical lab hosts, native metadata quorum-loss recovery, a power-loss proof,
or deployment certification.

The original `TEST-PLAN.md` C9 row describes a different, earlier cut: B
persisted before INIT, exit, then valid INIT completes in a new process.
R1-I/R2-H's later PUBLISHED cut necessarily follows the original INIT. One
post-PUBLISHED kill cannot also demonstrate that original before-INIT cut.
The reviewed C9 receipt must name the later cut and its supersession. If the
original pre-INIT claim remains required as an additional receipt, give it a
separate cut/oracle using the existing post-root/pre-INIT seam. Do not count
duplicate current INIT after PUBLISHED as first initialization after a
pre-INIT crash. This preparation does not silently remove either claim.

## 2. Existing components that can be reused, and their limits

| Existing source or witness | Available behavior | Gap for C9 |
| --- | --- | --- |
| `test/wasm-service/bound-creation-handler-embedding-fixture.js`, `embedding`, `composeHost` | Real handler, creation manager, runtime/driver, WASM lifecycle, native operation ports, real endpoint/services writers, directory locks, virtual clocks, loopback delivery and boot incarnation. | All hosts currently share one process and the fixture chooses a new temp directory. Metadata is currently seeded through `createOriginFixture`, rather than reconstructed from durable rows. |
| Same, `stopHost`, `restartHost` | Orderly lifecycle shutdown, lock release, new objects on the same directory, boot bump. | Calling these before the kill would checkpoint/close resources and invalidate abrupt-crash evidence. Reusing `restartHost` in one process is not a substitute for SIGKILL. |
| `test/control-plane/service-instance-creation-sqlite-fixture.js`, `createCreationSqliteFixture` | Accepts `databasePath`; uses real SQLite, production metadata/CDC mutation owners and a labelled authoritative-read adapter. | Every construction also runs the catalog INSTALL command. It does not currently expose a reconstruction-only mode. Component DB durability settings must be reported, not confused with the service database's WAL settings. |
| `test/service/service-consensus-creation-fixture.js`, `createOriginFixture` | Adds the production-schema creation journal and real manager readers/writers. | Every construction calls `selectConsensusInstance(f.request())` and derives a fresh fixture intent. Recovery must not reseed/reselect, even if an exact idempotent request happens to return the old selection. |
| `src/wasm-service/wasm-creation-opening.js` | Read-only by-path inspector, seven-field local identity, durable common root and local phase transition. `recordWasmCreationLocalPhase` uses `commitDurably`. | Parent observation must use exact original identity and committed bytes. IPC saying "published" is only a scheduling notification until the parent verifies the file through another connection. Offline open also requires the original journal opening claim and its U2 seam. |
| `src/raft/raft-rs-durable-store.js` | Native log/hard state/application progress/configuration read from retained SQLite; exact integer reads; owner-defined durability distinction. | Re-formation can legitimately append entries/change term. Preserve the original INIT receipt and old log prefix, not an incorrect assertion that the entire post-restart log/term must be unchanged. An idle post-PUBLISHED kill does not prove a mid-Ready recovery cut. |
| `test/service/service-consensus-creation-recovery.integration.test.js` | Existing parent/child `SIGKILL` convention at reservation/admission; checks `close` signal, distinct PID, original row and token. | Component creation journal only; no native service, data-directory lock, local PUBLISHED or endpoint recovery. Reuse the orchestration pattern, not its evidence ceiling. |
| `src/storage/data-directory-process-owner.js` and process-custody witnesses | Real SQLite exclusive transaction holds directory custody. Failed cleanup retains the handle; successful owned cleanup releases it. | C9 must show another process is fenced before death and can acquire only after the recorded killed process closes. No explicit lock deletion or manual pre-kill release. |
| `src/entrypoint-startup-acquisition-ledger.js`; P-R15 at `bound-creation-restart.integration.test.js` 574-608 | Ordinary cleanup must succeed before exclusive-owner release; existing U1 ledger path witnesses retain the lock after failed startup cleanup. | Reuse the independently accepted U1 witness and any separate startup-custody proof. This is not a reason to add a replacement lock/ledger mechanism to C9. |

## 3. Required fixture design before implementation review

### C9-D1. Separate first creation from reconstruction

The future fixture needs an explicit reconstruction path over caller-supplied
existing directory and component database paths. Reuse owner construction and
read/write adapters while avoiding catalog installation, instance selection,
new operation creation and new admission on that path. Reconstruct each host's
request from the existing journal's validated original intent, token and
opening claim. Treat the process's IPC manifest as locators and diagnostics;
compare it with authoritative retained bytes instead of treating IPC as
permission or creating identity from it.

The exact test seam can be a fixture extraction or mode, but must preserve the
existing component-boundary labels and production consumers. On recovery,
instrument INSTALL/selection/new-intent admission entry points as unexpected
calls while allowing legitimate resolve/confirm calls. An ordinal assertion
alone cannot catch an unnecessary idempotent re-selection.

Every new host composition must acquire its actual process owner before
inventory/open, restore artifact/module availability and supply the original
journal owners, then apply the corrected U1 inventory before accepting an
external CREATE/REMOVE. Use an endpoint boot incarnation distinct from that
host's pre-kill incarnation. All three directories must be reconstructed;
keeping two old process objects alive is excluded by the accepted cut.

### C9-D2. Choose a durable cut, not a sleep

The child reaches the declared state through the real owner path. It reports
a structured scheduling marker with PID/process nonce, exact paths and
operation locators only after the publication attempt has written the local
PUBLISHED record. Keep the child alive and its resources open. Do not invoke
fixture cleanup, handler shutdown, native stop, DB close or process-owner
release before death.

The parent uses its own read-only connection to verify the matching committed
local root/record, original journal/admission/opening and resource phase. It
captures the durable native INIT receipt and application rows through their
read-only owner/SQL seams. It then kills exactly the child process it started
with SIGKILL and awaits the actual `close` event, requiring
`{code: null, signal: 'SIGKILL'}`. Preserve stdout/stderr and the raw IPC
sequence, including a failure to reach the cut; a timeout is never a successful
cut. A new process identity on restart is recorded independently of the host
boot-incarnation assertions.

No observer-driven status/drain/tick/settle loop belongs inside the measured
cut. Formation/setup uses a declared delivery schedule before the cut; a
durable-cut IPC notification triggers the parent's single confirmation read.
Read-only DB observations may not advance native application or grant state.

### C9-D3. WAL and interrupted-Ready claims need separate discriminators

The native durability owner documents WAL/NORMAL for ordinary commits and
synced persistence where its Ready contract requires it. Local PUBLISHED
uses `commitDurably`. These are source contracts, not new proof produced by
this preparation.

For the ordinary process-crash receipt, record each relevant connection's
actual journal/synchronous mode, whether a transaction is active at the cut,
and the complete retained file set. Do not checkpoint or copy only the main
SQLite file before restart. If the receipt additionally claims recovery from
uncheckpointed WAL, demonstrate that the relevant committed root/local/INIT
facts actually reside beyond the main-file checkpoint at the cut using a
reviewed non-mutating observation. A nonempty WAL file alone does not show
that the asserted fact depends on it. Keeping a deliberately older read
snapshot or controlling fixture checkpoint policy would be a labelled test
condition requiring oracle review, not a production durability change.

The prior `u2-owner-plan.md` C9 section already says that its proposed shape
proves uncheckpointed WAL recovery. That is an unproven inference requiring
the additional discriminator above, or an explicit approved correction to the
claim. It must not silently become a certified consequence of any SIGKILL.

A cut reached after the group and publication are idle does not exercise
death during Ready persistence/application. If mid-Ready or mid-CAS survival
is claimed, select an additional real await/transaction-boundary schedule and
state whether the operation is already durably applied at that point. The
published-cut P-R10 is useful without those additional claims. Evidence labels
must distinguish them; no power-loss/OS-crash claim follows from SIGKILL.

### C9-D4. Preserve safety and real progress after reconstruction

Record the pre-kill authoritative comparison set before an assertion can
abort diagnostics: selected binding, all three original creation rows and
admission tokens, opening claims, local seven-field identities and phases,
resource ordinals, durable peer identities, original INIT bytes/receipt, writer
rows, KV state and endpoint/service rows with their boot incarnations.

After reconstructing every directory, compare immutable facts exactly.
Legitimate current term, last/applied index, new no-op entries, lifecycle
incarnation and endpoint boot incarnation can change during re-formation;
report those changes while requiring the original INIT identity/receipt and
retained log prefix to survive. A retained exact INIT retry is idempotent,
with no repeated user KV effect or changed genesis identity.

The old-INIT negative must use a prior real owner-selected incarnation,
obtained in the declared setup before selecting the current one; do not forge
a current binding by decrementing its incarnation. Submit that old command
through the actual current native application path, record its typed refusal,
and assert that the current root/writer/KV facts do not change. Then complete
an allowed current operation through the real writer completion owner so an
always-refuse mutation cannot pass. If the original before-INIT cut is tested
separately, this is where its first exact valid INIT must actually complete.

For the reachable-owner P-R10, require real publication confirmation,
operation continuation, endpoint writes carrying the new boot incarnations
and the actual ACTIVE services projection plus token-keyed PRESENT mark
provided by the existing embedding (`projectPublishedConsensus` and
`markPresent` in `src/runtime/service-runtime-consensus-publication.js`).
Never report ACTIVE solely because a method returned a promoted status; the
U2 late-projection seam must use the existing owner and its result.
Production startup/activation integration of that PRESENT path remains with
its activation owner; this component C9 does not certify that separate wiring.

For an optional offline restart extension, keep the journal readable while
faulting the component metadata gateway. Locally PUBLISHED can serve
UNCONFIRMED; locally ADMITTED founders remain HELD, preserving formation.
That is the approved component outage seam, not evidence that production
inventory works without its routed journal quorum. Restore the owner and
drive the approved notification opportunity or explicit trigger; only then
observe real confirmation/projection. Report that extension separately from
the base reachable-owner P-R10.

### C9-D5. Preserve custody and raw failed evidence

The parent owns exactly the child PID and every observation connection it
opens. It must join child death before acquiring/reusing a directory. A
pre-kill contender must receive the real directory-owned refusal. A restart
that fails cleanup keeps its acquired custody until the actual process dies,
consistent with the existing ledger rule; a cleanup timeout or cleared map
does not release it.

Failure cleanup closes only parent-owned observers and kills/joins still-live
owned children. It preserves the failing directory/database/WAL set and logs
as the declared artifact until evidence retention is complete. Successful
cleanup follows the existing fixture owner protocol after all assertions.
Do not turn a cleanup/formation/setup failure into an attributed recovery
regression or silently retry it as the same experiment.

## 4. Proposed receipts and mutations for later independent approval

| Receipt | Positive/negative discriminator | Meaningful mutation or failure classification |
| --- | --- | --- |
| Actual death | Parent's committed-file observation precedes SIGKILL; `close` confirms that signal; all three host objects are recreated. | Replacing kill with orderly stop must be rejected by the process/cut oracle. A child that exits early is a setup failure with raw logs. |
| Retained source of identity | Original journal intent/token/opening and physical identity survive; reconstruction performs no INSTALL/selection/new intent. | Recovery that seeds a new request fails the call/identity oracle even if its idempotent answer happens to match. |
| Native prefix/genesis | Original INIT bytes and receipt survive; re-formation retains the group and peer identities; a valid current operation completes. | Reinitializing/resetting application history or silently minting a new native root changes the retained prefix/receipt or fails current progress. |
| Old-instance exclusion | Prior real selected incarnation's INIT is refused in the current native group with no current root/writer/KV effect. | Bypassing the existing root/current-binding guard must admit or mutate the old command; a setup/code-symbol error is not the semantic RED. |
| Publication ordering | First retained confirmation has one OBSERVED wake; actual endpoint/services owners and the exact token's PRESENT mark complete at the new boot incarnation before CREATE_ACTIVE. | Treating UNCONFIRMED as confirmed, suppressing retained confirmation wake, or manufacturing a projected status must fail the owner-row/order oracle. |
| Custody | Competing process fenced before death; exact successor acquisition only after death; failed cleanup leaves custody held. | Premature lock release/ledger completion is caught by the real contender. Reuse accepted P-R15 evidence where its exact candidate binding applies. |
| Additional pre-INIT/WAL/mid-Ready claims | Separate named cut and discriminator for each claim if retained by the acceptance owner. | No attribution to these cuts from the post-PUBLISHED idle crash alone. |

These mutations are specifications only. C9 will need the same profile of
unchanged accepted oracles and a distinct source-only mutation tree for each
receipt; preserve every first lab result under the deployed controller's
serialization rules. Source tests, mutant execution and expanded native
regressions remain pending. The controller must know the actual test file(s),
Node22/runtime dependency profile, child lifetime bound and artifact retention
before it can admit the experiment.

## 5. Open decisions to resolve before the U2 test-only checkpoint

1. Explicitly accept the later R2-H post-PUBLISHED cut as the named P-R10/C9
   successor, and decide whether a separate original before-INIT cut is still
   required. Do not let a receipt silently conflate them.
2. Approve the reconstruction-only fixture seam and original-journal identity
   source; reconcile it with corrected U1 inventory and opening-claim APIs.
3. Specify whether the claimed crash receipt includes actual uncheckpointed
   WAL or mid-Ready interruption. If so, approve the additional cut/oracle;
   otherwise preserve their explicit evidence ceilings.
4. Approve concrete U2 open/confirmation/projection owner contracts and the
   notification-opportunity amendment before authoring their red witnesses.
   Choose K under N16 and report it; C9 itself has no K-write deadline.
5. Bind the future test-only tree, corrected U1 source and child fixture blobs
   before Harnessd submission, then bind the implementation and mutations
   independently. Existing component or orderly-restart evidence does not
   certify that future candidate.
