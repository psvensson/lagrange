# terminal-write-refusal-retry-ownership — decisions

## Prior art

- **The repair module reuse IS the prior art.**
  `src/rebalancer/operation-workflow-terminal-transition-repair.js` was built
  (quest formation-voter-surplus-promotion-deferral-livelock, run-21 ghost)
  for exactly this class of failure: a terminal projection the ledger never
  reflects is an immortal non-terminal row no level-triggered path re-drives.
  It already carries the 0.5s→30s capped-backoff timer, single-flight attempt
  lane, first-terminal-wins adoption (TERMINAL_ADOPTED stand-down, audit
  finding 6), and the refused-persist discriminator
  (`resolveRefusedTerminalTransitionRepairPersist`). This quest arms it from
  the refused-persist seam instead of minting any new mechanism or timer; the
  only additions are one cause enum member (`PERSIST_NOT_COMMITTED`) and one
  typed log-message constant.
- **cl-029's recorded retry-owner class.** The CL-029 invariant
  ("target-completion evidence must retain a retry owner until applied to the
  durable workflow row", test
  `test/rebalancer/cl-029-target-completion-evidence-retry-owner.test.js`)
  established that armed retry state is owned evidence, cleared only by
  application or explicit supersession. Moving
  `clearTerminalOperationRetryState` out of the completeOperation/failOperation
  entry and into the proven-terminal arms extends that class to
  terminalization itself: clearing is a consequence of a proven terminal,
  never a precondition of attempting one.
- **Release-gate taxonomy (audit findings 3+11).**
  `operation-workflow-terminal-reservation-release.js` already encoded
  "proven terminal" (committed / TERMINAL_ADOPTED / IDEMPOTENT_REPLAY) vs
  "unresolved divergence" (REFUSED / REINSERTED / null). The truthful drain
  progress predicate (`isTerminalTransitionOutcomeSettled`) reuses that owner
  rather than re-deriving the disposition taxonomy in the drain.

## Decisions

1. **Seam 1 (transition-persistence).** `clearTerminalOperationRetryState`
   moved from the first statement of completeOperation/failOperation into (a)
   the committed arm and (b) the release-gated not-committed arm
   (TERMINAL_ADOPTED / IDEMPOTENT_REPLAY — those keep today's end state
   exactly: lanes cleared, reservation released, no repair, no warn). The
   REFUSED / REINSERTED / null arm keeps every retry lane, emits ONE typed
   warn (`TERMINAL_TRANSITION_PERSIST_NOT_COMMITTED`, payload operationId /
   disposition / step / partitionId), and arms the existing repair with the
   retained terminal projection. Both arms share one owner-private resolver
   (`resolveNotCommittedTerminalTransition`) so the decision is a single
   canonical outcome, not a branch pile.
2. **Null disposition arms the repair (sealed statement).** The
   `{committed:false, disposition:null}` outcome covers the idempotent local
   replay (the workflow coordinator already recorded this terminal committed)
   and boolean-shaped persist refusals. Arming the repair there is at worst a
   one-attempt no-op (the attempt confirms visibility and stands down) and at
   best the missing rescue for a committed-mark whose durable write never
   became visible.
3. **Early already-terminal return.** completeOperation/failOperation now
   return a typed outcome everywhere; the early dedup return reports the
   frozen `{committed:false, disposition:IDEMPOTENT_REPLAY}` — truthful
   because the live operation object only carries finalStep+completedAt after
   a proven terminal (committed write, locally replayed committed transition,
   or adopted durable winner), and release-gated so drain progress semantics
   match today's for an already-terminal operation.
4. **Seam 2 (recovery drain).** The three settle arms of
   `reconcilePriorityRecoveryOperationDrain` propagate
   `isTerminalTransitionOutcomeSettled(await …Operation(…))` instead of
   unconditional `true`. Caller survey (grep over `src/` + `scripts/`): every
   other completeOperation/failOperation call site awaits as a statement; no
   caller branched on the previous void return, so the new return value is
   behavior-neutral outside the drain. The coordinator facade passes the
   typed outcome through (JSDoc updated).
5. **Terminalization-refused counter → follow-up, not built now.** The
   bounded-escalation family (`operation-workflow-stopping-starvation.js`)
   owns a per-operation deferral record map keyed to STOPPING observations
   with its own clear discipline. A terminalization-refused counter would
   need a new per-operation record map, new reset semantics (what genuinely
   clears it: a settled terminal only), and a new escalation consumer — new
   state machinery. The sealed receipts require truthful progress + retry
   ownership + repair arming, all delivered; the counter is recorded here as
   follow-up: *add a bounded terminalization-refused escalation record to the
   stopping-starvation family once a consumer (visible-failure escalation or
   operator surface) is chosen; the typed warn + repair-armed log lines are
   the interim observable.*
6. **Census checker taught the helper indirection.**
   `scripts/check-operation-dispatch-completion-owner.js`'s
   `terminal_retention_cleanup` rule looked for the strong
   `clearObservedProgressRetry` DIRECTLY inside completeOperation/
   failOperation. That rule has been red on main since commit 291d1d997
   (2026-08-07) extracted `clearTerminalOperationRetryState` (the checker's
   innermost-enclosing-function resolution stopped matching) — a pre-existing
   main-red this change also repairs. The rule now passes when each required
   terminal function calls the helper AND the helper performs the strong
   delivered-create clear; both census mutation tests (missing / weakened
   cleanup) still trip, so the guardrail is not weakened.
7. **Existing test stubs updated to the typed contract.** Four terminalization
   stubs in `test/rebalancer/operation-workflow-progress-event-driven-reentry
   .test.js` returned bare `true`; under the truthful-progress contract a
   non-typed return is deliberately not-settled (fail-closed), so the stubs
   now return the typed committed outcome.

## Deferred / flagged

- Duplication ratchet prints tightening headroom for the TEST corpus
  (832→828 clone groups, 31718→31601 lines). Not tightened here: the
  measurement includes another session's in-flight files in this shared
  checkout, and this change lands without a commit; tighten on a clean tree.
- `test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js`
  (2520→2622 lines) and `test/rebalancer/cl-029-…retry-owner.test.js`
  (1608→1741) were already over the 1500-line listing threshold at HEAD; the
  enforced `audit:file-size` gate exits 0. Splitting them is out of this
  quest's sealed scope.
