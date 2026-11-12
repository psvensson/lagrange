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
  Next: commit/push this WIP candidate and run the full lab suite before
  integrating F. The first inventory measurement rejected changing inputs;
  a subsequent run was interrupted. Neither supersedes the completed result.
- F: compose `1046d897d` and `3ce07ba54` in an isolated worktree, preserving
  M's classify-only record module and administration-owned read snapshot.
  Add the handler-owned own-group read boundary. The implementation owner is
  subagent `01a1ce13-dbe2-7e20-90bd-9b69ad140b9a`; separate verification is
  still required. Birth/restart and ended-operation cleanup proof remain open.
- Exactly-once c2/d: retain the lab failure as a correctness red. Source review
  identifies admission/redelivery and durable outcome as the first useful
  observation boundary; it does not establish the cause. Evidence recovery
  owner: subagent `01a1ce15-211d-7812-b935-1b652c12ff1d`.
- Checkpoint: original worktree bytes/modes match snapshot `402253be1`, and
  its index remains tree `7689e8691353b8516bfae21c8b0baaeef35f6ea3`.
  Isolated investigation owner: subagent
  `01a1ce13-dc09-7b20-b552-f16a4b50fd45`. First investigate failed replacement
  shutdown followed by cleanup, and real partition CREATE-deferral continuation.
  These are source-supported risks, not executed reproductions. The snapshot
  retains legacy marker handling and unfinished witnesses. Its historical
  80-file/37-mutation report does not cover the final snapshot. Checkpoint
  evidence and continuation log belong in its isolated candidate; the primary
  checkout does not contain that Quest.

## Remaining acceptance

Preserve first failures and prove their causes without fallback logic, enlarged
bounds, or raised baselines. Full lab results, F's independent review, checkpoint
evidence and its fifth verification remain outstanding. Formation additionally
owes composed independent review, the declared consecutive physical runs and
system-partition spread proof before Quest landing and exact-head publication.
See the handover for separately pending owner decisions and retained evidence.
