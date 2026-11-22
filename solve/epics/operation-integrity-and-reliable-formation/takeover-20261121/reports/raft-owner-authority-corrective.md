# Raft-owner authority: corrective round (2026-11-21/22)

Writer: single writer (subagent `claude:raft-owner-2`), worktree
`/mnt/data/peter/projects/.worktrees/raft-owner-authority-20261121`, branch `work/raft-owner-authority-20261121`,
started at `692336b45` (clean). Work list: `verify-raft-owner-authority.md` (B-1, C-1 .. C-5, unwitnessed list,
evidence gaps) as briefed by the lead. All lab runs: `tools/focused.mjs`, check base
`0dbed1718c2d07c1fcb8bbe56b87ac41763c262c`, directories under `lab/raftowner2-<label>`. No test executed locally.

## Commits

| Sha | Kind | Items |
| --- | --- | --- |
| `d5c02e1e2` | test | T restaging; red witnesses B-1, C-1, C-2, C-3, C-4 |
| `4e18b4c1d` | test | C-1/C-2 witnesses: deliver without a status read between envelopes |
| `e01b7ae8a` | fix | C-1 the named refusal |
| (pending) | fix | B-1 the observation's unsettled reasons |

### Lab `raftowner2-c1-green` (tv-dator, `e01b7ae8a`; adams-gamla refused "not a ready lab machine")

6 files, 5 green, 1 red: **C-1 green**; C-2 and C-3 red (their repairs not yet made, expected);
`follower-proposal-refusal` (named refusal), `runtime-ordering-native-companion` (D3 named), `transfer-leadership-drain-order`
(7/7: a leader's own drop during a transfer still answers transfer-in-progress; the self-removal drop stays
non-retryable), `queued-proposal-leadership-fence` (witness c), `local-log-guard-correct-followers` (W4) green.

### Lab `raftowner2-red2` (adams-gamla, `4e18b4c1d`; adam-laptop refused "not a ready lab machine")

`proposal-submitting-leadership`: 3/3 red, each for its defect:
- C-1: submitted under term 1; the proposal's own drain deposed and re-elected A at term 3; answer `HOST_FAILURE /
  leadership-transfer-in-progress / retryable: true`; the kernel's deferral rule re-proposed; **1 native propose
  (the re-proposal entered under term 3)**.
- C-2: REMOVE_PEER submitted under term 1; at its step A leads term 3 with an entry of term 3 applied; `CORE_OK`,
  **1 native `propose_conf_change_v2`**.
- C-3: as in red1.

### Lab `raftowner2-red1` (adam-laptop, `d5c02e1e2`; tv-dator refused "not a ready lab machine": runner refusal)

6 files: 1 green, 5 red. Per subtest:
- T: `runtime-captured-inbound-service-native` **4/4 green** (W07 quiet, replacement, refusal, finite recurring);
  `runtime-captured-inbound-boundary-native` cases 1-3 green, **case 4 red** (stopped, as expected);
  `runtime-turn-integrity` 4/5 green, **CA1 forwarded red** (stopped, as expected). CA1/M9 green.
- B-1 (i) red for the right reason: core leads term 1 with a turn pending and `inboundQueued: 1` of term 4 (the
  successor's), observation `role: leader`. B-1 (ii) red: `tickBacklog` absent, role leader with a tick queued.
  B-1 (iii) green (guard).
- C-3 red for the right reason: announced candidate at term 1, the proposal's own turn won, `CORE_OK`, 1 native
  propose.
- C-4 red for the right reason: the peer's MsgPropose was admitted (`CORE_OK inbound-enqueued`), not recorded, and
  committed on all three replicas.
- **C-1 and C-2 red for the WRONG reason** (witness defect, found by reading the measurement): the witness read A's
  raft id through `cluster.raftPeerIdOf` per delivered envelope; that is a `readStatus()`, which drives delivered
  inbound, so A had already stepped the heartbeat and the MsgTimeoutNow and was an announced CANDIDATE at T+2 when
  the proposal was submitted - C-3's hole, not C-1's. Corrected in the next commit (raft id read once; a
  non-driving observation asserts the re-election waits unstepped and the core is at T at submission); re-run red
  before the C-1 repair.

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

## C-1. The submitting-leadership refusal is one named answer

Witness `test/raft/raft-rs-backend/proposal-submitting-leadership.test.js` C-1: A leads term T (own entry applied);
delivered into its inbound, unstepped (a non-driving observation asserts it): B's heartbeat at T+1, B's
MsgTimeoutNow at T+1, C's vote at T+2 (synthesized from the real raft ids; admitted by the ingress and the guard).
A proposal submitted under T: its own turn's drain deposes A and re-elects it at T+2 before the propose step. A
caller following the write kernel's deferral rule (`portDeferralOf`: HOST_FAILURE, group usable, transfer or user
transaction) re-proposes. Red at `4e18b4c1d` (`lab/raftowner2-red2`): `HOST_FAILURE / leadership-transfer-in-progress
/ retryable`, re-proposed, 1 native propose under T+2. Green at `e01b7ae8a` (`lab/raftowner2-c1-green`).

Repair (`e01b7ae8a`): the fence in `raft-rs-proposal-term.js` answers `RAFT_PROPOSAL_REFUSAL.SUBMITTING_LEADERSHIP_ENDED`
itself (not the core's dropped-proposal refusal), so `answerRefusedProposal`'s transfer classification - which
recognises only the core's own drop on a LEADER core - never applies to it.

**The named refusal (one classification, defined once in `raft-operation-port-constants.js`):**
`{outcome: CORE_REFUSED, reason: 'proposal-submitting-leadership-ended', phase: 'propose', proposed: false,
retryable: false, recoveryRequired: false, submittedTerm (number|null), term (core's, number), role (core's)}`.
Meaning: nothing was proposed or forwarded (a definite outcome); not a host failure; not a deferral; the
submission's authority is gone, so the SUBMITTER re-decides under the leadership it observes now (routes to the
leader, or proposes anew while it leads) and never re-sends the same proposal on this answer.
