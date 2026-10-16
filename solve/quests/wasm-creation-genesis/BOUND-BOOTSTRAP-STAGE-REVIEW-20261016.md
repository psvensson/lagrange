# Retained intent to physical bootstrap: preimplementation review

Base: 609f35524a40d3f7ce8ee6c5a2fdfe89c0859203 (PR130).
The source and test subtrees recovered in this cloud workspace match the
published source/test identities. Its local reconstruction commits are not
publication ancestry. Publish only a checked patch on the real remote base.

Operator author-review instruction remains in force. This is not independent
verification and no Quest receipt is changed. This increment implements the
BOOTSTRAPPED_HELD boundary described by CONTRACT-R2 and HANDOFF-INTERFACES.

## Exact scope and order

The existing ServiceLifecycleManager consumes its persisted original intent
and admission token, calls its registered RuntimeServiceAdapter, and reaches
ServiceRuntimeLifecycle / WasmComponentDriver / WasmServiceLifecycle. Lower
layers consume that same operation, not another PREPARE or START journal.
An explicit bootstrapConsensusCreation call names this direct-consensus step;
ordinary unbound CREATE and generic catalog activation are not widened.

The existing runtime-service identity owner derives incarnation-qualified
physical peer/group names from B's canonical founding set. The storage owner
chooses the directory; caller path spellings are never used. Opening resolves
the exact metadata resource before filesystem/native effects and rechecks
lifecycle stop after the await. Its SQLite opening transaction writes a common
binding root and a separate local ADMITTED record before writer/KV state.
The writer reads the common root on validation and application. INIT cannot
choose another incarnation. Bootstrap routes use B's actual founding placement,
not fabricated ACTIVE cache rows.

All bound runtime results stay BOOTSTRAPPED_HELD. Native election, transport
and trusted matching writer administration can run, but user read/write,
async/timer proposals, endpoint/ACTIVE publication, START_SUCCESS and journal
completion remain closed. No new serving-grant API is introduced in this
increment: artifact binding, local PUBLISHED/RETIRED, metadata CLOSED and the
final closure wake still require their complete owner interaction. Physical
shutdown must close captured native resources; it must not claim metadata
closure, discharge an outstanding slot, or authorize a successor.

## Review decisions before implementation

ACCEPT for implementation/measurement of the held-bootstrap seam only. A
recorded admission is not a capability to publish. A driver claiming RUNNING
on this not-yet-serving bound route is refused, not passed to publication.
A malformed context cannot erase B/token into the generic route. One existing
native owner still opens, drives, and closes the group; no second timer,
metadata chooser, permission service or snapshot installer.

The source-only falsifier removes common-root incarnation checking, keeping
final tests unchanged. Observe an actual wrong-incarnation INIT decision,
not merely missing method/setup failure. Exercise a real native RF3 group
through the retained manager/adapter/driver path with real ModuleMirror,
PortAllocator and DataDirectoryManager, while explicitly retaining the
component metadata/journal adapters. Inspect native durable state and refused
publication sinks. No guest execution, replicated metadata, physical multi-host
Raft, intact-grant restart, full retirement or replacement is claimed.

The existing large creation fixture remains historical and unchanged. The new
fixture uses the already-implemented PR130 intent shape, not its earlier
idempotency-key proposal. Existing scoped debt/global static holds remain.


## Post-first-run review: REVISE before acceptance

The first new native five-case run passed locally (3153ms). It is not a lab
receipt. Review then found that an ADMITTED token alone cannot distinguish an
opening never attempted from an application database subsequently lost. The
new lost-file witness exercises a real first open and shutdown, removes only
its fixture-owned application file, then redelivers the original operation.
Fresh root inference on that reentry is forbidden. A permanent first-opening
record belongs to the existing original wasm_operations journal, not another
resource grant, ledger, lease or timer. Its one conditional NULL-to-record
mutation binds the exact origin/token and canonical physical identity. Only
the attempt that records its unique claim may initialize fresh storage; every
later attempt must find the identical intact application root/local record.
Unknown claim resolution opens nothing. Missing/unreadable/contradictory state
is never promoted to fresh. A crash after recording the claim but before the
first file creation deliberately remains held, pending authoritative recovery
rather than inventing proof that no prior effect occurred. This bounded
first-use protection does not claim liveness for that unresolved gap.

