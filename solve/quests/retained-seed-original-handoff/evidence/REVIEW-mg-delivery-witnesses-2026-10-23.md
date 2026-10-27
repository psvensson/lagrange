---
audience: development
documentClass: evidence
---

# Independent MG red-witness review, 2026-10-23

Reviewer: `subagent:/root/mg_delivery_design`.
Test author: `subagent:/root/retained_effects_tests`.
Base/source HEAD: `c11c4ca266e78c815c9cd41954e351d20b182a41`.
Worktree: `/mnt/data/peter/projects/.worktrees/mg-source-occurrence-delivery-20261023`.

## Verdict and exact scope

**APPROVE the frozen three-file delta for a bounded red-witness lab attempt.**
No blocking static defect was found. This is source review of proposed tests,
not an observed red result, production implementation approval, a passing
native witness, or completion of the MG delivery package. No test or production
module was executed during review. Root retains metadata, preservation and lab
ownership. Only this review note was written.

| Reviewed file | SHA256 |
| --- | --- |
| `test/message-group/message-group-native-custody-handoff.test.js` | `cc50118621a0d150bf9726e7e01b72ef493f74042b48f92c32f0666c027286a4` |
| `test/message-group/message-group-native-custody-fixture.js` | `2806d3980b7b4b0392c79e2924984fb23e26147c5c27a3ed2e5d7a9409ff3012` |
| `test/cdc/cdc-delivery-outcome.test.js` | `87375a2e9993b5ad0cbe7d2477b35d525e2eef725ca04a74e76c455fe2a0947f` |

Design authority is `CONTRACT-mg-source-occurrence-delivery-2026-10-23.md`,
SHA256 `474182126c3c985feceadb9a1b72d7de9975e1b4c3280af52be884c6c095f383`.
The allocation plan reviewed separately is `PLAN-mg-delivery-witnesses-2026-10-23.md`,
SHA256 `6c9b8759f5c72e59e833bbb7afff51fbe5f484c232ab5c9221f8e00728a2ee82`.
This delta implements only the first S1/RF1 acceptance and existing RF3
custody/loss witnesses, plus pure canonical-outcome vectors. The plan's complete
W1-W9 population is not the claim being approved here.

## Import and fixture integrity

The three hashes matched before review. A read-only source-text census resolved
all 66 relative named imports against the actual export/re-export declarations,
including the newly imported outcome, command, transport and scope owners. It
found no missing named export. This did not load test or production modules and
is not an executed module-linking result. `git diff --check` for the three paths
also passed. No source change or modified acceptance predicate is hidden in the
delta.

The recipient fixture changes only its supported replica population from RF3
alone to RF1 or RF3 (`message-group-native-custody-fixture.js:61-65,93-132`).
Group/replica identity, membership, role and frontiers still come from real
MessageGroupService/native ports. The unchanged pump intercepts only native
transport envelopes and delivers them through the registered actual handler
(`:37-58,83-92`); it does not fabricate an application result or committed CDC
receipt. Its `{delivered:true}` return is scheduling custody for native network
messages, not source-delivery acceptance.

## S1: actual ordinary source admission

The producer uses the existing admitted-group and release-owner fixtures. The
release fixture hosts real ReplicaHandlers and the native sql_transactions
control service; `releaseOperator` is the actual operator path
(`test/partition/partition-release-fixture.js:32-55,109-138`). The production
`releaseControlOwnerFirst` checks that control owner's current release and
census rather than accepting an arbitrary OPEN flag
(`src/node/replica-handler-participant-cutover.js:138-184`).

The changed handoff fixture records CUT_OVER, the actual leader and three native
voters before writing (`handoff.test.js:76-84`). `writeSource` calls ordinary
sessionless `executeQuery` while the source subscriber set is empty, then
requires all source replicas to retain the same owed event, APPLIED outcome,
row, actual native QUERY command/term/index, HLC and applied/commit frontiers
(`:98-145`). The normal producer builds QUERY/HLC/proposedBy in
`partition-service-write-metrics-base.js:60-78,416-430`; committed application
records its outcome and CDC debt together in
`partition-service-entry-apply-base.js:622-658` and
`partition-cdc-obligation.js:123-168`. The asserted data HLC is produced by
`partition-cdc-generator.js:51-60,184-235`.

