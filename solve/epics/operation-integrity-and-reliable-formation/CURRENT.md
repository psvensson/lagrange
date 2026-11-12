# Formation integration continuation

Last checked: 2026-11-12. Integration owner: ChatGPT cloud takeover `/root`.
Governing rule-set: revision 5; rules source
`2fca51dc9a2f0344e23f0535dfa50fe0e000b674`.

## Active cloud takeover

The user authorized continued development from all pushed WIP, systematic
diagnosis, historical and external-system research, removal of legacy/fallback
semantics, parallel development, and all testing on lab machines. This supersedes
the earlier sidecar-only/no-commit assignments and local-only execution choices;
it does not waive independent review, any sealed acceptance, or publication gates.

The source baseline is `fa70987b2833031ffe6054a9b12ee86bbb71d52c`, whose `src`
tree is `da2038508a4d18efc6d1bbafdb9c6597636bcba5`. The new integration branch is
`work/cloud-formation-takeover-20261112`. Preservation branches under
`wip/preserve-20261112T120432Z/` are recovery inputs, not approved integrations.
Their ordinary work branches often still point to an older base. Primary
preservation `e05d4040fd195d43690a3edb3859c31212c3bd72` adds 73 formation-log
entries and has older source; its source must not replace this baseline.

| Interaction | Source custody and next owner |
| --- | --- |
| Census and publication authority | Root retains `554ffb5fb02bbe1819782efd49ae2fd7af4dbdd0`; bounded 13-root/1,334-assertion functional proof passed. Strict complexity and other static debt remain open. Original2713's raw cache-wake bypass and withdrawn approval remain preserved. |
| Authority read modes and local image custody | Root's reviewed composition is `1c0c958de924f408da6b3d3cd172c7f7f3b39ef7`, source `62f344b7fdbff370380cf3870fb50da182d1f14b`. Two-mode ingress, result-owned witnesses, canonical local image agreement, shared capture and selected caller fixture corrections are source reviewed. Original3120 proves the producer defects. Producer-only candidate batches3206/3207/3208 and originals3194/3195 are separate from the composed candidate; no whole-composition pass is claimed. |
| CDC image, position and effects | `/root/takeover_cdc` owns this interaction, composed into the same source62f344b7. Paged-stop control3121 passed9 cases. Original3110 retains the R2 receipt, terminal repair and recipient fixture failures; reviewed corrections058de776 retain owed source debt and all semantic assertions. Catchup now captures row/key membership and witness scalars before repair callbacks. Exact candidate/static proof remains open. |
| Removal, lifecycle and runtime publication | `/root/takeover_inventory` retains `8643ed370113986570d62e1361b0ad1f9409b363`. Generation2697 passed8 roots/911 assertions; immutable observation2954/2973 and exact cleanup2890/2891 have bounded causal evidence. Runtime publication406 passed55 controls, but first-cleanup/reentrant factory3122 still exposes forbidden effects. Seed diagnostic3129 proves setup rejection before intended reentry; corrected original/candidate pair0fed72d4/3a14c0e2 awaits proof. Nominal producer/factory332 is source reviewed; full5183 callers, early public CREATE custody, generic STOP and native replacement remain open. Broad new source expansion is paused while extracting PRs. |
| SQLite and lifecycle observation composition | `0d89fcdc31df9f1384840a0f50a3de690d7ca8e6` records the bounded immutable-store correction98c20. Original2806 proves mutable connection retargeting; exact candidate2837/2854 passed6 roots/50 assertions, including native child records. The broader strict SQLite acquisition migration remains on HOLD; its old full run retains12 failures. Independent draft PR204 now contains only constructor connection immutability and focused controls on verified main; its own original3247 reproduces foreign database effects in all four negative cases. |
| Checkpoint custody, inspection and recovery | Root retains the full original seal at `da5eb99bdc2893d1dd245d25a68d789490571c91`. The recovered directory-custody/inspection proposals and node receipt sibling `df2ead4f` are not approved implementation. All-handle ownership, original episode recovery and actual restart/useful follower proof remain required. |
| Native role and package delivery | Role `b0ffa63cf8e287100c2b336f4c1dfeb66257b8b6` remains rejected/unfinished. Package `14d6b7a43ffdc8737aa9972f7b610d9f4f99f2c8` awaits validation/review; earlier staging/copy approvals certify negative diagnostics only. |

