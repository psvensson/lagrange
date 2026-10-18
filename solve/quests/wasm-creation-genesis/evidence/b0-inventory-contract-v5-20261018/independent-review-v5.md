# B0 v5 independent design/oracle review — APPROVE

Reviewer `subagent:/root/rsraft_a0_readiness`, independent of author `/root/rsraft_b0_contract`. Exact reviewed clean commit `62170a9f68aa5e666298f7459046c248ca423516`; planning base `a1c3cde54fcb46471791062bcae4a6000ae484e0`; unchanged production/test subject `a251ce4fd9c980a78c0fd33d8a5f873161f90870`.

Contract SHA256 `3fab96dc955bc5e15dc70607de645092d566621cf0de74a3e122676c42e164d2`; paired oracle SHA256 `cfbb35827f080231e87f7f8690194e802e3fcde4c3dc10ff269b851f3b786693`. Independently verified all 75 subject/source/preserved-input manifest entries from exact Git bytes, including both predecessor verdicts and newly enumerated bootstrap constructors. No `src/` or `test/` changes. Audit: `/tmp/rsraft-guidance-20261018/b0-v5-independent-manifest-audit.json`.

**APPROVE the complete paired design/oracle only.** Full F2–F6/D1 interaction and the bounded v4→v5 delta were reviewed, including §7a ordinary production durable REMOVE binding/custody, all 43 sealed checklist items below and the conditional B1 inputs. No remaining design blocker found in this subject. This is not implementation/source correctness, a dynamic test pass, mutation/native/lab proof, task acceptance, production activation or Quest closure. U1 REJECT, v2 INCOMPLETE/REVISE and v3/v4 REVISE remain immutable historical judgments.

## Closure rationale

V4 B04 is now explicit at §7a: a fresh owner-confirmed UNBOUND request first validates the original identity, then synchronously checks the physical owner with no intervening collaborator/await before choosing its candidate. CURRENT must be exact; stopping/FENCED does not incorrectly require CREATE eligibility. DIFFERENT, unavailable/malformed/mismatching answers refuse before target CAS/handoff/effects/outcome. ABSENT needs one complete storage-bound original-journal observation of distinct recoverable matching node/entity/replica origins, with exact duplicate folding and total identity validation. Empty, multiple, unknown/truncated/nonarray/corrupt evidence refuses; memo/plan count and resource phase/order cannot manufacture uniqueness. Missing production reader refuses rather than using caches.

This read remains with the original journal/SQL owner and does not reserve, open, tombstone, reapply startup or create another ledger. Its storage atomicity is honestly bounded. The target-selection snapshot precedes immutable CAS: J already current at selection causes refusal; J arriving afterward cannot retarget I. Known BOUND replay bypasses new winner selection and retains its historical target. BN-01–05 and the added mutation explicitly attack both directions, tokenless ABSENT positive, ambiguous ABSENT negatives, already-current direct-manager J, later J, wrong CURRENT and stopped/unknown owner.

The three v3 corrections remain intact: (1) exact request target CAS/read on existing replica operation row plus distinct monotone retirement handoff on original creation row, full writer/retention/real production ingress scope and ordered crash cuts; (2) validated synchronous token exposure before own native continuation wake, with enqueue-only pending bit and explicit external pre-exposure retry ceiling; (3) every generic/bound manager and driver writer/effect guarded by captured actual entry/ownership, including catch/recovery/uninstalled prepare. Physical fence by operation+intent covers tokenless direct CREATE reentry before acceptance; existing admitted work is still owed retirement, not falsely stopped. Lower physical task custody and actual directory-owner shutdown remain separate from handler scheduling.

The full original D1/no-plan cells, one inventory/application lifetime, fair per-origin turns, permanent/deferred trigger distinctions, historical exact local RETIRED plus HISTORY_UNAVAILABLE proof, applied exact STOPPED acknowledgment and separately confirmed original journal completion remain unchanged. UNKNOWN leaves named debt; no boolean or ACK becomes finality. Production recovery-reader and projection/endpoint continuation limitations remain explicit activation obligations; ordinary REMOVE target ingress and fresh unique-owner read are required B1 work, not deferred to activation.