This removes the historical hybrid `applyWrite({type:INSERT,sql,params})`
premise. It supplies neither original-seed opening authority nor an admission
override. If current release, ordinary SQL, or source-debt setup fails, that
must be reported as a setup failure; it cannot count as the MG semantic red.
The historical `5a3cdc7` traversal remains historical evidence only.

## Native acceptance and custody discrimination

The RF1 test captures the real bridge return and recipient native record at
that return (`handoff.test.js:237-242,249-266`). It first checks the ledger-derived
source envelope, then requires canonical committed acceptance for the actual
group, an exact source occurrence in the decoded recipient native entry, and
commit/applied frontiers covering that receipt (`:147-179`). The predicate under
test is therefore paired with independent native bytes/frontiers; a fabricated
or overly permissive validator alone cannot supply the required native record.
There are explicitly zero additional target groups (`:165-166`), so this is a
source-MG acceptance witness, not fanout coverage.

The intended current-source red is concrete: the ordinary RF1 CDC path treats
a single-replica group as local application without native replication
(`src/message-group/message-group-service-cdc-replication-runtime-methods.js:182-190`),
and the seed bridge/topology do not preserve/return the required source receipt.
The assertion `RF1_ACCEPTANCE_REQUIRES_NATIVE_AFTER_COMMIT` at `:168-169` demands
the missing semantic result after actual ingress. Lab must still establish that
this assertion is reached; source inspection is not a measured negative.

The RF1 continuation then requires actual source CDC_DELIVERED application on
every source replica and matches the delivered position to retained native ACK
bytes (`:185-201`). It does not treat recipient completion as source ACK.

The RF3 schedule retains the existing native APPEND hold, real remaining-quorum
election, rejoin, suffix replacement and canonical source redrive
(`:269-361`). Moving the hold before subscription closes the first-delivery
race after debt was created without subscribers (`:271-280`). The initial cut
requires an actual retained uncommitted recipient occurrence and no follower
application (`:292-302`). The post-loss checks require completed source redrive,
no still-in-flight delivery, unchanged source identity, debt retained at the
original cut, and newly committed/applied recipient occurrences (`:324-361`).
No cache/log row is deleted to simulate loss and no role/status is fabricated.
`SOURCE_CUSTODY_RELEASED_BEFORE_RECIPIENT_COMMIT` names the forbidden source cut.

The RF3 fixture changes leadership and native suffix custody in process. It is
not a process-crash, durable restart, physical-network or multi-host witness.
Fixed native ticks/pump rounds are explicit actuation, not semantic acceptance;
an unengaged setup or outer timeout remains non-proof.

## Canonical-outcome vectors and proof boundaries

`cdc-delivery-outcome.test.js:1-3` explicitly identifies builder-produced
receipts as validator inputs. Local versus transport-aware positives are paired
at `:61-72`; exact distinct source vectors, duplicate/missing/wrong-group and
invalid native positions at `:75-104`; F4 contradictions and zero-target
laundering at `:107-138`; allowed typed wrapper metadata and malformed metadata
at `:141-169`; mixed provisional/committed and ordinary/ACK-only answers at
`:172-189`; semantic event identity and unsupported source positions at
`:193-215`. These directly exercise the existing canonical owners and preserve
the approved local-call rule that an absent transport ACK is valid.

The current `isCommittedCdcOutcome` validates receipt bindings/positions but
ignores the added contradictory wrapper fields; `completeCdcPropagation` can
consequently discard those contradictions. Those are intended semantic reds,
not missing-interface tests (`src/cdc/cdc-delivery-outcome.js:90-135`). The
position tests target the currently incomplete envelope check
(`src/cdc/cdc-event-envelope.js:11-27`). All imported interfaces already exist.

The provisional builder positive has no expected recipient-group argument. It
is not evidence for F2-P topology coverage: actual source/target group binding,
subscriber lifetime, multi-invocation aggregation and scan release still need
their separate composition witness. Similarly the two same-row events in the
pure validator fixture are not the native two-source-write witness required by
W1. No arbitrary-JavaScript/intrinsics-hardening claim follows from these plain
record vectors.

## Category-complete review disposition

