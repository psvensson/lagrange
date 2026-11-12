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
| Census derivation and authoritative publication read | `da530fe5e6809c0896afea4c40032448b965585a` is composed as unverified WIP `4b7a55d22`; root owns independent review, caller closure and fresh lab proof. The preserved author receipt is not independent acceptance. |
| CDC image, source position and occurrence effects | `/root/takeover_cdc` owns `work/cloud-cdc-image-effect-20261112`, from `57e396e440a48dce8c17b627514ad951c916c7ee`. That preservation has tests and no behavioral fix. The agent also owns composition of approved maintenance `9f6244542272d936da0281d2e00454149c6dd41c`, which overlaps the same source. |
| Removal settlement, lifecycle generation and status effects | `/root/takeover_inventory` owns `work/cloud-settlement-generation-20261112`, from `7a1d2f4e82efe1e04aefac26292205debe86c328`. That preservation has test drafts and unchanged production. Design must carry original identity through membership, persistence, projection and rollback awaits. |
| Checkpoint custody, receipts, inspection and recovery | Root retains the full original seal. Latest node receipt candidate is `df2ead4f6bc069b1d6def9bb2a236ed868fb999b`, an unreviewed sibling snapshot from `402253be1`. Compose only reviewed deltas with F; never replace F with the older source tree. Inspector v2 remains a proposal, with no approved implementation. |
| Lifecycle observation | `a5800406e961bc645a85504634c4fde534122551` records bounded R4 approval, but its external exact-candidate packet must be recovered or reverified before composition. |
| SQLite statement ownership | `188883de5b6b8790e536f91c9d00cb2f03f75c66` and `60b1c58fadb4a0f5688e40765ce2dbbb322524e1` have identical production. The latter adds rejected-source/evidence custody. Bounded outer-capture approval does not close the whole constructor migration. |
| Native role and package delivery | Role `b0ffa63cf8e287100c2b336f4c1dfeb66257b8b6` remains rejected/unfinished. Package `14d6b7a43ffdc8737aa9972f7b610d9f4f99f2c8` awaits validation/review; earlier staging/copy approvals certify negative diagnostics only. |

F, the clock and fixture repairs, permission witnesses, historical resolver and
retention, admin timing, and the earlier bounded CDC witness already in `fa70987b`
were checked against their preservation tips. Do not import them a second time.

### Lab execution and evidence

`/root/takeover_lab` is the initial sole dispatcher. The existing authenticated
lab mailbox is `psvensson/lagrange-lab`; no SSH credentials or service upgrade
were needed. Fresh read-only requests are ping
[#2663](https://github.com/psvensson/lagrange-lab/issues/2663), fleet observation
[#2664](https://github.com/psvensson/lagrange-lab/issues/2664), runtime observation
[#2665](https://github.com/psvensson/lagrange-lab/issues/2665), and handover-file
observation [#2666](https://github.com/psvensson/lagrange-lab/issues/2666).
The controller reports installed v0.2.2 source
`53e262450fada3b4e706898201a3c732811ae4d0`, unpaused and authorized for the
standing pool actor. Its uncertainty observation is retained; unknown jobs are
not cleared or cancelled. Actual reservation admitted the bounded observation.
Worker ownership, thermal and cleanup gates remain authoritative. No tests are
run in the cloud workspace. Root owns observation and continuation of these
requests; no unattended background supervisor is claimed.

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
