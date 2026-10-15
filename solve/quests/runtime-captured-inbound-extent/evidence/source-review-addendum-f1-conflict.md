# Final review addendum: historical F1 ordering conflict

Independent reviewer: `subagent:/root/snapshot_contract_audit`, 2026-10-15. New append-only evidence; the original source review, historical F1 model/tests, and first native failures remain unchanged. No tests, production changes or fixture changes were performed by this reviewer.

**Whole increment: HOLD for a content-bound owner decision.** The original approval correctly found that the source implements the new finite-capture DESIGN. The broader proof now exposes an incompatible historical F1 ordering contract. Focused greens do not resolve it. Do not restore live draining, silently amend the historical oracle, or infer a new Raft safety defect from the differential failure alone.

## Exact identities

- Candidate `4aa8780cfec6f2718b86b4d1e27ee9711492be59`, runtime SHA256 `b47951f39c6a5e7b93670a3a730115b3993976e808ec2e7d76598ade270dbc0f`, Git blob `d8f86b81e7c3098da01cf558aa37a85334c7ace9`.
- Test-only predecessor `04391697aeabea5ddd504491321546212b95982e`; baseline runtime SHA256 `a560a052bf9b470a2046009555162b60669c340d86274fca9c74126fc8fbd01b`.
- Principal's source-only predecessor treatment `19de88997fda4b6719bc0c1e46df61698bac1922` was independently checked to contain that exact baseline runtime SHA256. No paired-result claim is made here before the outcome is reviewed.
- New DESIGN SHA256 `1a122e71d184efba30e857d61a1ad0b23f5c06a4c2a85da5aeaf032d1675232f`; original source review SHA256 `f9c6e0f78e8fcd5af86407af8dd9008967ee3c65695ccbd8874d68e6404e35c3`.
- `test/raft/raft-rs-backend/transfer-leadership-drain-oracle.test.js` SHA256 `fe5776a91c0fc706d14bd4c30e74316eadf1c15bef3bb5db12c657cd54341007`; harness `d958868591008aace41944d8de0704fda55edc8995c1ced4cb4fba4fedae2687`; cells `2bbaa9254e24e8adb6f56f07ef0d7ddf4916c03d6fbf831d301e0da732d52056`. These files are byte-identical between 04391697 and 4aa8780c.

## Historical contract and current contract

Historical path: `solve/epics/raft-rs-full-cutover/quest-records/f1-step-down-port/`.

`coverage-model.md` SHA256 `f0049c4d700e3dd1d34be2380e9d9630b3eb70e68c51996cc55ae294176113be` defines the runtime command turn as owner (:14–22). Its T3 row (:165) explicitly requires a message arriving during an await before the decision to drain before that decision. `coverage-model-amendment-1.md`, SHA256 `6df59e5dfb767cb36ecc63653809af5c72a663fff8e2474cf7583c17ac03437b`, retains rather than narrows the claim (:7–16) and requires every delivered envelope before any decision read (:70–72). The amendment's last preserving commit in this history is `1aea11baf6ba35a397547be54fa2621e674c1977`; that is historical provenance, not a new current lease.

The native cells make this temporal condition explicit at `transfer-leadership-drain-oracle-cells.js:642–664`. The pending harness starts the command, waits for a real held send, injects a higher-term vote and delivers it to the same group, then releases the send (`...harness.js:522–532`). The processed reference injects it before its initial drain (:502–510).

New DESIGN.md:9 instead captures the extent after `ensureExecution` succeeds, preserves the full captured prefix, and excludes later appends from that turn. Candidate runtime:1745–1754 captures that extent; :1709 and :1731–1733 finish it without absorbing the newly appended vote. Both definitions cannot govern the same late-arrival schedule while promising identical answers.

## Minimal observed trace

1. A is leader. Initial delivered AppendResponse work is in A's inbound queue when the selected command begins.
2. The turn captures that queue length, steps its captured work and waits for an outbound send.
3. During that await, B's higher-term transfer-election RequestVote is delivered to A's queue. No runtime-generation replacement occurs.
4. The send completes. Candidate finishes its captured prefix and runs the selected command before stepping the late vote.
5. The processed-first reference has already stepped the vote, so it evaluates a different legitimate core state.

TV first-run file result: **152 PASS / 3 FAIL**. D1 and D2 returned `CORE_OK/transfer-requested` where the processed reference returned `CORE_REFUSED/no-known-leader` and `CORE_REFUSED/not-leader`. D3 returned `CORE_OK/drained` where the reference returned `CORE_REFUSED/propose: raft: proposal dropped`. All fail the direct answer equality assertion at test:252. This is a reached semantic ordering difference, not a missing symbol or setup failure. It does not, by itself, show a false committed-write acknowledgment, lost vote, extra authority, or Raft safety violation; the test stops at the first differing answer.

Frozen evidence: `/tmp/lagrange-runtime-correction-20261015/runtime-collaborator-first-review/second-snapshot/tv-dator.log.snapshot`, lines 667–1705; SHA256 `a75d438f42b363c65066b21cfe3f47ad749ddef1147019a36c11859b19691123`. Extracted oracle block SHA256 `f4de295917639338c8f556741b290091dd4b3dc8cb26aa1ad7277c1ec8ce59ca`. The principal separately launched a candidate/source-only-predecessor whole-file pair on Lenovo to classify this specific interaction under one host. That is a diagnostic source comparison, not retry-until-green.

## Required decision and remaining uncertainty

The existing runtime command-turn owner must explicitly decide the temporal cut for late-arriving ordinary peer input and the corresponding transfer/proposal consumer contract. Preserve the original F1 evidence unchanged. If the selected finite extent supersedes historical T3, document that exact contract change and obtain independent content-bound review of its paired witness and limits. Preserve CA1 handled-refusal/tail custody and CA5 no nested announce obligations. This addendum proposes no production repair and no alternate scheduler or authority.

A separate native uncertainty remains in `test/raft/raft-rs-backend/single-path-partition-cutover.test.js` on Adam: the seed case reaches production bootstrap but stops at `current_control_owner_fact` unavailable for `sql_transactions-p1`, 38 of 45 releases completed, 3,005 ms elapsed against its unchanged 3,000 ms release budget. Its standalone write/restart cases separately fail default-closed admission. The seed failure is **causal UNKNOWN**, not declared inherited and not attributed to capture. Preserve its first failure and compare the exact predecessor whole file on Adam after the existing lock is released. Do not broaden this correction into release recovery or change the timeout.

The nine affected suites and new/frozen focused controls are separately reported green by the principal; they do not close this historical contract conflict or the full widened cone. The release successor remains HOLD and unsealed/unactivated, shared-control-wave HELD, Runner/TAP PARKED, and the rejected protocol/model and PR #122 remain rejected.
