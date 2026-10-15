# Native release-fencing evidence and owner-decision packet

2026-10-15. **HOLD for implementation.** The accepted rejection of
`bde70cec74b8eb8e8db17d0d50a432102947d6d4` stands. This packet preserves that
review, maps the accepted semantics to the actual owners, and supplies native
boundary measurements. It does not repair the rejected model or approve its
table. Start with [OWNER-CONTRACT.md](OWNER-CONTRACT.md); its F1–F8 table
accounts for every independent-review finding and names the remaining gates.
The user's additional request for comparable implementations is addressed in
[COMPARATIVE-PRECEDENTS.md](COMPARATIVE-PRECEDENTS.md), with primary sources,
explicit applicability limits and proposed native witnesses.

## Exact custody and scope

Worktree: `/mnt/data/peter/projects/.worktrees/release-fencing-native-contract-20261015`.
Branch: `review/release-fencing-native-owner-contract-20261015`, pinned from
the rejected base above. Test checkpoints:

- `f22c8b32280514dde68519dd8232498e6d306099`: first PREPARE, settlement and
  retention witnesses plus native fixtures and generated classification data.
- `897ccebeb4cda14bb98bfb21102ebbc5bb181f52`: additional PREPARE epoch witness
  plus generated classification data. Earlier test/fixture bytes are unchanged.

There are no production `src/`, vendor, package, or lockfile changes. This
branch inherits rejected PR #122 source and is an evidence branch, **not a
merge candidate**. No successor was created/sealed/activated. The existing
`seed-control-current-proof-amortization` Quest remains the evidence route;
its historical seal is not a successor seal.

Fresh custody checks are in [custody-receipt.json](native-evidence/custody-receipt.json).
The shared integration checkout is still
`integrate/rs-raft-2026-09-30` at `0996d7576516af24f5f4d3e1e9aee37c775aabae`.
Its 18 staged paths and complete status are byte-identical to this packet's
starting observation. Staged-patch SHA256:
`0b2ea79142a13f4dcada523f01108fbd8a4809492838e23f7a0246a7159953fc`.
Process/worktree inventories were refreshed; no existing process was stopped
and no pre-existing checkout was edited. These observations are not ongoing leases.

All 64 manifest entries in the supplied original review bundle verified.
Original archive SHA256:
`7f682a6d08672a5dc70bd243bdf76806970dd32f4cc179b8e145e3157c9cfe72`;
the standalone report matched the archive's REVIEW.txt exactly. The original
Downloads files remain unchanged. This packet preserves 61 manifested files
byte-for-byte under `independent-review/`, including every executable probe,
counterexample, reproduced model trace and historical native witness. The two
shared staged patches and one full process inventory remain local because
they contain unrelated checkout/process custody material. Their identities
and the selection are explicit in [preservation-selection.json](preservation-selection.json)
and [review-bundle-verification.json](review-bundle-verification.json).
No old trace was replaced. Reproduced selected model checks remain evidence
of reproducibility, not abstraction fidelity or protocol approval.

## First results, including failures

Each row used real native raft-rs, RF3 participant replicas with separate
SQLite databases, the existing admitted-group fixture and real recipient
PAUSE/RESUME. Each group runs in one process with one node identity and
loopback transport. The coordinator fixture is RF1. Jobs on different lab
hosts are independent groups, **not a physical cross-host RF3 certification**.

| Native file | Exact checkpoint / locked host | First exit and classification |
| --- | --- | --- |
| `participant-release-first-prepare-native.test.js` | `f22c8b3…` / tv-dator | 1, semantic RED at expected refusal; runner 2,274 ms |
| `participant-release-prepared-settlement-native.test.js` | `f22c8b3…` / lenovo-laptop | 1, positive settlement prefix reached, later reauthorization blocked at existing fixture boundary; runner 17,067 ms |
| `participant-release-retention-native.test.js` | `f22c8b3…` / adam-laptop | 0, reachable accumulation/one-active control; runner 4,111 ms |
| `participant-release-prepare-identity-native.test.js` | `897cceb…` / adams-gamla | 1, semantic RED at epoch-mismatch refusal; child TAP 2,590.350 ms |

These are new selected-contract witnesses on unchanged production bytes,
not regressions introduced by this evidence branch. All first attempts are
retained. Retry-on-failure was disabled; the result ledgers say attempt 1 and
`retriedOnce:false`. No timeout was raised and no failed file was retried.
The first three jobs ran concurrently through the existing lab owner;
machine-wide flock, exact-commit isolated checkouts and dependency readiness
were supplied by that owner. The adam-laptop thermal gate waited one normal
poll before execution. No shared dependencies were installed or changed.

The existing passing-test relay kept the retention ledger but not its raw
TAP. One explicitly bounded second run of the already-green retention test,
on the same host and exact `f22c8b3…` bytes, used the existing executor's
`results` path to retain full TAP. It also exited 0. This was raw-evidence
capture, not retry-until-green; both runs are preserved. No runner source or
test harness was changed. The epoch test used that capture option on its
first run. Commands and orchestration are in
[EXECUTION.txt](native-evidence/EXECUTION.txt); complete plans, discovery,
stdout/TAP, exits and ledgers are beside it. Extracted JSON diagnostics are
derived views of those raw logs, not replacements.

## Minimal native traces and what they establish

**N1 — first PREPARE after local PAUSE.** Initial release is real and every
participant is applied/committed at index 4. BEGIN/staging exists only on the
leader: no participant row and no applied-position advance. All three real
PAUSE recipients close admission. An ordinary INSERT is refused with
`partition_write_cutover_paused`. The first PREPARE nevertheless returns
success and creates PREPARED on all three at index 5/term 1, while admission
remains closed and application data remains empty. The final refusal
assertion fails. See [first-prepare-after-pause.json](native-evidence/first-prepare-after-pause.json).