Additional witnesses cover common-root deletion after construction, direct
read/write admission and whole-runtime shutdown's physical custody. The
writer must reread its immutable common root before every decision and refuse
root disappearance, without reading local serving state. The bound driver
must never redirect into a request Cell, and runtime shutdown must attempt
all existing cleanup owners and preserve failures/custody rather than silently
clearing maps. Serving, semantic retirement and metadata CLOSED remain closed.
The first five witnesses and added review witnesses have separate recorded
identities; no earlier result is relabeled as covering these additions.


## Extended review and source freeze for physical-lab measurement

The ten-case review baseline exposed five failures after the original five
cases passed: missing application storage was initialized again, a deleted
common root lost bound identity, direct owners bypassed held admission, and
node shutdown orphaned native resources or suppressed cleanup rejection.
The raw first failure is retained. A subsequent 9-pass/1-fail run exposed an
apparatus expectation of a direct rather than nested AggregateError; the
assertion now inspects the real causal nesting and the injected fault is
restored in finally. The cleanup requirement itself was strengthened, not
weakened. The existing node-shutdown test now requires the failing driver's
error as well as proving the next healthy driver was still called.

Review extended the native witness to sixteen cases. Its first run was
15-pass/1-fail: HELD_GENESIS_QUEUED_LEADER_PUBLICATION. The replica's existing
role/leader queues and flushes now suppress public metadata while held, as
its timer/safety and direct read/write/proposal admission already do. Direct
legacy command types are explicitly refused before proposing, not only at
transport dispatch. The existing command admission owner is shared.

Current local native and neighbor run: nine files, 322 runner-reported
assertions, no failed files. These are local component/native results and
must not be passed off as a physical-lab receipt. Final tests now include
intact-file native history reopening, byte-for-byte copied-file refusal,
first-opening reply loss/unknown resolution, exact HELD result token checking,
and shutdown-before-first-prepare. Each node fixture actually owns its data
directory lock and releases it only after native shutdown. Setup uses the
existing virtual clock and queued loopback transport, not separate physical
machines. The matching INIT is submitted explicitly through the existing
trusted administration method; automatic production genesis orchestration
and actual guest execution/artifact verification are not proven.

The local file record binds the storage owner's real path, device and inode.
This refuses the exercised different-file copy; it is not a cryptographic
claim against malicious same-user filesystems, inode reuse or cloned machines.
No restored snapshot can import the local record as serving permission.
A permanent claim followed by a missing file is refused, even if that claim
was the final acknowledged operation before a crash. Forward recovery of
that unresolved first-use gap remains part of the larger held milestone.

Scoped lint, nineteen-source literal/grammar checks and generated shard checks
passed. New modules and fixture/tests meet strict complexity/cognitive limits.
Five existing complexity violations remain, with runtime prepare/start/stop
simplified rather than thresholds raised. Scoped cognitive violations: zero.
The four unbaselined lifecycle decision findings were already present on the
exact predecessor; the scoped decision gate still exits 1 and is not called
green. The older global analyzer/static/corpus debt remains open.
Canonical metadata regeneration completed without changing heap or test limits:
2400 tests, 66 interaction contracts, 37 coupled pairs. Earlier commands that
were interrupted before producer completion remain recorded as incomplete.

Author decision: ACCEPT the frozen held-bootstrap candidate for exact-source
lab measurement, not serving activation, terminal Quest landing or main merge.
Required unchanged-test negatives: remove the common-root incarnation check;
and make a retained first-opening claim fresh. Each mutation must be isolated
from the product branch. Report observed failures, not a desired pass/fail
count, and retain all first results. Local source reconstruction is not remote
ancestry: publication must apply verified patches on actual PR130 head
609f35524a40d3f7ce8ee6c5a2fdfe89c0859203 and verify exact postimages and trees.


## Normal pre-commit attempt, not a landing

The normal hook was invoked with all intended source/test inputs staged.
Source-size (27/27 oversized), test-size (21/21), hot-path diagnostics,
literals and scoped complexity passed their existing gates. The four
unbaselined lifecycle decision findings and writeAndObserve's silent catch
both already exist on the exact PR130 source; direct same-path comparison
retains them. The hook reported those failures, then attempted full inventory
refresh and was interrupted by the container command deadline before the
hook completed. There is no completed-hook exit code or full-static approval.
The separate canonical import-graph-only refresh already completed with
exit 0. No skip flag, heap limit, baseline or behavioral timeout was changed.
This is explicitly non-main WIP preservation under the existing runbook,
not a Solver landing or a claim that an incomplete hook passed.
