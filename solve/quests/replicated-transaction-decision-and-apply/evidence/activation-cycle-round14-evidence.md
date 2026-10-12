# Activation cycle round 14 evidence

## Scope and exact inputs

This is a design-only AC13-1/2/3 correction. Product source remains frozen at
unapproved `14fac7d6`; the production pgwire oracle remains RED.

- Immutable predecessor:
  `design-participant-release-activation-authority-cycle-round14-predecessor-247b5be1.md`,
  SHA-256
  `247b5be1e6f60960ca087521c2e250636d654700c636ff15fc3c092b39518f67`.
- Independent report:
  `review-activation-cycle-design-round3-independent.md`, SHA-256
  `035cd6c092c3bca6dec2800aa9fbaa09df8357ba9f766cbe415445568cb2a34f`.
- Reviewer manifest SHA-256:
  `28616a8650e27f79229b03a9d19df689ce79be7f70e4f7a922a888b6edb09190`.

Exact pre-submit candidate custody, established-history supersession,
history-qualified old-target retirement and all accepted round-ten/R7-2
clauses remain unchanged.

## One corrected owner handoff

| Finding | Correction | Existing owner path | Explicit refusal |
| --- | --- | --- | --- |
| AC13-1 | Genuine first CLAIM initializes history from already accepted physical birth/root facts while participant origin is null. First dependent PAUSE or supersession atomically binds an actually pristine unbound dependent. ENABLE records participant origin later. | Startup file/CREATE operation root → registered participant-release handler → existing control/dependent singleton apply → existing ENABLE origin owner. | Null origin/history without exact birth/root authorization and pristine fields, legacy missing history, corrupt residue and foreign history remain HOLD/MISMATCH. |
| AC13-2 | Current control leader provides `CLAIMED_CURRENT`, `CLAIM_NOT_SELECTED` or history-scoped `CLAIM_TERMINALLY_EXCLUDED` for the root's exact retained candidate. The latter means future effect is impossible, never that the old CLAIM returned STALE. | Existing operation-bound participant-release INSPECT/read interaction and current control row; root later persists result through its existing file or CREATE-ledger CAS. | Missing/different history, insufficient high-water, unapplied boundary or malformed candidate remains HOLD/INVALID. Control never waits for an unavailable local root store. |
| AC13-3 | Durable accepted nonterminal root owns successor entitlement after a definitive retryable terminal attempt. Unknown commands keep the same identity. Recovery time only bounds execution. | Existing root command/operation revision CAS increments `claimAttemptGeneration`, atomically retaining prior proof and successor candidate. | Hard invalid/history/authority/lifecycle conflict, observed foreign effect, cancellation/completion, active control slot or unknown prior command forbids successor capture. |

The original seed/operator/CREATE deadline remains byte-identical and may be
expired. `recoveryTurnDeadlineAtMs` is an execution envelope bound, not command
authority. The successor request explicitly carries retained-root recovery
mode and the terminal proof. Replicated apply reads no wall clock.

## Deterministic model

Command:

```sh
node solve/quests/replicated-transaction-decision-and-apply/evidence/activation-cycle-round14-feasibility.mjs \
  > solve/quests/replicated-transaction-decision-and-apply/evidence/activation-cycle-round14-feasibility-result.json
```

The model reports 13/13 observations:

1. fresh origin-null CLAIM, PAUSE and later origin;
2. established restart reuses history/origin;
3. fresh supersession binds history and makes delayed PAUSE inert;
4. corrupt unbound dependent holds;
5. foreign dependent history holds;
6. lost A receipt after B/C gets terminal exclusion;
7. current A gets direct exact receipt;
8. unavailable root store retains candidate without blocking control;
9. later store availability persists exact disposition;
10. expired unknown candidate never remints;
11. expired admitted root after terminal exclusion gets one generation
    successor with unchanged original deadline;
12. hard conflict gets no successor; and
13. same ordinal in foreign control history holds.

The model supplies its facts and imports no product Raft, SQLite, gateway,
request or apply function. It demonstrates internal contract feasibility only.

## Actual seam ceiling and future proof

The reviewer established current source facts: fresh participant origin is
null; actual first control release PAUSE/drain precedes ENABLE/origin; pending
responses are volatile; control storage has one current row; seed roots are
file-backed; CREATE roots update the authoritative operation ledger through
the gateway; and recovery already has one bounded wake/singleflight owner.

This amendment does not claim those owners implement the new command shapes.
Future source review must exercise:

- genuine fresh control and dependent binding through real committed apply;
- corrupt/foreign refusal without reset;
- lost root result, same-root closure, B/C reuse and later terminal exclusion;
- unavailable CREATE/root storage followed by canonical wake and CAS;
- expired unknown versus retryable terminal successor versus hard conflict;
- authentic snapshot/history/origin preservation;
- exact resource and impact registrations; and
- the unchanged production pgwire oracle on one immutable source snapshot.

No second ledger, coordinator, scheduler, readiness barrier, raw SQL/Raft
bypass, force-open path, participant cap, deadline reset or unbounded per-cycle
history is introduced.