## Complete sealed checklist dispositions

Each “adequate” below is design/oracle judgment, not an executed pass. The seven sealed categories and all 43 items are addressed.

### Owner interaction (10)

1. Adequate: §2/7a assigns request binding, original mode/token, physical admission, resource finality and effects to existing distinct owners; no second journal.
2. Adequate: §8 and BG-01/02 give every generic/bound canonical writer the same captured ownership discipline.
3. Adequate oracle; unexecuted: matrix fidelity observes journal/resource/physical/memo/manager/driver/projection/outcome together.
4. Adequate: §7a fresh physical selection plus complete journal-owned unique ABSENT candidate closes B04; BN-01–05, BR and BG cover initial/replay/writer ownership separately.
5. Adequate: §7 finite plan waiters, one pending wake, exact gate entries and B03-05 fairness; no unbounded accepted request queue.
6. Adequate: §6/BW-01/02 names synchronous authoritative token exposure before own native wake.
7. Adequate: §7a requires immediate physical nomination qualification; §8 consumes one value-only observation and guards all canonical writers.
8. Adequate oracle; unexecuted: original 13 mutations plus added mechanisms require unmutated positive control, named assertion and exact restoration.
9. Adequate: retained-plan dispatch reenters ordinary authority; §7a selection/lost-answer rules fail closed and do not infer admission from CAS ACK.
10. Implementation prerequisite: owner map names shared impact groups; expanded ordinary production interaction must update actual registered owner cone. Additional constructors inspected: `bootstrap/shared/runtime-service-handler-setup.js:177–187`, `guarded-runtime-service-handler.js:20–34`, `startup-service-lifecycle-owner.js:29–33`; absent gateway/journal wiring must refuse, not use caches. The source map is illustrative, not permission to omit those compositions.

### Admission gating (7)

1. Adequate: §7a physical CURRENT exact or ABSENT plus complete unique original obligation qualifies only fresh UNBOUND selection; DIFFERENT/UNAVAILABLE/ambiguous evidence refuses. BN-01–05.
2. Adequate: current-unresolved, target-unresolved/legacy attention and busy are unadmitted typed refusals; no INITIATED/outcome before target and handoff confirmed.
3. Bounded design: one attempt releases gate; conditional retry is explicit; no new latency guarantee or relaxed existing owner budget.
4. Adequate: §7a/9 closed target/mode shapes and separate physical/projection/journal facts; raw booleans cannot discharge debt.
5. Adequate: fresh selection and known binding replay are separate; original redelivery/wake/retirement/restart triggers are explicit; legacy loss requires owner attention.
6. Adequate: irreversible handler lifetime, exact gate entry and generic/bound captured post-await guards; request/boot rechecks after authority awaits.
7. Adequate: §7a validates physical-current/complete unique-origin evidence before capture, then exact owner CAS/read and original handoff before admission.

### Concurrency serialization (5)

1. Adequate: existing synchronous canonical pre-admission gate, authoritative row CAS/read and lower physical admission fence; no parallel handler scheduler.
2. Adequate: §3/6/8 all old owner results and generic catches cannot overwrite a newer entry; refused observer prevents continuation.
3. Adequate: startup/CREATE/wake/REMOVE share gate; lifecycle task registry owns already-admitted path/native custody only.
4. Adequate: delayed callback/waiter/settlement checks same stopped lifetime and stable entry; B02-05/B03-04.
5. Adequate: §7a/BN qualify target nomination; exact origin/token joins, canonical scheduling and real directory ownership remain distinct lifetimes. BR-06 attacks direct CREATE versus handoff fence.

### Recovery replay (5)

