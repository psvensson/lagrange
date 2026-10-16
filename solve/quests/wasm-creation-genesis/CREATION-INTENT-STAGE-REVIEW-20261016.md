# Original creation intent: pre-implementation review

Bounded next stage of CONTRACT-R2 and HANDOFF-INTERFACES. Author review under
operator instruction: accept the design for measurement, not physical activation.
Base is PR129 cd86d12d077ac75be3bd04ebc2c55fc27882f94d. Reconstructed src/test
subtrees equal 82ca50fecafcffb0d8410657d6c02782cbc0de38 and
7e597a331d2e69a6990f1f0143cad7af825d0ef2 before this work.

ServiceLifecycleManager owns original CREATE intent in its existing wasm_operations
row, keyed by the original slot request's operationId. Two nullable columns retain
canonical intent_json and admission_json. No new table, chooser, lease or timer.

The preparation input is the exact bounded JSON shape {format:1, descriptor,
consensusBinding, consensusSlotRequest}. descriptor is the canonical runtime
service descriptor with replicaId and immutable runtimeConfig.definition. The
binding's definition digest must match that definition, and its tenant/service
subject and slot's replica must match the descriptor. Capture precedes await.
The existing instance owner remains the sole resource-token codec and reservation
CAS authority; the lifecycle journal never invents an ordinal or permission.

Order: authoritative journal read; INSERT original intent if absent; confirm exact
retained row; reserve the original binding/slot request; conditional token write;
confirm exact retained admission; resolve the original resource. Unknown writes
are reread, not treated as zero effects or repeated with new identities. Re-entry
and recovery read the retained request, not a current-definition resolver. Closed
resources and terminal operation rows cannot authorize new effects.

The new preparation method returns ADMISSION_RETAINED, never STARTED, RUNNING,
BOOTSTRAPPED_HELD or COMPLETED. It starts no driver. Existing recovery scan routes
these rows back to the same preparation owner and leaves them held/in-progress.
Downstream common genesis, physical identities, local grant/retirement and composed
CREATE/START publication are later portions of this same open Quest, not accepted
by this preparation result. Generic catalog activation stays unsupported.

Tests use real SQLite, real instance selection/reservation through the existing
metadata/gateway/CDC fixture, and disclosed journal callback adapters. They cover
write ordering, lost answers, reconstruction, mutable inputs, concurrent delivery,
closed/terminal refusal, malformed state and cache projection. They are not native
quorum or actual process-loss evidence. Preserve the first missing-method baseline.
An unchanged-test source mutation must falsify intent-before-reservation ordering.
Full static/corpus, independent verification and all original Quest receipts stay
open. No main/shared checkout, controller policy, W07/F1 or other lane is changed.

## Pre-publication review addendum

The first draft fixture used object runtimeConfig rather than the canonical JSON
string, then positional binding for the existing named $1 journal parameters.
Both apparatus failures are retained separately. Neither is a source falsifier.
Corrected fixture wiring consumes the existing descriptor and SQL forms; no
production fallback or assertion weakening was introduced. The final frozen
witnesses therefore differ from those in the earliest missing-method run.

Review REVISE: a journal whose intent/admission columns were both corrupted to
NULL could otherwise fall into the old current-definition recovery dispatcher.
The bound command now uses an explicit consensus-create: prefix owned by the
original-intent helper. Recovery recognizes that prefix independently of column
contents and refuses corrupt intent without consulting the current resolver.
This is a new held operation kind, not a change to generic CREATE semantics.

Review REVISE: failed resource resolution after retained intent/admission cannot
become pre-admission UNAVAILABLE. That case is UNKNOWN with its reason retained.
Review also required generic createReplica to refuse explicitly bound descriptor
fields before normalizing them; normalizing them away must not launch an unbound
resource. Full bound physical CREATE remains deliberately unavailable.

The additional two integration witnesses SIGKILL an actual child after reservation
but before reply, and after token persistence but before reply. A fresh process
reopens the same file-backed SQLite WAL database with synchronous FULL, uses
original operation identity, and observes the same token and ordinal with one
operation row. Fixture catalog installation/selection reentry is explicit and
retains the same binding. These are component process-loss tests, not Raft
quorum, power-loss, independently replicated partitions, real physical resource
creation/retirement or application serving.

No source/test freeze or lab acceptance is inferred from local authoring checks.
The pre-lab candidate includes 24 intent cases and two actual-process cases.
Review accepts that bounded design for lab measurement. Final author acceptance
requires exact candidate evidence, original-intent ordering falsification, and
neighboring lifecycle/schema/metadata tests. Final physical identity, artifact
binding, common genesis, local grant, joined lifetime and replicated-recovery
obligations remain open. Existing global static debt is not waived.