| Category | Disposition and evidence |
| --- | --- |
| Admission/gating | Appropriate real owner path, no OPEN/census override; S1 evidence above. Current lab setup remains mandatory. |
| Harness fidelity | Exact native engagement and decoded records are required; imports resolve; no invented native receipts. RF1/RF3 setup and timeout failures must remain separately classified. |
| Transport/delivery | Pure local and transport semantic predicates are distinguished. The native scheduling fixture is not a wire proof; pending-response/lost-response/physical-pressure cases remain later scope. |
| Recovery/replay | Real in-process suffix loss and identical source redrive are exercised. No crash or cold-reopen claim is made. |
| Concurrency/retry | Existing source lane is nudged rather than replaced; the witness rejects a merely joined/still-in-flight redrive. It does not prove fair multi-budget progress or cleanup-over-tenure behavior. |
| Formation circularity | Not exercised by this delta; the specific S2 premise gap below remains a prerequisite for W7. |
| Owner interaction | SQL application owns debt creation, native apply owns recipient evidence, semantic owner validates it, source ACK apply owns discharge. No alternate controller/ledger is introduced. Registry/metadata updates remain root-owned before preservation. |
| Hostile contract input | Typed plain-record and position contradictions are present. Accessor/prototype/intrinsic attacks are not certified by this test-only red-witness review. |
| Cleanup | Existing producer/recipient close paths aggregate failures and retain directories on failed cleanup (`handoff.test.js:64-75`; fixture `:69-81`). No new owned runtime, timer or directory is introduced outside those fixtures. |

## Later-scope finding L1: S2 needs a real convergence prerequisite

This is a finding against the later plan premise, not a defect in the current
S1/RF1/RF3 delta. Missing leader location alone does not make a fresh ordinary
direct topology target provisional. Direct topology payloads carry no relay
depth (`src/topology/cdc-group-propagation-delivery-methods.js:698-716`), so the
actual handler evaluates depth zero and can return DEFER before addressed
fallback (`src/message-group/message-group-service-cdc-propagation-runtime-methods.js:26-66`).
The fresh fixture has no joining suppression, no CDCIntegrationService recovery
route, and null readiness. Null readiness makes metadata publication and
background readiness both true, so the convergence window is false
(`message-group-service-metadata-publication.js:45-57`;
`bootstrap/traffic-readiness-utils.js:112-119`). The local-ingress predicate
therefore refuses that bare premise
(`message-group-forwarding-owner-routing-methods.js:418-455`).

The later fixture must engage an actual existing formation/readiness interaction
or a genuinely relayed hop. It must not manufacture follower status, joining
authority or relay depth. A missing native leader address is itself reachable:
opening reserves identities without requiring every address, status reports
UNAVAILABLE, and an unresolved send is a peer-local failure rather than a
poisoned runtime (`raft-rs-operation-port.js:219-271`,
`raft-rs-status-observation.js:24-65`, `raft-rs-peer-delivery.js:59-95`). Both
cached address and node_id, plus bootstrap hints, must be absent on the addressed
follower. B must carry the real SERVICES group/type so cache reconciliation is
engaged; native membership/role must remain unchanged. Source topology must
capture distinct real target groups with explicit ACTIVE addresses, and source
selection must not silently substitute an already healthy leader.

## Remaining proof gates

After a preserved exact checkpoint, lab must first show S1 setup and the named
semantic reds. Later implementation needs independent source review and paired
positive/control runs. This delta does not complete RF1 application rollback,
lost recipient/ACK responses, native distinct same-row occurrences, all bridge
and source-subscriber branches, remote wire/pressure/deadline cases, memory and
cleanup bounds, S2/W7, large payload/fanout, or process loss. It grants no
historical delivered-row classification, original complete-cohort opening,
protected activation, durable transfer, composed two-start, Quest closure or
release acceptance.

## Final nine-file registration and generated-data review

**Verdict: APPROVE for exact frozen red-witness preservation and a measured lab
attempt only.** This appendix extends the preceding three-file review to the
root-prepared nine-file candidate. It neither changes that review's semantic
scope nor claims an observed runtime failure, passing implementation, Quest
closure, startup acceptance or merge readiness. Reviewer:
`subagent:/root/mg_delivery_design`. Production baseline remains
`c11c4ca266e78c815c9cd41954e351d20b182a41`.

The reviewed manifest is
`MANIFEST-mg-delivery-witnesses-r1-2026-10-23.json`, SHA256
`000a5358d8cb766bd01e7052eaf7e4948b5f2fac1759af7d9e0a19dcd77b72f7`.
Its preserved bytes equal `/tmp/mg-delivery-witness-manifest-r1.json`. All nine
manifest hashes were independently compared with both the current worktree and
the staged index; all match. The staged path set equals the manifest path set.
The three authored test hashes still equal the identities reviewed above.
`git diff c11c4ca266e78c815c9cd41954e351d20b182a41 -- src` is empty.

