# D1 F2 correction — independent final review

**APPROVE the bounded F2 owed-work admission repair** at clean frozen `bcb063a7acf7f79c88ce0bea2e32be83c979c8d4`, against F2 base `fa85052324778a07cf0067fbfb7bd9cb1ef3028f`. The correction to rejected checkpoint `01d214f84b315adb5dd387f19d0e23092c425a50` resolves its sole blocking finding, F2-R1. No remaining blocking or nonblocking source defect was found in this bounded review.

This approves F2's source-level count admission, deterministic application, retained PREPARED completion and protected drain capacity under the stated finite-failure assumptions. It does not certify whole D1 service acceptance, public startup, physical failure domains, remote recipient execution, W7/W9, snapshot installation, publication or release. Count4096 remains distinct from a fixed byte/database/log-size bound and from arbitrary old retained input already being within budget.

Independent reviewer: Astra xhigh, `/root/cdc_d1_review`. The author supplied a frozen two-file patch against01d214, SHA256 `4ed6cf5d9a8a21028468c21baa6edf6a0a03f10543b91e16c1ca45afbaaa9365`. It was applied only in a new reviewer snapshot `/tmp/session-worktree-sMlGDY/tree`. The reviewer made no production repair. After the normal author hook completed, the parent confirmed final clean bcb063a7; independent comparisons bind every runtime/witness file and all18 manifest hashes to that exact commit. `identity.json` retains the complete binding. No author/integration/Quest/seal mutation was made by the reviewer.

The prior consolidated F2 REVISE report (`../d1-f2-independent/REVIEW.md`), SHA256 `8e5b44678a2e8df66f4667347450dc0a4a560c8646a34bad2e9152d0bdddc306`, remains unchanged with its complete checklists, original failures, baseline controls, native evidence and source limitations. This is a correction review of that same bounded surface, not a replacement or erasure of its negative evidence.

## What changed and why it preserves the owner boundary

The only runtime edit reorders the already-validated CDC and participant direct-return branches ahead of the SQL block in `applyCommittedEntry`, removing one nesting level. The existing committed-command gate remains first; HLC witnessing and coordinator settlement retain their order. SQL, CDC and participant type sets are frozen and disjoint. Unknown commands still fail at the same gate, and missing SQL keys still fail before dispatch. The old guarded SQL body, including its `command.sql` guard, is unchanged.

Independent AST comparison proves structural equality of the complete guarded SQL subtree, the prefix containing gate/HLC/coordinator logic, both CDC/participant branch bodies, and the common tail. It removes only parser positions/raw spellings when comparing. `compare-dispatch.mjs`, `compare-dispatch.log`, `ast-equivalence.json` retain the check and the exact type sets. This is source equivalence evidence, supplemented by real owner tests below; it is not substituted for runtime proof.

Therefore the critical SQL order remains: schema enforcement → durable settled-result lookup → PREPARED reservation → durable CDC capacity → statement effects → durable outcome/CDC recording → generation/traffic → afterCommit answer. Pressure still consumes without settling the entry. Commit/rollback effects remain under the same SQLite/native-applied-state transaction. No new await, retry, mutable projection, ledger, legacy branch or alternative authority was added.

The runtime file SHA256 is `3e098dfc56753d998d948e235cba1f2f8aa3eaca39c5884ecfef6977ae22e840`. Its independent strict cognitive check reports zero violations; scoped cyclomatic also reports zero. This removes F2-R1's cognitive22>20 regression. The only other executable edit tightens the cognitive baseline152→150 on the actual full checker's150/152 hint. Checker SHA256 is `4b52e1cafad5c240fb4bfb0d6a4f27e3f5859c13e765d7382585924ed2af28e4`; final generated inventory confirms150. No baseline was increased or scan scope weakened.

## Focused proof and applicability

| Evidence | Result |
|---|---|
| Independent correction source comparison | Complete SQL, CDC, participant, coordinator-prefix and tail equivalence; disjoint dispatch sets. `compare-dispatch.log`. |
| Independent cognitive/cyclomatic | Zero local violations on the corrected application file. `cognitive.log`, `complexity.log`. |
| Independent classified owner suites | Five files,79 runner assertions, all pass: committed-statement outcomes20, participant apply27, coordinator settlement4, CDC obligation24, owed admission4. `focused.log` and individual TAP files. Normal thermal gate CPU68 C/NVMe68 C. |
| Author exact-correction cone |14 files/299 runner assertions, all pass, including actual native RF3 leadership transfer, production release, source ACK drain and same-entry retry. Immutable final-commit cone (`reused/dispatch-final-cone.txt`) and native TAP (`reused/owed-admission-native-r2.tap`). This is author evidence, not mislabeled as an independent rerun. |
| Final source/normal hook | All18 manifest entries match reviewed bytes; runtime/witness diff against final commit is empty. `identity.json`, source manifest (`reused/source-manifest.json`), `reused/normal-hook.log`. Final source changes are exactly the two reviewed files; remaining changes retain evidence and regenerate metadata. |

