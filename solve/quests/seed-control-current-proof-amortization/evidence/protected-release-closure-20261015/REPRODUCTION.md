# Exact trace identity and interpretation

Final trace SHA256:
`fbdc32f2b3b0c7d8dc7e7022116ba384b6ecbb43d6ce04f7b2d8b586b997d561`.
Executable archive path `raw/closure-traces.mjs`; Git exact text mirror
`raw/closure-traces.mjs.txt`. Node v22.23.2 on the local review host.

```
node closure-traces.mjs
node closure-traces.mjs --split-exchange
node closure-traces.mjs --timeout-frees-custody
```

| Execution | Whole execution result |
| --- | --- |
| Final positive | Exit 0, all 14 new scenarios PASS |
| Split exchange mutant, same trace bytes | Exit 1, NO_HOLD_RESULT_CAPACITY instead of HELD |
| Timeout frees custody mutant, same trace bytes | Exit 1, maintenance custody 0 instead of 1 |

The negative assertions occur before any dependent method could fail on a
missing ticket. They are intentional semantic mutation results, not missing
symbols, runner failures or native protocol REDs. Positive and negative raw
stdout/stderr and commands/exits are preserved. Independent execution and
content-bound review are in `raw/independent-snapshot-auditor-t92c0x43` and `reviews`.

New scenarios: saturated H while OPEN; retained split-protocol starvation;
closure before opening custody; closure waiting behind unknown opening;
real ordered state change causing expected-state refusal; already HELD;
timeout/late commit/demotion; local+forwarded exact join and lost-response replay;
supplied authoritative discard; atomic write failure; refusal then valid NEW
intent; close/external-settlement-premise/reopen with saturated A;
pin dependency; H pending-entitlement exchange (2+1).

Limits: this is an explicitly driven ordering projection. It implements no
native Raft runtime, bounded service scheduler, transport, crash recovery,
SQLite transaction, production codec, D2 provenance, query-discharge proof,
snapshot install or TX1 protocol. Its externally supplied settlement event is
an assumption, **not native ROLLBACK or COMMIT coverage**. It invents no
replicated staging. Reconciliation retains an in-memory projection and consumes
assumed discard input; that is not proof that native recovery can discover it.
Stage advancement is imposed by each finite schedule, not established under
continuous ingress. H refusal uses exact expected-state mismatch. APPROVE's
external predicates remain a symbolic boolean. Synthetic SHA/array identity,
small integer counters and simplified receipt/winner representation do not
certify the full canonical grammar, u64 ranges, origin validation or maximum
encoding. All constructor-generated HOLDs use a true placeholder flag, but the generic
decision function and reduced validator would accept a raw false flag. This
is another reason the trace is not a production input validator or HOLD oracle;
the selected contract has no such local authorization predicate.
Physical duplicate occurrences, follower backlog and retirement
receipt-consistency fault cases require the native plan; this file does not
claim new coverage for them.

The split mutant exposes an artificial interleaving and fills H directly to
make the exposed interval fail. The separate split-protocol scenario uses
ordinary admitted/applied refusals to reproduce saturation over three cycles.
Neither execution claims an infinite scheduler proof. The contract supplies
the conditional accepted-custody progress argument and its environmental limits.

Draft history is retained:

* Draft 1 passed its selected schedules but modeled HOLD refusal using an
  unspecified authorization boolean. Independent source review found that the
  actual authorization WeakMap is producer-local. The contract and trace now
  separate it from deterministic HOLD application. Draft 1 bytes/logs remain.
* Draft 2 corrected that issue. Self-review then replaced its artificial
  already-HELD setup (historical position 7 with applied position 0) with an
  actual preceding HOLD application. Draft 2 bytes/logs remain.
* The independent verifier's source guard observed that announced draft change
  before Node execution. Its preserved preflight identity failure is not a
  semantic RED or a failed native run.

No retries until green of unchanged bytes occurred. Executions after corrections
have separate trace hashes. No accepted predecessor investigation was rerun.
The original 14 scenarios, 729 action strings and mutation evidence at 0c981c7
remain byte-identical; `raw/prior-preservation.json` verifies that identity.

Prior locked native persistence/Ready and local-PAUSE ROLLBACK results remain
historical baseline evidence only. The new first increment needs actual
same-trace native REDs named in the plan. There is no production implementation
or native compound-command pass in this checkpoint.
