# Formation integration continuation

Last checked: 2026-11-12. Integration owner: current Codex session.
Governing rule-set: revision 5; rules source
`2fca51dc9a2f0344e23f0535dfa50fe0e000b674`.

## Candidate and acceptance

The takeover baseline is `d0f86d73cfd3272cc35788dab113b9741f70ec3b`, verified
against origin. Its source matches `21a82d45b`; the later commit adds the
[handover and reports](HANDOVER-2026-11-12.md). Neither has a lab result or
independent approval of the composed source. The last reported full lab run
is `22f9791e9`, with 12 failing files. Nothing is landed.

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
  The first inventory measurement rejected changing inputs;
  a subsequent run was interrupted. Neither supersedes the completed result.
- F: compose `1046d897d` and `3ce07ba54` in an isolated worktree, preserving
  M's classify-only record module and administration-owned read snapshot.
  The isolated r3 candidate is staged tree
  `0e0e7f1c0b95d42d49af5a2a5e1e6dd638be13b5`. Independent review rejected
  two remaining freshness paths: runtime opening can backfill a never-opened
  fact, and snapshot observation can interpret missing history as fresh.
  Stronger-model reimplementation owns this work in
  `lagrange-codex-f-compose-20261112`; fresh independent review remains required.
  Preserve its r2/r3 manifests and the first native setup failure. That failure
  preceded redrive; its historical input bytes are unavailable.
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
  checkout does not contain that Quest.
- Lab fixture repair: the required cache subscription contract exposed a
  family of incomplete test doubles. Stronger-model repair in
  `lagrange-codex-lab-fixtures-20261112` has 26 focused files passing with
  1,242 assertions and independent bounded approval. It is integrated as
  `38cd22346`. Its original lower-model
  failure is retained. Production fallbacks and test bounds are unchanged.
- Other isolated work: direct example-owner import and SEA host requirement
  are independently approved only as a bounded delta, integrated as
  `6313ab6a2` from WIP `fddbae1be`. A stronger clock-fixture repair passed its
  owning suite and mutation controls and awaits independent review;
  its lower-model syntax failure remains retained. Closed native-role decoding has a
  red-first malformed-role witness. CDC timing/occurrence failures remain
  under diagnosis; package/solve budgets and census closure remain open.

Repository implementation now defaults to `gpt-6.1-sol`; difficult ownership
repair uses `gpt-6-astra`. A failed implementation verification transfers to a
stronger model for reimplementation and fresh independent verification.
Low-risk read-only inventory may use a smaller model. Parallel writers own
separate worktrees; local test execution observes the shared machine lock.

## Remaining acceptance

Preserve first failures and prove their causes without fallback logic, enlarged
bounds, or raised baselines. Full lab results, F's independent review, checkpoint
evidence and its fifth verification remain outstanding. Formation additionally
owes composed independent review, the declared consecutive physical runs and
system-partition spread proof before Quest landing and exact-head publication.
See the handover for separately pending owner decisions and retained evidence.
