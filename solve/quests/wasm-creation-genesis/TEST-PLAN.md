# Frozen proposal for the creation-to-genesis oracle

Base f6c3698be77043ddd19e3a2a923a6d0ac6d2a9a9. No tests authored or run yet.
Original unbound recreation file and its 2-pass/1-fail result stay unchanged.
New fixtures consume the real ServiceDefinitionsOwner selection API, not a
standalone expectedIncarnation injected into WasmWriterState.

| ID | Callable seam / schedule | Required discriminator |
| --- | --- | --- |
| C1 | Catalog immutable creation intent → ServiceDefinitionsOwner → actual lifecycle/RF3; select I, close I, select J; old INIT/ENROLL/WRITE first | Old INIT itself refuses, no J writer/KV change; valid J INIT/enroll/strong write completes |
| C2 | Same I retained database, exact lifecycle reopen and replay | Root and outcome retained; no repeated KV effect; component, not process-loss |
| C3 | Two independent metadata owners/gateways with same expected state; SQLite CAS then actual RF3 QueryEngine | Exactly one selected binding; losing request resolves its own conflict; cache/local locks cannot decide |
| C4 | Apply selection CAS then suppress response; retry exact installation | Original binding and result, no new allocation; separate current permission after later selection |
| C5 | Delay I CREATE before handler entry; discard local maps; select J | Original I binding refused, no substitution of cached J definition, no ACTIVE |
| C6 | Hold real create/start/publication await before versus after publication grant; select J | Before grant: refusal and exact cleanup. After grant: J remains HELD until I exact release; no false instantaneous revocation |
| C7 | Lifecycle recovery journal with I binding, resolver returns J definition | Typed origin mismatch; never adapter-create with J under I operation |
| C8 | Missing origin, old file root, retired subject | Typed refusal, persistent bytes unchanged, no re-birth by INSERT |
| C9 | Child process owns data-directory lock, persists B before INIT, exits; new process reopens | Same B survives; old INIT refused; valid INIT completes; do not count a same-process close as this proof |
| C10 | Retired I object callback held across cleanup; fresh old retry routes to J | Neither changes J; resource release matches exact I attempt; no map deletion of J |
| C11 | I database/root/native envelope submitted under J | Real opening/ingress rejection; shared snapshot install remains explicitly unsupported unless actual installer can execute |
| C12 | New local replica object on retained I; existing membership/identity owner | Preserve I/history; distinguish retained replacement from fresh-peer membership or snapshot catch-up |
| C13 | Existing catalog unsupported path and actual request-Cell driver control | ACTIVATION_UNSUPPORTED retained; request Cell execution stays separate and functional |

Additional transition coverage: decision ring eviction, stale winner and loser
history, changed operation intent, invalid expected version, size exhaustion,
lost admission/grant/release replies, finite resource capacity and overflow.
Authoritative state, exact request/result, resource phase, application rows,
native log positions, transport occurrence and response ordering are emitted
before assertions can terminate diagnostics. Exact integers read as such at SQL
statement boundary; never stringify already rounded numbers.

Measured cuts contain no observer-driven status/drain/settle/tick loop. Setup,
specified transport schedule and healing are separated. Hold existing await
seams by wrapping a real callee without changing argument/receiver/result/error
semantics. No fabricated successful cleanup, CLEAR census or committed result.

Minimal mutations keep final new-profile tests unchanged:
1. Bypass current binding in genesis/INIT classification, retain every codec and
   owner API: C1 must produce old-incarnation initialization/revival, not setup RED.
2. Omit serving-grant currentness guard while preserving resource formats: C6
   must demonstrate stale grant/publication, not unavailable-method RED.
3. Existing v1 completion-only mutation returns acceptance before application:
   native companion must fail STRONG_WRITE_SUCCESS_BEFORE_COMMIT.

The SQL-world component uses production CDC SQL generation and real SQLite but
is not distributed consensus. Native metadata must use the real gateway /
QueryEngine RF3 fixture, not the component SQL adapter. The service consumer
must use real lifecycle and RF3 operation ports. Independent jobs on locked
hosts are parallel single-host evidence, not a physical cross-host cluster.

Before first run: independent review of exact new test/fixture blobs; separate
test-only checkpoint. No new-symbol predecessor failures count as semantic RED.
One first result per exact experiment; retain failures. After source: whole
matrix, prepared writer-v1 state/client/completion controls, relevant existing
catalog/Cell/lifecycle/identity/storage tests and actual changed-path cone.
No full unrelated cone or old F1/W07 attribution rerun.
