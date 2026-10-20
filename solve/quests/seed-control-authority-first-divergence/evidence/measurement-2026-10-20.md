# Original-entry release discriminator: measured first divergence

Status: engaged diagnostic evidence; startup remains RED; historical nested
control refusal remains unresolved. No production source changes or repair.

## Exact execution and artifact

Diagnostic commit: `c8638eb93dc37ecf7c2c167f0176fe4756ee32b2`.
Product source is identical to `be25caa5f0c3612feec662d4feaa9ba28f8f34df`.
The independently reviewed observer hashes are:

- helper: `a70858327e82f99001fd7be7147edc0c0b43bad41fbe8d79340bb59aa2457b25`
- single-path test: `a44811d5045ed3ba717d3697bd7dfa45ccaeefa180c46948ad0678dc1547b575`

The existing classified runner placed the exact commit on locked adam-laptop,
with retries disabled. It held for thermal headroom then measured at 40C.
Existing assertions, source and the 3000ms seed budget were unchanged.
`diagnostic-v2-lab.txt` and `diagnostic-v2-results.ndjson` preserve the first
execution at these bytes: file FAIL, five assertions, two pass/three fail.
The other two failed cases retain separate write/restart admission obligations.

The full original JSON trace is stored by Solver, upload verified by re-download:
[diagnostic-v2-trace.json](https://github.com/psvensson/lagrange/releases/download/solve-evidence/seed-control-authority-first-divergence--diagnostic-v2-trace.json)

- SHA256: `dc8240b36bb7114577a0011c567c51f46bc29520fef978421e71c9607c2fce64`
- bytes: 4,082,257
- matched/recorded/completed release-protocol deliveries: 1,551 each
- drops, capture errors, incomplete records, request-cohort truncation: zero

The producer descriptor was checked against the retrieved bytes before deleting
only its unique `/tmp/lagrange-control-trace-ddgcc4` directory. Solver retains
hash, size and URL in the append-only log. The tracked selected-records JSON
contains eighteen explicitly selected, unmodified records and full-artifact
identity; it is not a substitute for the complete trace.

This supersedes only the exporter description in causal-trace-v2.md: the revised
exporter writes full JSON after bootstrap settles and emits a path/hash/size
receipt. The original compressed-export attempt failed, remains preserved, and
supplies no interpretable nested evidence. No retrospective cause is assigned
to that export failure.

## Observed release attempt and first refusal

The release trace contains 126 RELEASE calls: all 84 SQL_TRANSACTIONS calls
return CUT_OVER; 41 dependent calls return CUT_OVER; one dependent call refuses.
Seed completes 42 of 46 cohorts. Its terminal projection names
sql_write_operations-p1, ordinal43, phase enable, missingFact release_deadline,
elapsed3003ms against budget3000ms. There is no current_control_owner_fact
answer in this measured trace.

All times in the following table are recorded wall-clock milliseconds;
D is the actual supplied deadline, `1792513775716`.
Call ordinals include other router traffic, hence are not trace-array indexes.

| Original action | Call ordinal | Start relative to D | Settle relative to D | Answer |
| --- | ---: | ---: | ---: | --- |
| sql_write_operations RELEASE | 19483 | -21ms | +3ms | release_fact_unavailable / release_deadline / enable |
| nested sql_transactions RELEASE | 19484 | -20ms | -4ms | CUT_OVER |
| dependent three-member INSPECT | 19494-19496 | -3ms | -1ms | all OBSERVED |
| dependent three-member PAUSE | 19497-19499 | -1ms | +3ms | all OBSERVED |
| dependent ENABLE | no delivery | — | — | refused before transport |

The last control INSPECT records19485-19487 retain origin index2/term1,
queryState clear, queryEnforcement enforced. The current control owner completed
its own PAUSE/RESUME proof before the dependent operation progressed. The last
dependent PAUSE records show no origin, no pending/prepared/proposal work and
applied/commit/last index1. These are bounded observed facts, not a disk snapshot
or a claim that request expiry cancelled any committed work.

Source correspondence at the unchanged product bytes:

1. `src/bootstrap/bootstrap-service-seed-workflow.js:278-349` orders control first,
   selects one intent per partition and shares the original deadline.
2. `src/node/replica-handler-participant-cutover.js:151-180,269-298` obtains a
   fresh control proof before closing and reading the dependent cohort.
3. The same owner `:324` enters enableAndObserveCohort; `:70-75` requests ENABLE.
4. `src/node/participant-release-client.js:36-49,77-79` computes remaining time.
   `:112-114` returns RELEASE_DEADLINE when exhausted, before deliver at `:117`.
5. The observed all-PAUSE completion after D, phase-enable refusal and absence
   of ENABLE from a complete trace identify that pre-dispatch guard for this
   attempt. No extra protocol action or state read was needed to discriminate it.

The local control/readiness cycle hypothesis does not explain this execution:
control is repeatedly available through the actual route. This does not prove
remote availability, all restart schedules, bounded recovery progress, or the
cause of the historical control wrapper. Observer capture adds synchronous work
and settlement callbacks, so elapsed time is instrumented evidence, not an
uninstrumented performance benchmark. The projection omits the full returned
census, connection.servedLegacy, topology and some admission fields. Owner
success answers plus source correspondence establish the executed path; the
projection cannot independently recompute every release invariant.

## Authority and remaining obligation

Trigger: actual seed checkpoint. Authoritative facts: current hosted leader,
measured build, current membership/generation, control origin/enforcement and
fresh control proof. Permitted effect: PAUSE current dependent members, then
request origin ENABLE only within the existing deadline and authority checks.
Durable commit: none is demonstrated for the failed dependent ENABLE; no such
request was delivered. Earlier successful cohorts retain their own committed
origins under the existing application transaction owner (causal-trace-v2.md).

Lost response/restart: retry must reconstruct current facts. The recovery owner
requires existing origin and measured build before automatic entry. This
partial fresh-seed failure does not establish those prerequisites for the failed
cohort. Remaining obligation: preserve closed admission and physical custody,
then demonstrate authorized recovery/progress through existing owners. The
release owner governs reopening; physical runtime/storage owners govern cleanup.
Request timeout supplies no cancellation or cleanup proof.

## Independent interpretation and controls

`subagent:/root/control_source_review` independently parsed the full artifact,
verified its identity/counts and source correspondence, and approved this
diagnostic interpretation and actual-entry engagement. The reviewer explicitly
withheld whole-Quest completion because the historical nested refusal remains
unresolved. No production repair approval was given.

The exact diagnostic commit was then measured once on locked adam-laptop for
`test/partition/participant-release-protocol.test.js`: all 14 assertions passed,
4480ms, retries disabled. The runner waited for thermal headroom and measured at
41C. See diagnostic-v2-controls-lab.txt and diagnostic-v2-controls-results.ndjson.
These engage release/recreation, absent-control refusal, schema mutation
refusal and post-ENABLE control loss. They support the release-control boundary,
but are not a targeted controlled-negative test of pre-dispatch ENABLE expiry.

## Next bounded work and proof ceilings

The next progress witness should use the existing release/seed/recovery owners:
retain successful origins, stop at the actual pre-ENABLE deadline boundary and
re-enter only with the appropriate current fresh-storage/operator authority.
Assert safe refusal when that authority is absent and subsequent authorized
progress without reopening on stale proof. Review the contract and witness
independently before any source repair. No budget increase, cached permission,
new bootstrap owner, or broad redesign follows from this measurement.

The historical selected-control refusal still needs its actual nested or
pre-dispatch discriminator. It must not be retroactively attributed to this
ENABLE result. Package B source findings and its pre-capture successor witness
remain separately bounded in physical-custody-review.md.

Quest remains OPEN and its receipts remain false pending complete evidence and
review. Static validation is not clean: changed-file ESLint passed at the
reviewed diagnostic bytes; full lint/complexity were red, including new
diagnostic complexity debt. No baseline changed. No Solver landing, publisher,
main move, composed corpus, cross-host recovery or release certification ran.
