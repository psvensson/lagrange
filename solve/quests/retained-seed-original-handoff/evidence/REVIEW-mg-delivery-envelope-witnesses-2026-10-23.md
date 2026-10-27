# Independent review: immutable CDC envelope component witnesses

Reviewer: `subagent:/root/mg_delivery_design`, 2026-10-23.

**Verdict: APPROVE the exact component test against the approved capture
contract.** No blocking test-premise defect was found. This is test-source
approval only, not approval of root's moving implementation, a runtime result,
native application evidence or source ACK authority.

Reviewed file: `test/cdc/cdc-event-envelope.test.js`, 306 lines, SHA256
`482e1d0a5a07d0682a437faa9171e0203d7e4e242ab2150efec2fc09cc7728b0`.
The hash was checked before and after inspection. The governing MG contract
SHA256 remains
`474182126c3c985feceadb9a1b72d7de9975e1b4c3280af52be884c6c095f383`.
Its final F2 append withdraws the earlier total-payload/fanout ceilings and
governs the large-input positive in this test.

This review read the new test, the approved contract, existing durable identity,
source-scope and canonical JSON owners, and the named exports the test imports.
No source/test/metadata/Quest-log modification or runtime execution occurred.
This review record is the only repository write for this component review.

## Contract correspondence

| Required behavior | Concrete test evidence |
| --- | --- |
| One captured immutable value, independent of caller mutation | Detached vector/event/row/nested-array/source-scope references, recursive freeze, subsequent caller changes to row, source position, HLC, diagnostic cause and input order, and attempted mutations of the captured value |
| Preserve complete supported semantics | All four existing CDC operations, exact original HLC and row HLC, source identity, safe numeric positions including the supported maximum, optional source scope, causeId and replayOnly |
| Preserve absence instead of synthesizing authority | Omitted optional fields remain omitted; a cache-only event gains no event key, timestamp or source partition |
| Existing occurrence identity, no row coalescing | Same-row events with different durable keys/positions remain distinct; equal keys in different source partitions remain distinct |
| Refuse duplicate occurrence vectors rather than invent a partial success | Identical and conflicting duplicates, including changed position/stamp/diagnostic cause, throw the existing typed identity error |
| Whole-vector refusal for a malformed member | Valid prefix/suffix surround each malformed event; capture must throw without returning a filtered result, changing either neighbor, or freezing the caller's objects |
| Preserve the supported numeric source domain | Negative, fractional, string, unsafe, null and non-finite source positions are refused; source log index zero is refused while ordinal zero is accepted |
| Validate supplied logical source-scope evidence | Valid owner-built evidence survives; wrong authority, range/version, digest and scope identity are refused |
| Canonical JSON data without evaluating behavior | Nested undefined/non-finite/BigInt/symbol/function/custom-prototype/Date/Map/Set/typed-array cases, sparse/decorated vectors and nested arrays, accessors at vector/event/nested/scope depths, cycles, toJSON, hidden fields and symbol keys |
| Preserve legitimate canonical-data alternatives | Acyclic shared descendants are copied/frozen without requiring reference alias preservation; null-prototype row data and an own literal `__proto__` value remain data |
| Do not reintroduce rejected total-domain caps | A vector of 65 distinct occurrences with a value larger than 1 MiB is accepted and frozen |

The duplicate refusal is a conservative permitted no-sharing policy, not a new
identity schema. `partition/cdc-event-buffer.js:buildEventIdentity` owns the
durable key `[durable-tag, sourcePartition, eventKey]`; diagnostic cause does
not create another occurrence. The contract permits refusing duplicate sharing
instead of creating attached callers with renewed deadlines. The existing
outcome component test also rejects duplicate expected durable bindings.

The accessor tests count getter execution and require zero reads. They do not
merely assert that an eventual validation failure occurs after arbitrary getter
work. Likewise, the toJSON counter distinguishes data capture from behavioral
serialization. These are meaningful boundary tests against the established
canonical-data contract, not assertions of a particular recursive algorithm.

`utils/canonical-json-data.js` explicitly owns own-enumerable data properties,
canonical/null object prototypes, dense standard arrays and finite JSON numbers;
its source records the earlier systematic input-integrity/prototype lessons.
The new test consumes that existing domain rather than inventing another
serialization or identity owner. It does not establish complete hostile-Proxy
or global-intrinsic-pollution coverage; the utility's existing dedicated tests
remain separate.

The source-scope fixture is built through `buildCdcSourceScopeEvidence` and
validated by its existing semantic predicate. The file labels all these values
as component vectors. An authority tag here is test data for capture, not proof
that a physical replica was created, an original allocation was recovered, or
that the test owns startup publication rights. No receipt builder, native
position assignment, SQL writer or transport success is used as an execution
witness.

## Public seam and baseline compatibility

The local imports resolve to actual named exports in the current candidate
surface. In particular, root's draft exports `captureCdcEvents`; the other
imports are existing CDC constants, HLC and source-scope owners.

**This component test is not executable against the unchanged `21cfd917`
test-only native baseline.** That version of `cdc-event-envelope.js` exports
only `copyCdcEvent` and `copyCdcEventMetadata`. Copying this new test into that
baseline would produce a named-export module-link failure, not an intended
semantic red. Preserve/run it with a frozen implementation candidate that
actually supplies the reviewed public seam. The independently approved S2
two-file baseline has no such new-export dependency.

This review intentionally does not grade the moving implementation against the
test expectations or infer green from its apparent structure. Canonical capture
must still be independently source-reviewed and executed on the exact candidate.

## Limits and next proof

The 65-event/greater-than-1-MiB positive guards against the rejected new capture
ceilings. It does not prove arbitrary-size SQLite-to-wire liveness, a bounded
dispatch window, one active topology wave, admission-before-copy, actual memory
accounting, or cleanup after a deadline. Those belong to the existing source,
topology, proposal and transport owners. The known source-versus-wire-domain
limit remains explicit.

This file also does not establish digest-to-proposal reuse, afterCommit-only
native completion, forwarding depth, mixed provisional coverage, fair progress
across attempts/subscribers, late-result fencing, source CDC_DELIVERED, restart,
activation or full W7. It is a finite immutable-input boundary witness to compose
with those owner and native tests. Registration/metadata, exact candidate source
review, lab execution, Quest and publication gates remain with root.
