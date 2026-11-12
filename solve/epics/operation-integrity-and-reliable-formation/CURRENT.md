# Formation integration continuation

Last checked: 2026-11-12. Integration owner: current Codex session.
Governing rule-set: revision 5; rules source
`2fca51dc9a2f0344e23f0535dfa50fe0e000b674`.

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
clones: 625 groups / 22,875 lines versus 623 / 22,817. A separate Astra
continuation owns the shared-fixture repair; no baseline is raised.

The [formation Quest](../../quests/fresh-formation-user-table-routability/quest.json)
retains its sealed acceptance. Its authoritative continuation log remains in
the primary checkout. Original dirty worktrees and their staged boundaries
are preserved; no source writer works in the primary checkout.

## Current work

- Integration: metadata (2,772 tests), source indexes and owner inventory are
  regenerated. The source-index and shard audits pass. Cognitive complexity
  is tightened from 145 to the measured 144. The fixed-input inventory refresh
  completed; it records a complexity failure of 1,702 versus baseline 1,697,
  which is retained, not waived. Cycle and both duplication ratchets pass.
  These changes are committed and pushed as
  `eaccbd37a2794e6afbc46f4eb9d5434cc6a9802e`. Its full lab run completed
  across five hosts plus controller placement: 2,741 passed and 28 failed
  out of 2,769 files, with 107,019 assertions. Source stayed frozen for that
  run. First failures remain in
  `/tmp/lagrange-takeover-20261112-full-lab-eaccbd37a.log` and placement logs.
  A rehashed copy is in `/tmp/lagrange-takeover-full-lab-eaccbd37a-20261112`;
  its manifest SHA-256 is
  `302a6da9f29ee4353a0d486da104ab213bc92d43b086a46ab81fa08c6fe06b07`.
  The [verified evidence bundle](https://github.com/psvensson/lagrange/releases/download/solve-evidence/fresh-formation-user-table-routability--lagrange-takeover-full-lab-eaccbd37a-20261112.tar.gz)
  is retained in the evidence store. Reviewed repairs and refreshed metadata
  were subsequently pushed at `1b51362e0`; that tip has no full-lab result.
  The first inventory measurement rejected changing inputs;
  a subsequent run was interrupted. Neither supersedes the completed result.
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
  Native-role decoding passed focused tests but independent review rejected
  caller closure: transfer can bypass it, message-group reads can substitute
  a ledger term, and partition writes can lose its refusal classification.
  Stronger-model caller repair passed 19 focused files / 1,051 assertions
  but fresh review rejected four more production transitions: invalid announce
  does not withdraw leadership, inbound reads stale authority, removed-leader
  decisions ignore refusal, and row publication restores retained leadership.
  It remains excluded. The subsequent 73-path repair passed 48 focused files
  with 2,622 assertions and four engaged negative controls. Fresh independent
  review nevertheless reproduced learner/voter confusion, WASM forwarding
  without valid leadership tenure, and failure to recover an unchanged native
  follower leader identity. The sealed rejection is retained; fresh Astra
  author `01a1cedb-5e41-7eb3-bcae-f82a7581de61` owns the repair. CDC timing/occurrence failures
  remain under diagnosis. The bounded native CDC negative-phase repair has
  independent approval and is composed as `35d74da00`; historical JOINED
  causality remains unresolved. A separate diagnostic WIP `be9d4c15f` on
  locked `tv-dator` reproduced the foreground timeout before fixture setup
  completed: only `fixture-start` appeared, before any retry/stop assertion.
  The specific startup cause remains unknown; the 215-file selected lab run
  is still in progress. Package/solve budgets
  and census closure remain open.
  The independently approved retention plan selects only superseded v3/v5/v7
  designs. Its prerequisite historical-reference checker r3 has independent
  approval in a separate Quest; the whitespace-only correction has independent
  syntax-equivalence applicability. Its receipt uses `complete` where the probe
  requires `pass`; metric zero is not completion, and correction is assigned
  with the duplication repair. A separately sealed retention Quest has now
  archived the exact three historical files through canonical upload,
  re-download and member/source-blob verification in its isolated worktree.
  All other original solve bytes remain unchanged. The retained archive SHA is
  `7e59d557879a4d2018a75fa6292c4f97091731df6e999bd2278a5ce854185a8a`.
  Active footprint there is 20,883,131 bytes (88,389 bytes headroom); historical
  reference validation passes. Independent post-relocation review and integration
  remain pending. Existing 18 missing required proofs and migration-inventory
  absence remain separate failures. Packaging has an independently
  approved diagnostic prototype plan; the prototype is being implemented,
  with no package-delivery or installed-provenance approval.
- Statement cache: Phase 1 of `sqlite-connection-statement-ownership` now
  has independent approval of the owner and three dedicated test files, with
  13 passing cases and engaged negative controls. Its receipt remains incomplete.
  Production constructor/caller migration against frozen F reached a frozen
  95-path candidate with 15 focused files and 187 passing cases. Independent
  reviewer `01a1cec3-bbef-7f71-86de-41c00c07da42` rejected it: origin-history
  inspection touches connection state and starts SQL before brand validation,
  and original-allocation issuance changes synchronous settings before refusal.
  Fresh Astra max-effort worker `01a1cecf-6752-7082-a44b-d5b864e739a1` owns the
  entry-boundary repair and systematic sibling inspection. Generic uncached
  transaction callers remain valid. The rejected manifest is
  `73327edb822156b7ef395bdd8da6db8c1c43528463f005b55faa10238e3f66d6`.
  Receiver integration tests, separate permission/guideline repairs and full
  composed lab verification remain open; no migration approval is claimed.

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
