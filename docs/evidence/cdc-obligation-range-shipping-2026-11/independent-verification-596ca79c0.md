---
audience: evidence
recorded: 2026-11-14
quest: cdc-obligation-range-shipping
---

(Typographic dashes in this report were replaced by ASCII hyphens for the documentation audit; nothing else was changed.)

VERDICT: REJECT - 596ca79c026bcf52ada8e81e8e800abbcf5c31da

(Report of the independent verifier, saved by the lead from the verifier's hand-back because the verifier's harness refused to write report files. Text unchanged.)

Reading found no safety defect; claims (i)-(iv) hold. Three mutants survive and S-1 mis-states the cut. Tip 79054bb18 adds only the quest log; no bound, delay or baseline rose; message-group, cache and ledger writes are untouched.

**Blocking**
1. V7 survives, also over 34 partition and topology files (range.js:319, `every`→`some`). Under it a failed range is passed when any one row was acknowledged meanwhile; rows above a hydration image inside it are skipped and later rows ship first. Claims (i) and (iii); new shape of the writer's M08. No witness pairs an image inside the range with a failed answer.
2. V8 survives (delivery.js:384). The cell's `windowCut` is unwitnessed: a window-cut range covered on a pinned retry need not widen. Claim (v); new mechanism.
3. V10 survives (range.js:124-127). The pre-pass passes a hydrated row whose acknowledgement was refused. Inherited gap: no test makes the proposer unavailable.
4. Scan lifetime is missing from the model (new mechanism), and S-1's "cut only by" is false as recorded.
5. Owner-interaction item 10: `partition-cdc-obligation-range.js` and the four new witness files are absent from coupled pair `cdc-source-native-delivery`.
6. The deviations below are not in `log.ndjson`.

**Captured tail**
1. Same pass. Base returned the held outcome without touching the scan (base delivery.js:617; candidate 569). It re-captured the tail only at pass end (587), contended yield without provisional leftovers (547), the retained bound (432), an idle handshake (733) and a new tenure.
2. A legitimate base cut that the sealed constraint preserves and S-1's list failed to name. The code is right, but approval cannot be bound to S-1 as written (R09). The record should say: a retry after a hold continues the scan; a range is cut by the scan's captured tail, a not-READY row, the window, bytes, the acknowledgement or retained bound, and entry boundaries; window-cut and the wave bound are judged within that tail. Only range-shipping test 16 pins it, incidentally.
3. No safety reason. The tail is "a scheduling bound, never evidence" (ledger.js:204), and the pin caps a covered cell anyway. Keep the tail while `scan.provisional` (base rule, or passed rows starve). Each refused retry then materialises the grown vector (M-2). It changes a sealed-unchanged item: supersede, witness, new candidate.

**Provisional conflict**: not producible; (v) stands. Ingress is decided per vector from recipient state and table name (acceptance.js:200-232; forwarding-owner-routing-methods.js:484-488), and the outcome binds every member (cdc-delivery-outcome.js:310-319).

**Deviations**
- Accepted: quantum of 255 plus one range; window-cut only when the window alone cut; quantum revert; baseline 386→385; live-query last answer.
- Retained bound inside an entry: the letter holds (a refused row is not READY). The sibling regression is producible when a partly covered vector is recomposed at the bound after a handshake; unwitnessed.
- Emits after a refusal: accepted; base emitted before an ignored refusal (base 392-394), and nothing in `src` listens.
- Node-ready merge: accepted under S-4b, but the overlay is not the cache merge, and the witness's stub cache uses the same overlay (handoff.test.js:294-301).
- `PartitionCDCGenerator` per-event path (112-169, 474-502): dead, outside writable paths; route its deletion; S-3 over-states. Error texts: route.

**Window 1 versus base**: same-entry ordinals travel as one batch command; a refused acknowledgement stops the pass where base passed the row; sibling ordinals skip the batch-bound recheck; hooks run once per entry. No delay value differs.

**Mutants** (tv-dator, eight lane files; control c252bbf8 green, 130 assertions)
- Survived: V7 (f338cb9e, da6762ff), V8 (e413e725), V10 (f8c11673).
- Killed: V1 reused cell counts only this attempt's branches (8cfedba6, differential seed 34); V2 cursor lands on the refused row (5117be52); V3 window widened at presentation (2c35fdfc); V4 window filled from the next entry (5457b386); V5 cell retains the vector (5092a4b8); V6 pin kept on last position alone (dfc93557); V9 last-delivered sequence from the first member (1b695469); probe V11, tail re-captured after a backpressure hold (d1837be8).

**Evidence**: no broad green run (reject-fast). The differential is real (seeded, row-keyed, raw `event_json`), but its reference is the candidate at window 1, so (iv) rests on reading. Reverse-order overlap (M-7) is unwitnessed. The anchor is real, with single-replica recipients and a primed window. No test lost its property; the writer's 52 mutant records and final jobs match their evidence.

Notes: job evidence is under `/mnt/data/peter/projects/lagrange-foundation-coordination-20261114/range-shipping/verify-*`; mutant commits are branches `vmut/V1`..`vmut/V11` in the verifier's scratch clone; each job directory also holds its `source.bundle`. Probe V11 failed two tests: range-shipping test 16 is a behavioural kill; delivery-progress test 5 is an artifact of the probe (its mock lane has no `scan`).
