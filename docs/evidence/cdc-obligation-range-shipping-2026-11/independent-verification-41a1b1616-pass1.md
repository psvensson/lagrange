---
audience: evidence
recorded: 2026-11-14
quest: cdc-obligation-range-shipping
---

(Typographic dashes in this report were replaced by ASCII hyphens for the documentation audit; nothing else was changed.)

VERDICT: REJECT - 41a1b1616d4c6d69f4bc95081104deb8f582a654, node-ready hook excluded (first pass of the corrective round)

(Report of the independent verifier, saved by the lead from the verifier's hand-back because the verifier's harness refuses to write report files. Text unchanged.)

Reading found no safety defect and your items 1-6 are closed, but three findings block.

**Blocking**
1. W6b survives (range.js:178-181, 222): the retained bound judged per row inside an entry that is not first in its range. The S-10 witness has the entry first. Claim (iii) and S-10; repeat of the sibling-regression root.
2. An entry is indivisible and its bytes have no owner bound (range.js:187-200, S-2). The base shipped it ordinal by ordinal; the candidate holds it forever once one vector cannot commit in a recipient's 1500 ms attempt or exceeds the 100 MiB frame. Threshold unmeasured. Claim (iv); repeat of A6/M-12, predating this delta; my first pass missed it. Close by record (measured ceiling) or code.
3. S-5 is false in "only": the tail is also re-captured at a contended page yield without provisional rows (delivery.js:497). W9, which removes that, survives 34 files. Inherited; record and witness it, or route it to the slot unit.

**S-10 worst case**
- Ordinals per entry: 1 for a statement; at most 256 for a staged transaction (participant-transaction-staging.js:284); apply enforces only 4096 (owed-admission.js:61).
- Rows: the bound is passed by at most 255 (4095), so pending plus retained reaches 1279 (5119). The exempt head row now carries its whole entry, which S-10 does not say.
- Wave: one entry is one vector, 1× (16×) the count bound; above 768 rows the suffix re-ships after a refused acknowledgement.
- Bytes: unbounded; events carry full row images (partition-sql-parser.js:249). 256 rows of 1 KiB equal SHIP_MAX_BYTES; 256 W9 rows are 512 MiB.

**Mutants** (eight lane files; controls ef419420, c5bb6f34, 46cc4de8 green)

| Mutant | Job | Result |
|---|---|---|
| W1 = V7 | 1a78423c | killed, ship-window 34 |
| W2 = V8 | acd438d2 | killed, ship-window 28 |
| W3 = V10 | 43253820 | killed, range-shipping 20 |
| W4 bound per row again | 5691f9e9 | killed, range-shipping 21 |
| W5 cut after the entry | abcc8758 | killed, range-shipping 15 |
| W6 first entry sent as a prefix | 8e2a0dc4 | killed, range-shipping 21 |
| W7 tail re-captured after a hold | f41cd81b | killed, ship-window 29 |
| W8 idle handshake keeps the scan | 824ab3f6 | killed, ship-window 30 |
| W6b | f052d649 | survived |
| W9 | ddab25f3, ad1be298 | survived |

**Other checks**
- M-7 witness is real: router, native recipient and its cache merge, raw ledger rows. Ceiling: order hand-delivered, one key, no DELETE.
- Registry correct; no bound, delay, timeout or baseline value changed.
- d71ddfc9 matches commit and tree; the writer's 18 corrective records match their evidence.

**Second pass on the hook** (what it must cover)
- The preview changes nothing observable in the cache; `applySystemTableChange` unedited.
- Previous rows and trigger decisions equal one-event delivery under tombstones, absence marks and the authoritative fence, also for a re-presented vector.
- Mutants that drop each copied state field in turn.
- Registry and seal for the new cache module.

Notes: job evidence under `/mnt/data/peter/projects/lagrange-foundation-coordination-20261114/range-shipping/verify2-*`; mutant commits are branches `v2mut/W1`..`v2mut/W9` and `v2mut/W6b` in the verifier's scratch clone (`…/scratchpad/verify-range/clone`). One duplicate W6b queue entry for adam-laptop (cc4bac53) was cancelled before submit; its directory holds intent files only and is not a run. The candidate was read from git objects because the worktree had moved past it.
