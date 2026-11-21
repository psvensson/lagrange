# Raft-owner authority: corrective round (2026-11-21/22)

Writer: single writer (subagent `claude:raft-owner-2`), worktree
`/mnt/data/peter/projects/.worktrees/raft-owner-authority-20261121`, branch `work/raft-owner-authority-20261121`,
started at `692336b45` (clean). Work list: `verify-raft-owner-authority.md` (B-1, C-1 .. C-5, unwitnessed list,
evidence gaps) as briefed by the lead. All lab runs: `tools/focused.mjs`, check base
`0dbed1718c2d07c1fcb8bbe56b87ac41763c262c`, directories under `lab/raftowner2-<label>`. No test executed locally.

## Commits

| Sha | Kind | Items |
| --- | --- | --- |
| (pending) | test | T restaging; red witnesses B-1, C-1, C-2, C-3, C-4 |

## T. Three test files red at 692336b45 (setup used follower forwarding)

Before touching `runtime-turn-integrity`, its cited claim was read: quest f1-step-down-port,
`solve/epics/raft-rs-full-cutover/quest-records/f1-step-down-port/coverage-model-amendment-1.md:7` ("A decision made
when relevant raft messages are already pending must produce the same externally relevant result as that decision
made after those messages have first been processed"), CA1 (`:14`, a refused envelope never answers the command;
the drain continues) and the event axis `:42`/`:46` (MsgPropose x ProposalDropped conditions). W07's own quest
(`solve/quests/runtime-captured-inbound-extent`) froze the W07 blob (`debc16f4`) for its own implementation; item C
removed the behaviour its setup used, so the restaging supersedes that blob (recorded here, R09).

| Case | Restaged how | Assertions |
| --- | --- | --- |
| W07 quiet input, W07 finite recurring inbound (`runtime-captured-inbound-service-native`) | B leads the term after the captured heartbeat's (named transfer A -> B, `leadNextTerm` in the companion fixture); B's predecessor turn waits on its own first held MsgAppend (before: the MsgPropose it forwarded); each stepped copy of the captured (now lower-term) heartbeat keeps a real native reply, B's MsgAppendResponse (raft.rs step, lower-term MsgHeartbeat under check_quorum/pre_vote) | all kept; "both callable proposals generated actual forwarded native outputs" became "each proposal generated actual native outputs (its MsgAppends carrying its entry)" - the forwarded output no longer exists |
| W07 refusal | the valid tail after the refused (C's, peer not found) acknowledgement is B's actual acknowledgement of the leader's own tail entry (before: B's forwarded proposal); with C removed only that acknowledgement commits the tail | all kept; "valid forwarded tail was durably appended" plus a new one: the durable commit index covers the tail (the step's effect) |
| companion 1 (queued capture), 2 (consumed wake) (`runtime-captured-inbound-boundary-native`) | as W07 service (fixture `{bLeads: true}`) | all kept |
| CA1 / M9 (`runtime-turn-integrity`) | the envelope after the refused one is B's acknowledgement of A's own entry; observed: A committed and applied that entry in the same turn (before: A appended B's forwarded proposal and sent it) | M9 kept (the tail is stepped in the same turn, not stranded) |

**Stopped (premise is follower forwarding), left as they are, red:**
- `runtime-turn-integrity` CA1 "a forwarded proposal the transferring leader drops never answers the leader's own
  proposal": the pending envelope class itself (a delivered MsgPropose, amendment-1 `:42`, `:46`) has no producer
  any more; after C-4 the ingress refuses it before the core. Options for the lead: delete the case as obsolete (the
  claim stays witnessed for refused envelopes by the two peer-not-found CA1 cases), or restage it on a synthesized
  MsgPropose and assert the C-4 ingress refusal never answers the leader's own proposal.
- `runtime-captured-inbound-boundary-native` case 4 "captures input after native ensureExecution reconstruction
  waits": its selected command is a proposal submitted before the reconstruction and its last assertion is "the
  selected command really forwards after reconstructed leader contact". A reconstruction restores a follower; under
  item C a proposal submitted before it can never be proposed after it (not leader, or another term). The capture
  claim could be restaged with a tick as the selected command, dropping three assertions (`result CORE_OK` for a
  proposal, `proposalEntries === 1`, the forwarded send). Not done without the lead's ruling.