F, the clock and fixture repairs, permission witnesses, historical resolver and
retention, admin timing, and the earlier bounded CDC witness already in `fa70987b`
were checked against their preservation tips. Do not import them a second time.

### Smaller PRs requested by the user

On 2026-11-12 the user requested closing bounded work through smaller PRs. Live
main was verified at18:23:07UTC as
`49fba99e1ad27acf83a75fdcee1f89a061377de4`; the former local main `ef93af85d`
is stale. Extracted branches must be checked against the verified live base and
retain their own exact proof. Existing large WIP branches remain preserved.

| Cut | Owner and current boundary |
| --- | --- |
| Canonical JSON nested-data validation | [PR203](https://github.com/psvensson/lagrange/pull/203). Six code/test paths plus four scope/review records. First isolated local `dc52cfcb0a9f7d08405f4096e284cc285ca7cf70` was published as `b280e0a88f9f7319d6f7655b16bb28f64349e2fb`, identical tree `ca01bd7a54cc686b174b877b5f2f2c7cd907c131`. Independent source review APPROVE. Original 3194 verifies twelve failures and two positives among fourteen retained controls on the identical base serializer/helper. Exact candidate 3241 verifies PASS: two roots/574 assertions, utility 73 and actual calculator 501. Disjoint caller 3246 is fully verified: three roots/67 assertions, giving five roots/641 assertions on that initial candidate. Metadata/static 3242 passed generation and all checks except 34 brace-style errors; canonical selection requires 810 unique roots. The reviewed whitespace-only correction and current evidence are local `d9a901a24d025e63b3501ea3ab2803dd482bc0f6`, published `fb03e86177e003ab21779cd0f932d2d0bafe6826`, identical tree `70c017a795a0604f708154d13748e06f2232ae01`, unchanged product source. Fresh canonical generation, static checks, selected execution and exact merge proof remain pending. No row-capture API or broader CDC implementation is included. |
| Durable store constructor connection | [PR204](https://github.com/psvensson/lagrange/pull/204). Two authored paths: six added constructor lines and five focused native SQLite controls. Local candidate `223ad16ae23c73ae96c0a778776e5a56b7ccfb25`, published `3e1d1fa4dc61107f25927e480485323bc7417bcc`, tree `59693a7f15ed4bfa8fb00950b334b84d90ca8a6e`; tests-only original local `317a38f0c3f14a263d3035785ee68afe666ac06b`, published `292670255f07dd17213c60e2e93a316fda94e3cb`. Root independently APPROVES the complete controls and source. Both sides retain test blob `39d8b3ccdf429852090ca441233667b19206831e`. Original 3247 fully verifies four negative controls exposing foreign effects before failing, with the unchanged-owner positive passing. Exact candidate 3255 fully verifies all five cases PASS. Canonical metadata, selected callers and static gates remain pending. The broader strict SQLiteConnection migration is not imported. |
| Immutable lifecycle observation | Next candidate: five-line3356302 correction has bounded original/candidate evidence but needs a coherent main-base control extraction. No broad runtime constructor migration is implied. |
| CDC and authority follow-ups | Keep canonical read contract, row ownership, local-image agreement and catchup/receipt consumers as explicit dependent cuts. Do not open the whole runtime/factory stack as a small independent PR. |

The coordinator verified all94 live-main workflows. Main-targeted PRs
automatically start hosted tests with retry-on-failure, conflicting with the
standing lab-only/no-retry instruction. Both PRs were created against
`review/lagrange-split-base-20261112`, initially verified at exact main49fba.
The only other PR workflow has TiDB-specific paths that neither cut touches.
Main delivery and its required merge gates remain pending; no skip marker or
workflow edit is included.

The coordinator subsequently observed both PRs merged into that review branch:
PR203 at 19:03:06 UTC, merge `908e551732b4ce956759a0a93166caea736e7871`,
and PR204 at 19:03:23 UTC, merge `10f3e795981b45b68bdfbee93fa6d1674d2a1a7f`.
GitHub attributes both to `psvensson`; the event mechanism is unverified. The
coordinator issued no ready, merge or retarget operation and preserves these
observed changes. The review ref now points to the latter merge. Live main
still points to `49fba99e1ad27acf83a75fdcee1f89a061377de4`. A review-branch
merge does not establish completed acceptance or main delivery.

Fresh metadata/selection/static requests are registered as lab3264 for the
immutable store candidate `3e1d1fa4` and lab3265 for corrected JSON `fb03e861`.
They remain individual-head evidence. Their generated seals cannot be combined
or applied to the merged review tree because each binds a different raw source
and test universe. The next integration checkpoint must regenerate and freeze
metadata on combined review `10f3e795`, then select against fixed main49fba.
Its actual selected count must be conserved across three disjoint physical
shares; the initial JSON count810 is not assumed for the combined tree.
No separate overlapping PR-wide test cones are scheduled. All required
selected roots, first failures, exact identities and child-scope closure remain
mandatory; the review merges waive none of these obligations.

The verified direct JSON candidate log is 1,409 bytes, SHA256
`2ac20ef0d58f2655b0a504d8555f7bf86bac538776dcdc05f15cce1579bf0ca0`.
Its disjoint caller log is 1,492 bytes, SHA256
`72e26d2cafa0b9f5c5fe7ed5820355a16485b82fbdf04b9600897bea6ad0ca9f`:
buffer 48, property 11 and router 8 assertions, with exit 0 and closed scopes.
Its original3194 stream is 57,010 bytes, SHA256
`762e874c70a41bb6b0d6b7df042fa0402c74f0dc4b2d21b9cb85c78b62c308bd`;
the companion local-row failures are preserved outside this small PR's scope.
The twelve fewer candidate utility assertions come only from the deleted facade
identity subtest. Original store3247 is 9,654 bytes, SHA256
`71c8f50d931f7bb83e394d78461d7b836a98ac6e76c7dd17362d4c67afd46574`.
Assignment/accessor substitution redirects actual reads and writes, a closed
replacement manufactures snapshot absence, and reentrant substitution lets a
write escape the transaction on the original database. These diagnostics were
captured before the first failing assertion; later negative assertions are not
claimed reached. Candidate store 3255 is 1,293 bytes, SHA256
`4bc15a19a8658aed134903ba6d1e58be0da360486052dd11ffa6d4aef0949948`;
the identical five-case root passes on the constructor correction with the
original native SQLite identity. These streams retain exact source identities
and closed physical scopes. The JSON metadata/static stream is 13,123 bytes,
SHA256 `aa8e18b619e2a5bcb11d139179f77ea141b587eff4b9c5eb2dd4f449c9bfdb31`.
Its sole failed stage is test brace formatting, corrected by independently
reviewed patch `8d238d589e062a7c7cd5a58a3234ba9fb3a123c17647255cad0cc2537b25bc9d`.
All statements and assertions remain; raw-byte test hashing requires a fresh
generated seal. The old generated patch is retained as evidence for its exact
input and is not reused. These bounded results do not discharge canonical
selected callers, the final corrected static gates or main merge acceptance.

After these cuts, the next small extraction candidates are CDC retry-delay timer
custody and immutable lifecycle observation. Each needs its own main-base source
review and physical proof. The larger CDC image/effect chain must retain its
ledger/range producer, application adapters, cache owner and relister together;
main lacks those prerequisites. The metadata mutation cache-dedup finding is
preserved in the CDC Quest at `fbf3a52d5` and remains separate follow-up work.

### Lab execution and evidence

`/root/takeover_checkpoint` is the sole active lab coordinator and WIP transport
owner. The mailbox is `psvensson/lagrange-lab`; installed controller v0.2.2 source
`53e262450fada3b4e706898201a3c732811ae4d0` remains unchanged. Physical execution
is restricted by worker guard to `local-workstation`, `adams-gamla`, and
`tv-dator`. Host preferences are not placement constraints; every job verifies
its actual host, source/tree, dependencies and cleanup scopes. All tests and
static gates run on lab machines. WIP transport commits preserve exact Git
trees; they do not grant landing, integration or release acceptance.

Complete log hashes, exact source identities and scope closure are recorded in
the owning Quest logs and by the coordinator. Earlier results remain historical
measurements rather than proof of a later composition. Issue2694 was cancelled during
`npm ci`, before any tests; it is infrastructure evidence only. Issue 2696 on
unreachable lenovo remains uncertain with source execution reported and no
closed scopes. It is neither resubmitted nor cleared. No fail-once rerun,
timeout increase, baseline increase, reservation rewrite or uncertainty reset
is authorized by this progress.

The sections below retain the last integration handover. New conclusions go in
the relevant append-only Quest logs, and this section owns current scheduling.

## Candidate and acceptance

The takeover baseline was `d0f86d73cfd3272cc35788dab113b9741f70ec3b`, verified
against origin. Its source matches `21a82d45b`; the later commit adds the
[handover and reports](HANDOVER-2026-11-12.md).

The latest completed full lab is **`5e58474b13870c95ea6bd6175942c33984cd6ac9`**:
2,758 passed, 13 failed out of 2,771 files; 107,251 runner assertions. Source
remained clean throughout. Four remote hosts and controller placement ran it.
The copied evidence manifest is
`/tmp/lagrange-full-lab-5e58474b1-evidence-20261112/manifest.json`, SHA-256
`ce80197c4f09b39662877a24d35192d682dc5c294a08eb1d38b733b02e276042`.
The earlier takeover run at `eaccbd37a` had 28 failures. No whole-integration
approval or landing has occurred. The later reviewed CDC witness is composed
as `35d74da00`; that delta has no execution result on F yet.
The reviewed historical-reference resolver is composed as `fc43b3a43` from
preserved WIP `b7e5aca62`. Its regenerated metadata covers 2,775 tests; shard
and source-index audits pass. Integration inventory found two new test-fixture
clones: 625 groups / 22,875 lines versus 623 / 22,817. The independently
approved shared-fixture repair is composed as `10554f4bc`; its isolated
measurement restored 623 / 22,817 without changing the baseline. Reviewed
three-file historical retention is composed as `8b476b914`, and the reviewed
permission-witness repair as `d12c804e6`. These later changes have no full-lab
result. Metadata and owner-inventory remeasurement are complete; complexity
remains over budget, while both duplication ratchets pass.

The [formation Quest](../../quests/fresh-formation-user-table-routability/quest.json)
retains its sealed acceptance. Its authoritative continuation log remains in
the primary checkout. Original dirty worktrees and their staged boundaries
are preserved; no source writer works in the primary checkout.

## Current work

- Integration: regenerated metadata covers 2,775 tests; shard and source-index
  audits pass at `d12c804e6` plus generated outputs. Completed inventory refresh
  measures complexity 1,701 versus baseline 1,697, cognitive complexity 144/144,
  cycles 0/0, source duplication 33 groups / 1,064 lines and test duplication
  623 groups / 22,817 lines. The first earlier
  inventory refusal and interrupted attempt remain retained. Historical
  `eaccbd37a` full-lab failures are in the
  [verified evidence bundle](https://github.com/psvensson/lagrange/releases/download/solve-evidence/fresh-formation-user-table-routability--lagrange-takeover-full-lab-eaccbd37a-20261112.tar.gz).
  Current full-lab evidence remains tied to the exact source named above.
- F: r4 staged tree `b8f0f6474fa013c8393460fa54e40a5be4793ea5` has
  fresh independent bounded approval. All 56 manifest paths were rehashed;
  32 focused files passed with 1,270 reported assertions. Preserved as
  `aed5cba28`, integrated as `3a1fcd4ee`. The final manifest in the isolated
  worktree is `test-output/f-compose-20261112/r4/final-candidate-manifest.json`
  (SHA-256 `de06a5959caa2b431d71103e011080df5dda03410badb31b829e2238e4527cd7`).
  Freshness and construction custody rejections are closed within that review's
  scope. Earlier failures/rejections remain retained. Static debt includes an
  added initializer complexity point; no baseline or integration gate is waived.
  Constructor migration is now released against this frozen source.
  The [verified F evidence bundle](https://github.com/psvensson/lagrange/releases/download/solve-evidence/fresh-formation-user-table-routability--lagrange-f-r4-reviewed-evidence-20261112.tar.gz)
  retains the rejected attempts, negatives and final approval.
- Exactly-once c2/d: retain the lab failure as a correctness red. Source review
  identifies admission/redelivery and durable outcome as the first useful
  observation boundary; it does not establish the cause. The original physical
  log was recovered and hashed. This file passes on the current lab candidate,
  which does not discharge the earlier unexplained correctness red.
- Checkpoint: original worktree bytes/modes match snapshot `402253be1`, and
  its index remains tree `7689e8691353b8516bfae21c8b0baaeef35f6ea3`.
  Isolated investigation in `lagrange-codex-checkpoint-20261112` reproduced
  database unlink while a replacement handle remained live after failed
  shutdown; successful-shutdown control passes. Real coordinator continuation
  also exposes a bounded redispatch gap, not yet permanent-stranding proof.
  Its `R09-SPLIT-PROPOSAL-2026-11-12.md` is a proposal only. A product decision
  is pending between full ownership repair before delivery and separately
  proved cadence/install/recovery containment for a format-only delivery.
  Cadence HOLD alone cannot contain the unsafe install paths. The snapshot
  retains legacy marker handling and unfinished witnesses. Its historical
  80-file/37-mutation report does not cover the final snapshot. Checkpoint
  evidence and continuation log belong in its isolated candidate; the primary
  checkout does not contain that Quest. Stronger-model implementation of the
  exact-object custody core has bounded independent approval. Dependent
  cleanup/REMOVE/recreation work now passes the native no-unlink and finite
  recovery witnesses, but independent review reproduced additional finite-loss
  recovery failures. Its rejected candidate remains frozen while the coordinator
  prepares a separate repair. Composition with F
  remains required. Canonical marker closure is a separate parallel worktree;
  broader CREATE continuation and full acceptance remain open.
- Lab fixture repair: the required cache subscription contract exposed a
  family of incomplete test doubles. Stronger-model repair in
  `lagrange-codex-lab-fixtures-20261112` has 26 focused files passing with
  1,242 assertions and independent bounded approval. It is integrated as
  `38cd22346`. Its original lower-model
  failure is retained. Production fallbacks and test bounds are unchanged.
- Other isolated work: direct example-owner import and SEA host requirement
  are independently approved only as a bounded delta, integrated as
  `6313ab6a2` from WIP `fddbae1be`. The stronger clock-fixture repair passed its
  owning suite, mutation controls and independent review, and is integrated
  locally as `da7485545`; its lower-model syntax failure remains retained.
  Native-role decoding remains excluded after successive independent caller
  closure rejections. The latest reproduced learner/voter confusion, WASM
  forwarding without valid tenure, and failure to recover an unchanged native
  follower leader identity despite focused green tests. All rejected source,
  witnesses and verdicts remain retained. Fresh Astra
  author `01a1cedb-5e41-7eb3-bcae-f82a7581de61` owns the repair. CDC timing/occurrence failures
  remain under diagnosis. The bounded native CDC negative-phase repair has
  independent approval and is composed as `35d74da00`; historical JOINED
  causality remains unresolved. A separate diagnostic WIP `be9d4c15f` on
  locked `tv-dator` reproduced the foreground timeout before fixture setup
  completed: only `fixture-start` appeared, before any retry/stop assertion.
  That selected lab completed with 207 passes and eight failures in 215 files,
  with 5,402 assertions. The package test also exceeded its unchanged 180,000 ms
  deadline; its cause remains unknown. Independently reviewed setup-phase
  tracing is preserved and pushed as `286fdcec2`; its canonical 319-file cone
  is running on locked `tv-dator`. Its first case again times out at 4,200 ms:
  initialization finishes at 23.589 ms, but admission-facts begins at 44.490 ms
  and has no end before cancellation. Six later cases pass. Investigation now
  follows that facts-gathering owner; the internal cause remains unknown.
  The wider cone is not an identical workload comparison. Package delivery
  and census closure remain open.
  The independently approved retention plan selects only superseded v3/v5/v7
  designs. Its prerequisite historical-reference checker r3 has independent
  approval in a separate Quest; the whitespace-only correction has independent
  syntax-equivalence applicability. The receipt status correction and shared
  fixture repair have independent approval and are composed as `10554f4bc`:
  105 focused assertions pass, and the canonical probe reports metric zero and
  done=true. Earlier failures and the original status error remain retained.
  A separately sealed retention Quest has now
  archived the exact three historical files through canonical upload,
  re-download and member/source-blob verification in its isolated worktree.
  All other original solve bytes remain unchanged. The retained archive SHA is
  `7e59d557879a4d2018a75fa6292c4f97091731df6e999bd2278a5ce854185a8a`.
  Final independently reviewed isolated footprint is 20,888,374 bytes
  (83,146 bytes headroom), including retained proof; historical reference
  validation passes. Preserved as `47ade1897`, integrated as `8b476b914`.
  Existing 18 missing required proofs and migration-inventory absence remain
  separate failures. Packaging's independently reviewed prototype produces
  797 entries within size budgets, but 3,460 incorrect relative imports and
  one development-only dependency prevent execution. Its outcome is
  graph_refused, not package acceptance. A separately approved native-copy
  diagnostic design is continuing; product identity and provenance are unproved.
- Statement cache: Phase 1 of `sqlite-connection-statement-ownership` now
  has independent approval of the owner and three dedicated test files, with
  13 passing cases and engaged negative controls. Its receipt remains incomplete.
  Production constructor/caller migration against frozen F reached a frozen
  95-path candidate with 15 focused files and 187 passing cases. Independent
  reviewer `01a1cec3-bbef-7f71-86de-41c00c07da42` rejected it: origin-history
  inspection touches connection state and starts SQL before brand validation,
  and original-allocation issuance changes synchronous settings before refusal.
  Fresh Astra max-effort repair added entry validation at seven affected
  boundaries; 162 focused cases and nine scoped checks pass. Candidate tree
  `e005dfa408f0b84c6e81cc0cb2ff869e4a182c5d` is frozen for fresh independent
  review by `01a1cee7-8a29-77c2-ac41-2fd529a66b10`. Generic uncached
  transaction callers remain valid. The rejected manifest is
  `73327edb822156b7ef395bdd8da6db8c1c43528463f005b55faa10238e3f66d6`.
  Receiver integration tests, separate permission/guideline repairs and full
  composed lab verification remain open; no migration approval is claimed.
- Permission witnesses: independently approved six-file repair replaces four
  successful skips with real unprivileged EACCES premises and checks framework
  bindings without executing arbitrary source. The isolated focused runs pass
  125 + 7 + 21 assertions with zero skips/todos. Parent verified six source and
  22 dependency hashes and reopened all 179 downloaded archive members.
  Compact required proof is 8,443 bytes. Preserved as `eacbfe6a3`, integrated
  as `d12c804e6`; SQLite constructor composition and full-lab proof remain open.
- Checkpoint inspection: the marker investigation reproduced a read-only
  lifecycle inspection creating WAL/SHM sidecars beside a closed WAL-format
  database, after which strict install preflight refuses the image. This is
  a concrete owner-interaction blocker. Exact inspection ownership and an
  independently reviewed repair design are being investigated; the sidecar
  guard remains intact. No immutable-open assumption or cleanup bypass is
  authorized by this finding. Cleanup continuation repair and lifecycle
  observation repair remain separate candidates awaiting fresh review.

Repository implementation now defaults to `gpt-6.1-sol`; difficult ownership
repair uses `gpt-6-astra`. A failed implementation verification transfers to a
stronger model for reimplementation and fresh independent verification.
Low-risk read-only inventory may use a smaller model. Parallel writers own
separate worktrees; local test execution observes the shared machine lock.

## Remaining acceptance

Preserve first failures and prove their causes without fallback logic, enlarged
bounds, or raised baselines. Full lab results on the composed candidate, checkpoint
evidence and its fifth verification remain outstanding. Formation additionally
owes composed independent review, the declared consecutive physical runs and
system-partition spread proof before Quest landing and exact-head publication.
See the handover for separately pending owner decisions and retained evidence.
