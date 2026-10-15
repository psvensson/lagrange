# D1 / D2 / D3 ordering traces: independent evidence review

Reviewer: subagent:/root/native_witness_verifier. No rerun, source change or new instrumentation. Candidate remains `4aa8780cfec6f2718b86b4d1e27ee9711492be59`. These are source-reconstructed schedules tied to recorded answer failures, not newly recorded native event vectors.

**Ruling supported by this evidence:** the finite-capture candidate regresses the existing F1 late-arrival contract. The same-host predecessor passes it. The existing runtime command-turn owner must decide the temporal cut and operation-response promise explicitly; the whole increment remains HOLD. The available artifacts cannot support a complete A/B safety ruling about unprinted outbound, final role/term/configuration or durable effects. They also do not establish a false committed-write acknowledgment.

Labels below: **recorded** means present in preserved raw TAP; **source-derived** means compelled or described by exact inspected code; **unavailable** means the computed value was not emitted and cannot be recovered from these artifacts. No result is invented to fill an unavailable field.

## Common schedule and identity

The real RF3 driver forms A=`oracle-a`, B=`oracle-b`, C=`oracle-c`. `midTurnCells()` builds pending AppendResponses by proposing `{acknowledged:'mid-turn'}` on A and delivering only to B/C (cells:650-653). The selected initial extent can contain multiple responses; there is no one-envelope bound here.

In the pending branch, the selected operation starts, and the harness confirms that its actual send hook holds at least one Promise. During that await it constructs a higher-term RequestVote, hands it to A's real `step` path, then releases all held sends (harness:522-532). The late vote is a **test-crafted transfer-election message**, not a captured core-origin W07 envelope: its term is the A status read plus one; its index and logTerm come from B's observed commitIndex and term; its context is base64 `CampaignTransfer` (cells:54-56, 658-663; harness:465-475). Those expressions are known; concrete numeric identities/terms/indices are not printed in the pair TAP.

The candidate captures the full `group.inbound.length` after successful `ensureExecution` (runtime:1745-1754), finishes that extent and invokes the command without absorbing the late vote (runtime:1696-1733). The processed-first branch instead injects the vote before handing over and draining its initial input (harness:502-510), then invokes the same operation. That explains the answer difference without asserting that the caller observed its answer before the late vote was processed. Ready completion, value construction, Promise settlement, subsequent owned turns and the consumer reading the response are different events; their precise interleaving is not recorded here.

The driver's virtual clock never advances by itself (driver:6-15). F1 explicitly uses status-driven delivery, listener reentry and later tick/delivery rounds (harness:236-240, 333-355, 568-585). It does not certify autonomous remainder service. The preserved W07/C2 evidence covers that separate obligation. No exact late-vote service position or particular wake owner is inferred from F1's answer mismatch.

## D1 — named transfer to C

Source request (cells:61-64): `transferLeadership({successor:'named', replicaIdentity:'oracle-c'})`.

1. **Source-derived:** selected transfer waits behind its captured AppendResponses; the supplied higher-term vote is accepted during a held send and falls outside that extent.
2. **Source-derived:** the candidate reaches its decision before stepping that late vote. `decideNamedTransfer` returning transfer-requested means its observed role was leader and C was an eligible transferee (leadership-transfer:87-103). Runtime then invokes the real core with `MsgTransferLeader`, `from=resolved C`, `to=local A` and drains Ready before constructing the accepted answer (runtime:1567-1586). The reference's no-known-leader branch returns a refusal without invoking that transfer step.
3. **Recorded candidate pending answer:** `{outcome:'CORE_OK', reason:'transfer-requested'}`. **Recorded candidate processed-first answer:** `{outcome:'CORE_REFUSED', reason:'no-known-leader', phase:'leadership-transfer', retryable:true, recoveryRequired:false}`. Candidate TAP:914-951; assertion site test:252.

**Outbound effects:** the source establishes a native transfer step in the accepted branch and no transfer step in the refusal branch. It does not establish a particular emitted MsgTimeoutNow, Append or recipient list from the artifacts. The initial response drain and vote processing can themselves emit messages, so refusal is not evidence of zero total outbound traffic. Exact outbound arrays and their divergence are unavailable.

**Role/term/configuration:** the helper branch identifies the candidate's local decision predicate; the reference is not on a known-leader transfer path. Exact sampled roles, term numbers, leader IDs, voter/learner arrays and final convergence are unavailable. This requested operation contains no configuration-change request; that is not a recorded proof of equality of the final configurations.

**Durable effects:** no exact hard-state, applied-state, log rows or positions are printed. Transfer-requested denotes acceptance, not a completed leadership transfer, lease revocation or durable application outcome. No durable divergence or equality is asserted.

## D2 — most-caught-up transfer

Source request (cells:65-68): `transferLeadership({successor:'most-caught-up'})`.

1. **Source-derived:** the same captured-response / held-send / late supplied vote schedule applies.
2. **Source-derived:** the candidate sees leader state, chooses the transferable voter with greatest matched index and lowest raft ID on ties, and steps its native transfer before draining Ready (leadership-transfer:106-131; runtime:1567-1586). The actual chosen transferee and its progress are not printed. The processed-first reference observes a nonleader predicate and returns without a transfer step.
3. **Recorded candidate pending answer:** `{outcome:'CORE_OK', reason:'transfer-requested'}`. **Recorded candidate processed-first answer:** `{outcome:'CORE_REFUSED', reason:'not-leader', phase:'leadership-transfer', retryable:false, recoveryRequired:false}`. Candidate TAP:952-989; assertion site test:252.

