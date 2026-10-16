# Independent ordering companion pre-execution review

Reviewer: subagent:/root/completion_consumers. Source inspected at base 96985eb2ba0720b7f5e3b36c63ce10e3a2ff71b3. No native execution performed. Verdict: APPROVE exact bytes for first locked native execution; HOLD any F1 supersession, consumer correctness conclusion, or whole-increment approval.

Exact SHA256:
- runtime-ordering-native-companion-fixture.js: 6a06a910a7e3765348d6c841f484062ecd3f88f458a1d00587ff9a92198eeb8b
- runtime-ordering-native-companion.test.js: 458a7ca245aef183f593d76a9474f2aeffdd8789016aa4bb73a8c6448a34661a

F = test/raft/raft-rs-backend/runtime-ordering-native-companion-fixture.js; T = corresponding .test.js.

## Harness fidelity

1. Right-reason: T49-127 checks actual accepted counts, exact native steps, selected native entry and explicit refusal/acceptance shapes. F180/185 seam-guard failures are setup/service-engagement limitations, not semantic REDs. No result exists yet.
2. Binding: F60-93 records actual existing native observer/fault/transport seams without substituting replies. Runtime invokeCore at src/raft/raft-rs-runtime-owner.js:342-359 calls both observers directly before the actual core operation. F34-41 catches serialization errors so observer failure cannot become a native refusal. F90/92 preserves receiver, complete args and original returned value.
3. Time: F172-198 declares one zero-time existing owned-clock dispatch, 256 passive microtasks and no tick/status/manual delivery inside observation. T72-78 checks identical virtual time, single dispatch and zero native ticks. Microtask/seam exhaustion is not native starvation evidence. Setup/convergence may drive: F123-147,201-218 explicitly segregate them.
4. Fields: original cell producer reused F127-141; vote explicitly crafted, same full bytes compared T147-150. Complete native initial state compared; proposal identity encoded from actual codec T38-46.
5. Vacuity: nonempty prefix F139, actual source output identity/order T62-71, exact once native vote T31-35 and selected entry counts T85/T116 exclude empty/tail-only witnesses. Three cases selected from original mid-turn family F24-25; runner must report three cases.
6. Live proof: callable native core and SQLite observations, not a deployed cluster certification. First execution artifacts still required.

## Concurrency / serialization

Synchronous capture is source-mapped rather than exposed by a new hook (F174-175). Input acceptance is separately observed from processing T54-71. Held-send await and late ingress order is explicit T92-100. Distinct AFTER construction keeps V outside runtime until O's actual Promise observer (F185-188), not a candidate transcript. Independent F1 listener-reentry axis is disabled in all three constructions F270-271; this is an explicit limitation, not certification of reentrant callers. One test/run at a time is required because observers are process-global; F96-100 resets them and F239-263 refuses unowned teardown. No new production claim CAS, locking, retry or scheduler is introduced; those template items remain outside this test-only proof.

## Transport / delivery

ACK not processed: T57-71 requires both INBOUND_ENQUEUED and exact native step; no ACK-only success. Full native outbound packets compared T159-160. Promise settlement of real invocation and sends retained F44-57; late and independent timing differ explicitly F229-230. CORE_OK/CORE_REFUSED shape, phase, retryability and recoveryRequired are asserted T102-127. Missing-handler/router error mapping is not exercised: this reuses the native operation-port transport fixture, not MessageRouter. Bound failures are explicit seam guards F180/185 and cleanup diagnostics; they cannot certify undeliverable behavior.

## Recovery / replay

F216 uses original requester restart with durable record; T133-134 compares term/ConfState. This is clean component restart, not power-loss, snapshot install, live/cold reconciliation, workflow enlistment or application-result replay. F226 names synchronous=OFF persistence qualification. No stale recovery state is written by this test; absence is never converted to completion. Application-enter/afterCommit observations are passive F80-84 and recorded commands remain original cluster-owned data.

## Owner interaction

Runtime alone owns ordering and typed operation receipt. Native event/SQLite projections are comparison evidence, not operational authority F112-120. Late-vs-AFTER and preaccepted V-before-O are asserted in same three-case witness T141-164, preserving the proposed progress/freshness pair without modifying F1. This does not prove old F1 same-schedule equality: original failing test remains unchanged. Existing owned wake dispatch F191-193 provides declared runtime continuation; no added driver or priority lane. No pressure/backoff bypass, source correction, authority alias, force flag or fallback is added. Registry/impact metadata remains principal-owned and must be registered before publication. Prior source-only W07 negative remains separate; this packet claims no new mutation control until executed.

## Admission / gating

Existing native predicates alone decide receipts; all three explicit reason shapes retained T121-127. No fabricated admission or new budget. Pre-capture accepted V is actually stepped before the decision T107-127; later V is handled after native O T82-100. Actual completion/serving semantics are deliberately delegated to other consumer witnesses. Native entry vs native return is not falsely collapsed: F227 explicitly states existing seam only observes entry. Promise settlement is actual but not a direct native-return hook.

## Retry / re-drive

No new retry loop, attempt reset, or conditional success. Fixed passive guard is bounded, exhausts loudly, and does not advance owner state F166-169. One zero-time timer dispatch is declared and counted, not repeated until success. Input exact-once counts prevent duplicate step acceptance T53-71. Production retry registration, storm ceiling, mutual suppression and late-success idempotence are not certified by this fixture.

## Remaining qualifications

- No direct native-return event seam; record native entry, application callbacks and actual caller Promise settlement separately.
- reentry:false changes the original oracle's subscriber behavior and is disclosed. A pass is proposed replacement ordering evidence for that explicit schedule, not all production reentrancy.
- Post-observation convergence and recovery vectors are complete but deliberately driver-assisted; they do not prove passive service.
- First native execution may expose fixture/semantic defects; preserve its full diagnostic vectors before classification.