1. Adequate: one applied inventory plus all generic/bound guards, not scans over current state; exact distinct plans retained.
2. Adequate: synchronous shared startup promise; only failed pre-application attempt explicitly retries; success/lifetime retained.
3. Adequate with explicit activation ceiling: unavailable/malformed whole read cannot become empty; total per-row diagnostics and one actual storage query; production multi-shard reader equivalence remains unproven.
4. Adequate for replay: §7a exact binding, retirement mode, six crash cuts, legacy/missing/refused evidence, terminal and retention behavior; BR-01–10. B04 is new admission, not loss of replay identity.
5. Adequate: exact local RETIRED/ALREADY + HISTORY_UNAVAILABLE versus missing storage/booleans; physical proof, applied STOPPED and original authoritative completion remain separate.

### Transport delivery (5)

1. Existing boundary retained: ACK only after target/handoff; no network response grants physical/resource finality. Real emitter/gateway production composition required by BR-07.
2. Adequate for duplicates: settled R_I rereads immutable binding before memo, survives restart and J; terminal/evidence-expired answer cannot select new target.
3. Adequate: unadmitted busy/binding-pending ERROR+deferRetry is distinguishable from admitted IN_PROGRESS. Existing semantic classifier and dispatch retry remain mandatory real witnesses.
4. Existing owner budgets retained: no new transport wait or fixed latency guarantee, no budget weakening. Terminal operation does not authorize new effects.
5. Adequate oracle; unexecuted: route stubs require paired real-owner interaction; BR cases require actual operation gateway/row CAS/read and ordinary emitter.

### Harness fidelity (6)

1. Adequate oracle; unexecuted: preserved F2–F6 cases must reach named assertions; ABI/setup/zero-test/timeout failures are rejected.
2. Adequate oracle; unexecuted: actual SQLite, journal/resource CAS, opening files and directory owner required; no scripted authority for proof fact.
3. Adequate oracle; unexecuted: explicit owner promise gates, physical admission and directory transfer rather than time compression.
4. Adequate oracle; unexecuted: complete original intent/token/local storage and exact physical projection identities; wrong evidence remains negative.
5. Adequate oracle; unexecuted: BN-01–05 plus nomination mutation isolate stale memo/direct current J, valid selection then later J, stopping/FENCED, absent unique/tokenless, ambiguous/malformed/truncated and observer timing; BW/BG/BR preserve prior corrections.
6. Honest ceiling: no B0 dynamic/native/live proof; checkpoint and future B1 ordinary green/mutations/static/corpus/lab/composed review remain mandatory.

### Formation circularity (5)

1. Adequate with explicit gaps: §3 missing production recovery-reader is lane D; ordinary REMOVE ingress is now required B1, not deferred. Production projection/endpoint completion is also not claimed wired.
2. Adequate: own native wake cannot be lost solely to token exposure; no-native F and independent pre-exposure event have named conditional redelivery/restart limits.
3. Adequate: pre-ready/current-unresolved/busy/legacy refusals retain owner retry/attention and no borrowed serving grant.
4. No formation latency approval: none measured; later native/activation must satisfy existing budgets.
5. Adequate authority split: journal uniqueness is a bounded owner read, not a new ledger/startup pass; physical selection is a snapshot, immutable operation binding and original mode retain distinct facts. Discard cannot widen permissions.

## Limits and required next step

Retain this exact-content independent verdict with its paired subject hashes. The immediate next B step remains the existing Quest's independently reviewed **test-only expected-red witness checkpoint**, preserving original evidence and actual runner failure/positive controls. No no-op task-v2, green wrapper, manufactured PROVEN status or retrospective Harnessd ownership is authorized.

Only after the real witness checkpoint, actual source/base pin, shared-file serialization with A1, correct ordinary owner wiring and genuine accepted task inputs may B1 be materialized/accepted. B1 must implement the complete approved interaction including fresh nomination, durable target/handoff and every writer/retention boundary; missing journal/gateway cannot silently fall back. A+B needs fresh composed-head finality/REMOVE proof, independently authored exact-restored mutations, classified real-owner tests, changed-path static/corpus/inherited-red accounting and applicable lab evidence. Separate design approvals do not prove this composed implementation. Author worktree remained untouched by reviewer.
