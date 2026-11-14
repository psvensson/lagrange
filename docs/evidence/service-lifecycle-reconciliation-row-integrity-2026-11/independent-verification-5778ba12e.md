---
audience: evidence
recorded: 2026-11-14
quest: service-lifecycle-reconciliation-row-integrity
---

(Typographic dashes in this report were replaced by ASCII hyphens for the documentation audit; nothing else was changed.)

VERDICT: APPROVE - candidate 5778ba12ec6972a91fd3895db24d2df9ad0373a3

**Blocking findings:** none.

## Established

1. Source delta against 9a22bf79b is one file, +71/−2: one helper, used by the builder's fill and the predicate's final (equal-lifecycle) return; `scripts/` unchanged. My 65 probe cells differ from the base only in Q1 fills and the Q3 refusal (jobs 52d63371, c49cf740); F1-F10, the seed and the B1-B4 shapes are base-identical.
2. Golden: e302ed204 is base plus generator and producer only; the generator blob is identical in the candidate; job 96804049's TAP matches the fixture's `tapSha256` and its JSON equals the fixture.
3. Oracle: written in the test, never calls the product helper. It parallels it and shares three choices the record does not state: cleanup kind excluded, unresolvable authority version blocks, cached version read at the authority's column.
4. Witnesses are real end to end. Base source is red on handoff tests 13-14 and green on the seed witness (db1ece60); the candidate is green.

## Rulings

- **(1)** Accept as one extra refresh; supersede Q4's wording. Through the production handoff (H3) the first pass does not complete and keeps a retry; the second fills and completes. The base completed that input with `raft_role` null. A `cleanup_token` conflict is a second trigger (N4). No producer found that rewrites identity within one incarnation.
- **(2)** Base-identical, outside Q1's builder effect. Scope Q4 to ordinary rows and route it.
- **(3)** Unreachable behind the completeness gate (`cdc-integration-service-cache-visibility-wait.js:160`); output equals the base. State it in the record.
- **m06, m11:** equivalent on every reachable value type. Re-created and run over my cells (b6a94753, 44db5887): each differs from the candidate only where a cached `state_entered_at` is an array.

None of these changes the verdict.

## My planted defects (writer's three core files)

| Defect | Job | Result |
|---|---|---|
| P1 `updated_at` no longer excluded | 257b44b4 | killed: differential Q3 |
| P2 row-version guard `>=` | 822a9c59 | killed: all three files |
| P3 unversioned-authority clause dropped | fff028ed | survived |
| P4 lifecycle restriction `>=` | 3390447e | killed: all three files |
| P5 predicate enumerates cached keys | 51d4beb9 | killed: differential Q3, missing-role anchor |
| P6 restriction reads the cached row's own durable version | 31e02ce1 | survived |

P3 and P6 are distinguished only by inputs production cannot produce: a non-finite authoritative `updated_at`, and a cached row without the `state_entered_at` key (cells N6e, N6h; jobs 0f02038b, 8a3a5ee6). The anchor for a non-finite authoritative `updated_at` passes through the other clause (`Number(null)` is 0).

## Independent green run

b68ff63c, adams-gamla, exact candidate: 56/56 files, 2752 assertions.

## Non-blocking

- The grid varies one column per cell and uses only numbers and null as versions.
- Q1's "(resolveServiceDurableVersion)" for the cached side differs from the code (N6h); the code's reading is the one that keeps Q4.
- Checker results (complexity, file-size, duplication) not re-measured. The attempt entry records `paths: []`. Superseded receipts are marked; job ids match.

## Add to the routed list

- A cached row of an older incarnation (different `create_attempt_token` or `created_at`) with an absent role is not filled, is reported aligned, and the handoff completes with `raft_role` null, as on the base (H4a, H4b). A create retry rotates the token.
- The cleanup-kind predicate compares six columns only.
