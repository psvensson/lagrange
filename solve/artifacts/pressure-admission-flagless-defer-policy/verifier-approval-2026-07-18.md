# Independent adversarial verification — 2026-07-18T16:59Z

Verifier: independent general-purpose subagent (session task, adversarial
charter: refute if possible). Scope: full working tree of the flagless
pressure-admission cutover (all seven quest slices) + DDL default-literal fix.

## VERDICT: APPROVE (no refutations)

- All five requested suites pass (pressure-governor 69/69 at verification
  time, gateway 245/245, authoritative-view 61/61, table-creation 102/102,
  guard scenario 5/5 files green).
- No allowPressureDegrade/allowPressureDefer consultation influences behavior
  anywhere in src/; DEGRADE is unproducible; reserve semantics and the
  bootstrap-critical bypass intact; pacing hint bounded [10..250]ms and
  monotone in saturation depth; admission queue bounds/deadlines/priority
  verified; poll timer cannot leak on empty queue.
- Both gateway entry points route through one flagless builder; all admit
  paths correctly awaited; zero callers of the old contract names remain.
- Consumer behavior flips reviewed: publication parking (intentional,
  class-derived), coordinator brake (old effective behavior preserved), logs
  defer window (preserved in effect).
- Schema default literal round-trip verified against all three re-emitters
  and CDC materialization.
- Live clause: report 16-43-20 shows schemaAdmission.admitted=true,
  state=quiescent, formation within budget; terminal learned-affinity stall
  matches pre-existing clean-HEAD signatures (11-02-34, 11-19-30).

## Findings (none refuting)
1. Info/process: tree changed under verification (DDL fix commit 0e21d387).
2. Low/robustness: drain ran unguarded inside the poll timer (a throwing
   sensor would crash / strand waiters). FIXED post-verification: try/finally
   re-arm + per-waiter catch resolving by deadline; guard test added
   ("admission poll survives a throwing pressure sensor").
3. Low/shutdown: no production dispose() caller; bounded <=2s delay. Accepted.
4. Info/semantics: priority ordering is same-tick pacing, not capacity
   arbitration. Documented behavior.
5. Low/dead-code: shouldMetadataPublicationAllowPressureDefer uncalled in
   src; stale flag options in some tests. Deferred to the flag-surface tail.
6. Low/edge: CDC default materialization leaves doubled quotes unescaped for
   quote-containing string defaults (none exist today). Deferred.
7. Info: live-clause approval rests on recorded paired-baseline evidence.