The prior independent source/native/admission/queue/retained-image evidence remains applicable. The unchanged owners and the proven identical application bodies retain the mechanisms it measured: two concurrent proposals at4095 select one capacity winner; real file restart preserves4200 owed plus PREPARED256, permits its decision to reach4456, then source ACKs drain all4456; a rolled-back refusal emits no committed answer, and subsequent same-entry retry applies once; queue raw-operation custody and crossclass reserve remain bounded and release correctly. Existing same-host F1 negatives are preserved in the prior report/artifacts. The new correction was not required to reproduce those old behavioral negatives because it changes no admission semantics and adds no claimed behavioral fix.

F1's exact-ACK refusal, source-known pending reconciliation, ledger progress and retained-seed observation mechanisms remain unchanged and retain their accepted evidence. No arbitrary reclaimed identity becomes valid again. F2 admission remains count-only, uses the ledger owner, and retains the supported256-operation batch and2 MiB payload. The remote65-target W9 obligation remains explicitly unclaimed.

## Checklist continuation

All numbered items in the prior consolidated report were revisited for applicability; none is omitted by calling this a refactor. The following records the changed consequences and the evidence that keeps each category's prior dispositions valid.

| Applicable category/items | Final disposition |
|---|---|
| Admission/gating1–8 | PASS within prior ceiling. Same A predicate and current ledger reads, same apply recheck and reason shapes, same replay/reservation ordering. AST proof plus admission/outcome suites exclude a moved or skipped gate. No new wait budget. |
| Recovery/replay1–6 | PASS within prior ceiling. Settled replay still precedes capacity, PREPARED retains completion rights and no durable format changes. Independent outcome/participant tests plus unchanged-body proof establish prior restart/overbudget/rollback applicability. Arbitrary corrupt or unreadable state is not declared completion. |
| Concurrency1–6 | PASS. Serialization/afterCommit/afterRollback and pending-key ownership are unchanged. No await is introduced. Coordinator and CDC direct returns preserve their exact effects; the disjoint type check excludes ambiguous branch selection. |
| Retry1–8 | PASS within prior ceiling. No retry code, deadlines, counters or queue code changed. Owed-admission suite still measures same-entry continuation; prior lost-answer/late-success, drain and bounded-wait analyses remain applicable. |
| Owner interaction1–10 | PASS. Same single semantic owners and typed boundaries; no alternate path, projection authority or input-limit substitution. Prior control fingerprints remain preserved, and source equivalence plus focused tests bind the correction. Contract and registered witness bytes are unchanged. F2-R1 static closure gate now passes locally and cognitive baseline is tightened. |
| Transport/delivery1–6 | PASS within prior ceiling. Receipt/source settlement distinction and uncertainty ownership unchanged. Author new-source native TAP and prior independent native run retain explicit loopback/receipt substitution. No remote-recipient proof is inferred. |
| Harness fidelity1–8 | PASS. Correction test bytes are unchanged and actual production owner paths run. New AST check compares source, not expected outputs. Exact patch/final manifest binding is retained; no failed attempt or predecessor negative is discarded. Prior first restart/native outer cutover holds stay target-not-reached evidence. |

Sweep/formation/hostile-JavaScript templates remain inapplicable as separately changed categories for the same concrete reasons as the prior report: no new detector, formation authority or hostile-input guard. Existing timer and release interactions remain explicitly covered by the applicable categories above.

Inherited global cyclomatic debt remains **1766 against1755**, unchanged through F1, initial F2 and this correction. Normal hook success does not turn that whole-repository guard green. This remains with the existing global owner/integration work; no gate waiver or claim of global closure is part of this approval. The candidate-specific cognitive regression is resolved, rather than routed as inherited debt.

The primary-source comparisons and history in the prior report remain context with their stated applicability limits: they motivated drain and uncertain-response attacks but never supplied local correctness evidence. The reviewed final manifest SHA256 is `52e0f40c8b3d372c7878900a52da4549fac7edc363febdc7703909b9f8fb75ea`.

No reviewer test process remains. Root owns recording this exact-source verdict, composition and any subsequent service/release gates. Any later semantic source change needs an applicability assessment before reusing this approval.