This is a reachable mismatch between current local admission and first
durable PREPARE. It is not the still-unimplemented committed HOLD protocol:
no sealed PREPARE was suspended in transport across HOLD, and no newer
durable authorization was created. The source has no such command/binding
seam yet. Reporting that gap is preferable to inventing replicated staging
or a production hook.

**N2 — durable obligation settlement while closed.** A second BEGIN is
refused while staging exists. A real PREPARE reaches all three at index 5.
After PAUSE, exact PREPARE replay returns the original index/digest/rows.
The existing fixed coordinator owner commits FREEZE and ROLLBACK; participant
decision bytes are derived from that recorded result. All three participants
reach ROLLED_BACK at index 6 with the same decision digest and no application
data, while ordinary admission stays closed. Exact decision replay preserves
the result; opposite COMMIT is refused; terminal PREPARE returns ROLLED_BACK;
ordinary INSERT still receives the pause refusal. These assertions precede
the saved [prepared-settlement-while-closed.json](native-evidence/prepared-settlement-while-closed.json).

The file subsequently fails when it attempts later release, after coordinator
PROGRESS. The exact refusal is `release_fact_unavailable`, missing
`current_control_owner_fact`, with `controlOutcome:query_transaction_drain_pending`.
`replica-handler-participant-cutover.js:settleQueryRelease` needs the
existing QueryEngine's `settleTransactionReleaseRows` for a nonempty census.
This fixture has no QueryEngine service. A terminal status alone is not its
owner's discharge proof (`distributed-transaction-release-census.js`).
The complete file is **not green**, and reauthorization is unproved. No
manufactured drain fact, extra harness or production hook was added. The
positive prefix proves request replay and authoritative ROLLBACK settlement,
not duplicate committed-command application, COMMIT, crash recovery, or the
full query routing path.

**N3 — reachable history under the native one-active rule.** Six transactions
are sequentially prepared and settled from actual coordinator ROLLBACK
records; a seventh legitimate coordinator intent becomes PREPARED. Another
BEGIN is refused. All replicas retain six terminal rows plus one PREPARED
row at applied index 17, with 7,304 bytes of participant JSON. The first
terminal row measured 1,070 bytes. Replaying a terminal decision adds no row
or applied position. See [native-retention.json](native-evidence/retention-capture/native-retention.json).
The serialized SQLite image measured 139,264 bytes; it includes database/log
storage and is **not** an application checkpoint payload. The recorded
snapshot byte count was 0; no snapshot recovery was performed.

This excludes the model's four simultaneous BEGIN-pinned obligations under
the real owner rule, but demonstrates sequential terminal accumulation. It
does not measure new release-result/conflict history, prove a finite capacity
policy, or authorize release to retire TX1 rows. The contract specifies
separate count/byte budgets, pinned records, a monotonic retirement fence,
and reserved closure/settlement/recovery capacity. Finite outstanding-credit
custody and numeric budgets remain owner decisions, including the schedule
HELD(v) -> current-version refusal history full -> APPROVE needs capacity.

**N4 — epoch-mismatched replay borrows PREPARED.** PREPARE at epoch 7 becomes
durable at index 5. After PAUSE, a PREPARE with the same transaction/participant
IDs but epoch 8 receives the epoch-7 PREPARED success and original index/digest.
All durable rows remain epoch 7 and positions remain 5. The expected-refusal
assertion fails. See [different-epoch-prepare-replay.json](native-evidence/identity-first/different-epoch-prepare-replay.json).
This exercises the real participant input/fast-path boundary. It does not
prove that the legitimate coordinator emits such a request. Exact immutable
identity validation and its scope require the TX1 owner decision; sessionId
remains routing context and phase-valid commit-mode transitions remain valid.
This cannot silently become an unrelated production TX1 repair.

## Verification and unresolved systemic gates

The independent verifier examined the actual fixtures and source mapping
against admission, recovery, harness fidelity, owner interaction,
concurrency, transport and retry categories. Its reviews and content-bound
addenda are retained under `native-evidence/`. Preserve those qualifications:
native local PAUSE is not committed HOLD, a request fast path is not applied
log replay, and direct loopback delivery is not query reroute/unknown-outcome
custody. The seven final test/fixture hashes are in `test-source-hashes.json`.

Scoped lint, normal commit guards, shard classification and impact-contract
registration checks passed. Full lint remains 85 errors; complexity remains
1,788 violations against a 1,755 ratchet. Both reports match an isolated
`bde70cec…` predecessor after only root-path normalization. No baseline was
raised. See [static-baseline-comparison.json](native-evidence/static-baseline-comparison.json).
No full corpus/exact-main certification is claimed. Historical RC1/RC2
same-host comparisons remain inherited F-MIR failures as recorded in the
preserved independent review; they were neither rerun nor repaired here and
remain integration reconciliation work.

The complete next unit is release/HOLD -> ordinary write/first PREPARE ->
durable exact outcome/replay, including existing query forwarding, D2
application, D3 serving, D4 observation, capacity and recovery owners. The
contract explicitly names new bytes/records and the missing decisions:
initial/closed-to-closed transition semantics, canonical D0 evidence and
admission binding, typed result/conflict/retired shapes, finite credit custody
and capacity, and application snapshot provenance/atomic recovery. Current
rs-raft checkpoint scrubbing does not preserve this application state.
These gaps block implementation approval, not just additional model testing.

Successor remains unsealed/unactivated. Shared-control-wave remains HELD.
Runner/TAP remains PARKED. PR #122 remains rejected. No production repair,
restored INSPECT atomicity claim, compensating-PAUSE rollback claim, merge or
publication to main is authorized by this evidence.