**Outbound effects:** source-bound transfer-step acceptance differs from the no-step refusal path. Actual network messages, targets, counts and timing are unavailable; do not infer B or C won the selection, a TimeoutNow was sent, or another replica became leader.

**Role/term/configuration:** the local decision's leader vs nonleader predicate differs by the exact helper branches. Numeric terms, identities and final configuration/role vectors are unavailable. No configuration-change operation is requested by this cell. This is not a claim about final equality or persistent divergence.

**Durable effects:** unprinted. Acceptance does not certify that the intended leadership change completed. No durable-state equality/divergence, replay or committed application claim follows from the answer.

## D3 — proposal classification

Source request (cells:69-72): `propose({decision:'propose', at:'oracle-a'})` through the existing proposal codec/port.

1. **Source-derived:** the same captured-response / held-send / late supplied vote schedule applies.
2. **Source-derived:** the finite-capture branch invokes native `propose` before consuming the late vote and reaches `drainReady` after a successful native call. The processed-first branch gets a native proposal refusal and returns its existing typed classification (runtime:1655-1693, 1589-1600). Do not substitute a different refusal reason such as no-known-leader for the native reason below.
3. **Recorded candidate pending answer:** `{outcome:'CORE_OK', reason:'drained'}`. **Recorded candidate processed-first answer:** `{outcome:'CORE_REFUSED', reason:'propose: raft: proposal dropped', phase:'propose', retryable:false, recoveryRequired:false}`. Candidate TAP:990-1027; assertion site test:252.

**Outbound effects:** successful native entry and Ready completion do not reveal which append/forwarded-proposal messages were sent. The exact output trace is unavailable. The failure does not establish a fabricated transport ACK or an extra authoritative result.

**Role/term/configuration:** the supplied vote changes the reference's decision inputs; the anti-vacuity check for moved inputs passed. Exact pending/reference role, term and configuration records are not emitted. No new configuration command is requested by this cell.

**Durable effects:** CORE_OK/drained is a runtime operation result, not proof that the selected proposal reached quorum, committed, applied, survived restart, or answered a production write waiter successfully. Its exact proposal bytes in the native log, position/term, applied rows and final outcome are unavailable. The record does not prove either a false commit or equal durable behavior.

## What was actually reached

For each candidate cell, `runCell` completed its internal observations and cleanup before the outer comparison: outbound and after-turn readings (:543-545), later exact observations, streams, independent read-only SQLite row collection and recovery snapshot (:567-591; durable fields at :414-445). The harness uses `synchronous=OFF` (:185-189); these reads are not power-loss durability certification.

The test then passed `assertNotVacuous` (:192-215), including initial delivered-input presence/type checks, reference steps equaling its delivered count, pending entry beginning with step, sufficient steps for pending's initially handed count, and the reference's changed decision input. The check does not publish full operation positions or prove every late occurrence was stepped exactly once at a particular point. It failed at answer equality (:252).

For these three candidate cells the following comparisons were **not reached**: outbound equality (:258), exact role/term/ConfState equality (:261), event stream equality (:264), durable row equality (:266), later settled outcome (:268), and the projection/restart anchors (:269-270). Their computed vectors were not emitted. Therefore “not asserted” must not be mislabeled “different,” “equal,” “not computed,” or “never reached the core.”

The source-only predecessor passes all three complete cells and all 155 tests, so its pending and processed runs satisfy the encoded comparisons in that execution. Its raw TAP does not print those vectors either. No predecessor vector is reconstructed by borrowing the candidate reference's printed answer.

## Exact receipt and stop

- Candidate commit: `4aa8780cfec6f2718b86b4d1e27ee9711492be59`; runtime SHA256 `b47951f39c6a5e7b93670a3a730115b3993976e808ec2e7d76598ade270dbc0f`.
- Predecessor-only commit: `19de88997fda4b6719bc0c1e46df61698bac1922`; runtime SHA256 `a560a052bf9b470a2046009555162b60669c340d86274fca9c74126fc8fbd01b`.
- Unchanged oracle SHA256 `fe5776a91c0fc706d14bd4c30e74316eadf1c15bef3bb5db12c657cd54341007`; harness `d958868591008aace41944d8de0704fda55edc8995c1ced4cb4fba4fedae2687`; cells `2bbaa9254e24e8adb6f56f07ef0d7ddf4916c03d6fbf831d301e0da732d52056`; driver `30a72135910db844b99474d6069fd26938f7a36fbe58ac2fe753f639fa583a13`.
- Unchanged transfer decision owner SHA256 `6e2a53dde07c07bb85bf5f0d5730640e01ca9a62e6e2a482101e220682a12798`.
- Lenovo candidate raw TAP `5c80b33c1ee8f70a08a515551fe2f77c302c84a8375790d5fb9cf5d1b65f1d3f`: 152 pass / 3 fail, exit 1. Lenovo predecessor raw TAP `c0f87ede3743a8ec98a1ff1d216c05fe07254a94174f86b545a7d62257a596eb`: 155 pass / 0 fail, exit 0.
- Full identity/placement/dependency/hash receipt: `f1-oracle-integration-independent-summary.json`, SHA256 `6a8b6a6731beabd753a912ebf80fb2f820f8692962016540ab4de4944f4094c5`.

The owner ruling must treat the result as a demonstrated compatibility regression, preserve the original F1 claim/evidence and specify any supersession openly. It cannot claim an evidence-complete A/B safety conclusion for unavailable vectors. No live-drain restoration, operation-specific escape path, new result authority or protocol implementation is approved here. Consumer obligations are a separate source review; this artifact does not silently decide them. Focused 56-pass results and all three valid negatives remain retained, while whole-increment certification and the complete release protocol remain HOLD.