| Reviewed path | SHA256 |
| --- | --- |
| `solve/changes/global-owner-debt-inventory/inventory.json` | `c7fce2b2185e801042109752f079c2d4f262f2645258bbf7a2ebd837c30d0b7c` |
| `test/cdc/cdc-delivery-outcome.test.js` | `87375a2e9993b5ad0cbe7d2477b35d525e2eef725ca04a74e76c455fe2a0947f` |
| `test/message-group/message-group-native-custody-fixture.js` | `2806d3980b7b4b0392c79e2924984fb23e26147c5c27a3ed2e5d7a9409ff3012` |
| `test/message-group/message-group-native-custody-handoff.test.js` | `cc50118621a0d150bf9726e7e01b72ef493f74042b48f92c32f0666c027286a4` |
| `test/shards/impact-contracts.json` | `27cd6dd34504e6fa4bcac545c91234e284c889decde95d0224cbe33b9849d358` |
| `test/shards/impact-graph-seal.json` | `15f4ef485a9aec9a0d1999fdfecca8588eb0da1d2ae25bc6c09ef9bfc4cc232c` |
| `test/shards/primary-classes.json` | `0a6485aa8a166ecca08ef0daa78ba18b42dde35a81cf78dd665fe7c06d3dc04c` |
| `test/shards/resource-classes.json` | `70c821826096554c8345777197b82d5f07b749cdece2a492e46f35aa0082f4e8` |
| `test/shards/subsystem-classes.json` | `d8f78da81e26cd8aebc0317b5302af193e151e6e86ad11a2ba271303b8e21794` |

The new `cdc-source-native-delivery` contract names the existing source,
propagation, native recipient and response owners. Its 21 distinct paths equal
the union of the `source-and-propagation` and `recipient-and-response` endpoint
paths. Every owner and named witness exists. The contract's two test paths equal
the pair's two witness paths; no unrelated test or fixture is presented as a
decisive witness. The descriptions preserve exact occurrence/native application
custody, source-owned CDC_DELIVERED discharge and the explicit incomplete-proof
boundary. They do not turn transport acceptance, provisional hydration or a
callback return into recipient evidence. The registry now contains 71 contracts
and 44 pairs. This is an initial registration of the current witnesses, not a
claim that those witnesses close F1-F4, F2-P or S2/W7.

The generated classification delta adds only the new outcome unit test:
2,443 to 2,444 classified files, unit 2,114 to 2,115, ordinary 2,426 to 2,427,
and cdc-metadata 63 to 64. The subsystem observation additions correspond to
the new direct imports in the outcome and handoff tests. The impact graph seal
and inventory refresh their input identities; the graph gains one module and
17 edges, with unresolved imports unchanged at 36. Clone-group and duplicate-
line counts, debt scores and ratchet limits are not raised. No production owner,
runtime setting, acceptance condition or test classification is weakened by
these generated changes.

I inspected the preserved normal precommit capture
`STATIC-mg-delivery-witnesses-r1-precommit-2026-10-23.txt`, SHA256
`83dfb33c1ce0733873ae0ce6cd5f9dd0fb84eace860f91712514804843069f0f`,
which equals the supplied temporary capture. It records the normal ratchet and
guideline checks and metadata refresh. Root separately reports the registered
hook exited zero, `audit:impact-contracts` passed with digest
`c0c4fc1dfc67e06f1d1fe61649a06684c4f47637c2aaae5ed62031636d04fc2f`,
and `audit:shards` passed for 2,444 tests across 22 subsystems. This review did not
execute those checks or runtime tests and does not substitute those reported
static results for the required lab measurement.

One finite implementation-registration follow-up remains: the actual
`resolveCdcIngressDecision` owner is
`src/message-group/message-group-forwarding-owner.js:257`, and
`buildLatencyCdcPropagationResult` is in
`src/message-group/message-group-service-runtime-support.js:348`. Neither file
is currently named in an impact contract. If the upcoming F3/F4 repair changes
these owners, add the changed paths to the interaction registration with its
witnesses, as required by the owner-interaction verification template. This is
not a blocker for the current source-unchanged test candidate and does not
authorize a later unregistered semantic source change.

The preceding category review, S2 prerequisite finding and remaining proof
gates remain intact. Preserve these exact bytes, measure the red checkpoint,
and distinguish setup/timeout failures from the named semantic assertions before
using the run to guide implementation.
