---
audience: development
documentClass: evidence
---

# Independent MG witness lab review, R1, 2026-10-23

Reviewer: `subagent:/root/retained_effects_review`.
Executed source: `21cfd917d8ceb2f0c1435cade117c0c44a91a03a`.
Original job: GitHub #986 / `390cb11c86fc49ed9465e13f1439f1d5`.

## Verdict and finite findings

**The run is FAIL. Canonical-outcome component semantic reds are established;
the intended RF1 native receipt and RF3 custody-loss reds are not reached.**
Both native cases successfully establish the real S1 source precondition,
then stop at a settled subscriber hold before recipient ingress. Treat that
as a prerequisite/observability finding for the native witnesses. It must
not be renamed native acceptance or lost-custody proof.

1. **Native witness engagement remains incomplete.** RF1 fails its propagation
   return precondition, and RF3 fails its retained-recipient-proposal
   precondition. The actual subscriber refusal cause is not included in the
   diagnostic vector. The next native attempt must expose the existing
   selection/readiness/bridge refusal, retain its typed outcome and source
   debt, and demonstrate actual ingress before measuring the named native
   assertions. No evidence here justifies an admission override, fabricated
   receipt, relaxed assertion or larger budget.
2. **Complete worker-log retrieval is not complete child-TAP output.** The
   entire original worker stream is recovered and hash-verified, but the
   repository runner itself elided 1098 bytes from the component test's TAP
   detail. The final component census and all native diagnostics remain
   present. One component failure header (#69) is not available in this
   worker log, so its individual vector is not independently reconstituted
   from source and presented as measured output.

These are the complete material findings from this bounded evidence review.
No test/source repair, production approval or runtime workload was performed
by this reviewer.

## Source, request and full-log custody

The nine-file manifest SHA256 is
`000a5358d8cb766bd01e7052eaf7e4948b5f2fac1759af7d9e0a19dcd77b72f7`.
Every entry independently matches its committed blob at the executed source.
The independent test-source review SHA256 is
`bce9aa436961a65d0df51c2ab0eb523c0a0c733b625f43dccd36adc433722eef`.
Production at that source has an empty diff from `c11c4ca`; this was a
test-only measured red attempt, not execution of an MG production repair.

I matched the original GitHub issue body and its sole payload comment exactly
to `/tmp/mg-delivery-witness-r1-runtime-request.json`. Envelope SHA256 is
`0a4ee54eacae842a987556eb39ce461f23c69d6c032e9260979643e5d779ca54`;
the single 1063-byte decoded payload has SHA256
`033e960ce9e8241943b3231d5e8f3193994fb959319b0df41763ada427790e72`.
Its exact source and ordered selection match the two requested files:
`test/cdc/cdc-delivery-outcome.test.js` and
`test/message-group/message-group-native-custody-handoff.test.js`.

[Terminal #986](https://github.com/psvensson/lagrange-lab/issues/986#issuecomment-6360920377)
at `2026-10-23T08:36:14.210Z` explicitly reports FAIL/exit 1 on
`lenovo-laptop`, matching source/payload identities and one worker. Source
execution began; both outer scope fields and worker execution/container/
thermal scopes closed. Worker reason is null, not THERMAL_ABORT. Last CPU
was 61 C and SSD unavailable. The generic driver counters describe the
last native file (2 tests); they do not replace the complete runner census.

The complete original worker log is **194657 bytes**, SHA256
`a6f4d11b800a2edb3cc56dca1c38916fe011011e0f93fff847657cd70a7ec8de`.
The controller's 8209-byte combined tail is a separate artifact. I recovered
25 contiguous slices, offsets 0 through 194657, on pinned stream
`2a89df77fb29cb628fe7343ca7ba10b60e17ab598b3951517679daec69a7182b`.
For every accepted slice I verified request identity/envelope hash,
offset/next-offset/returned length, text versus decoded bytes, raw/chunk
hash, original size/hash, stream/job/host and read-only/no-source-execution
flags. Final EOF is true; every slice reports no truncation. Concatenation
equals the terminal worker original/output hash exactly.

Initial read-only evidence requests are #989 and #990 through #1013. Queries
#998 (offset 16000) and #1005 (offset 72000) returned
`COMMAND_FAILED:ssh:255`, `UNAVAILABLE`, without source execution. Those
failed receipts are preserved; successful #1017 and #1018 recover the same
offsets from the same original stream. No source execution was resubmitted.
All request identities, receipt URLs, offsets and hashes are retained in
`/tmp/mg-delivery-witness-r1-runtime-log-custody.json`, with full per-query
receipt files and request packets alongside it. The complete worker bytes
are `/tmp/mg-delivery-witness-r1-runtime-worker.log`.

## Measured census and component reds

Worker log lines 33 and 3039 identify the two planned/completed files and
the final runner census: **2 files, 0 passing, 2 failing, 134 runner-reported
assertions**. The per-file results are:

| File | Reported tests/assertions | Pass | Fail |
| --- | ---: | ---: | ---: |
| Canonical CDC outcome component | 132 | 22 | 110 |
| Native handoff | 2 | 0 | 2 |

There are no skipped, cancelled or todo child tests in the final TAP
summaries. These counts are not 134 successful assertions.

The component first passes its canonical local acceptance, vector uniqueness
and receipt identity/position controls. It then accepts an answer carrying
`error: "recipient-failed"` as committed, contrary to the asserted false
result at `cdc-delivery-outcome.test.js:128`. Zero-target composition also
discards that contradiction at `:134`. Both are concrete measured semantic
failures, not missing imports or an unengaged harness.

Visible failing headers cover 41 local contradictory-wrapper vectors,
40 zero-target contradiction vectors, 17 wrong-type successful-wrapper
metadata vectors, the mixed provisional/committed answer, and 10 unsupported
source-position inputs. The intact summary reports 110 failures, while 109
named failing headers are present. At worker line 1533 the runner explicitly
elides 1098 bytes and names
`.tap/test-results/test/cdc/cdc-delivery-outcome.test.js.tap`; this includes
the missing #69 header. Retrieval did not cause that elision. The 22 visible
passing controls cover the initial 13 identity/receipt checks, four typed
successful wrappers, four ordinary/transport-only refusals and source-vector
identity. Builder-produced component receipts are inputs to validators;
they are never native application or source-ACK evidence.

## Native S1 succeeds; recipient engagement does not

The complete native section is present without runner elision. TAP diagnostic
strings escape backslashes; I reversibly decoded that diagnostic quoting
without changing the original bytes. Decoded vectors are retained separately
at `/tmp/mg-delivery-witness-r1-runtime-decoded-diagnostics.json`.

For **both** native cases, `setup-real-release-complete` records actual
`cut_over`, a native leader and three voters (worker lines 3001 and 3028).
`setup-ordinary-query-and-durable-debt` follows at lines 3002 and 3029.
Ordinary `executeQuery` succeeds at term 1/index 5 for, respectively,
`native-cdc-rf1-write` and `native-cdc-custody-write`. Each of the three source
replicas has the expected SQL row, a settled/APPLIED outcome, exactly one
identical owed CDC event and commit/applied frontiers covering index 5.
I independently decoded the retained native QUERY entry for every source
observation: entry identity/term/index agree with the debt and outcome, and
command timestamp, event timestamp and event-data `updated_at_hlc` agree.
This is actual source admission/application evidence; no direct-apply or
forged opening premise is substituted.

RF1 fails at `message-group-native-custody-handoff.test.js:261`:
`the real subscriber/seed/topology call returned its own result`. There is no
`actual-propagation-return` event. The later assertion
`RF1_ACCEPTANCE_REQUIRES_NATIVE_AFTER_COMMIT` at `:168` is not executed.
The diagnostic stage name `rf1-actual-propagation-return` at worker line
3003 is just the test's report label; it does not establish that a return
occurred. The recipient has only its native no-op at index 1, commit/applied
1, and no application row.

RF3 fails earlier than its planned loss schedule at `:291`:
`exact actual recipient proposal is retained`, actual 0 versus expected 1.
The cut at worker line 3030 shows all three recipient frontiers at 1, no
recipient rows and no held APPEND envelopes. It never reaches recipient
leader loss, suffix replacement, source redrive or
`SOURCE_CUSTODY_RELEASED_BEFORE_RECIPIENT_COMMIT`. No native lost-append or
false source ACK is demonstrated by this attempt.

Both cuts record exactly the producer event entering its real subscriber.
Their source lanes have `inFlight: false`, zero pending acknowledgments,
retry armed and lastDrive `held_by_subscriber`, reason
`subscription_handshake`, delivered 0. RF3's explicit ACK flush is EMPTY.
Source debt remains owed. This is a settled subscriber hold, not a merely
unfinished joined drive. The selected subscriber owner runs its
selection/readiness checks after `beforePropagation`; a later bridge throw
can also reach the same source hold. The vector does not preserve the caught
cause, so it cannot choose between those actual refusal boundaries. Expose
that owner result before attributing the native red to the intended delivery
implementation, and preserve all existing source/recipient guards.

## Cleanup, category coverage and remaining proof

Neither native test reports a cleanup-hook failure. The terminal scopes are
closed, and [post-fleet #1020](https://github.com/psvensson/lagrange-lab/issues/1020#issuecomment-6361127766)
independently observes the physical lock free. Its request is
`ba4d4f281cf94db0a48ffe064a316105`, envelope SHA256
`bcd1071a1cda7479af5f896a9710cfd59ac5e7bfcf20d301e449f426bedf1675`.
I recomputed fleet SHA256
`057bed479eb4f490e0e16b8f0b3ed3d6e5fdc9b03f89a0c850401ff5b488225f`.
The host probe ran `08:48:27.716Z` through `08:48:28.187Z`, with unchanged
boot identity `18581133-d0d9-4dec-a3f8-266562235699`, no probe error and
CPU 49 C/SSD unavailable. All six physical locks are free at that observation.
The post-fleet request and complete receipt are preserved under the same
`/tmp/mg-delivery-witness-r1-runtime-post-fleet*` prefix.

| Review category | Evidence disposition |
| --- | --- |
| Admission/gating | S1 measured through genuine CUT_OVER and ordinary replicated QUERY; no original-startup release claim. |
| Harness fidelity | Native intended predicates remain unengaged; exact earlier boundaries and component TAP elision recorded. |
| Transport/delivery | Canonical component failures measured; no recipient native receipt, wire-pressure or lost-answer proof. |
| Recovery/replay | RF3 native-loss/redrive schedule is not reached. |
| Concurrency/retry | Settled held source lane measured; retry/cross-invocation fairness and cleanup-tenure cases unproved. |
| Formation circularity | No S2/W7 provisional-scan composition evidence. |
| Owner interaction | Source SQL/outcome/debt correspondence measured; subscriber-to-recipient result gap still needs an observed cause. |
| Hostile contract input | Plain component contradictions measured; no general accessor/prototype hardening certification. |
| Cleanup | Terminal scopes, lack of cleanup-hook failures and independent physical lock release retained. |

This review changes only this new evidence file. It runs no local runtime,
submits no source workload and modifies no production/test/metadata. The
canonical component red supports its specified owner correction; it does
not satisfy the native witness gate or approve an implementation. W1-W9
beyond the measured subset, complete source/target native acceptance,
source ACK application, loss/retry/pressure and process-loss controls remain.
Historical delivered-row classification, original complete-cohort opening,
protected activation, durable transfer, composed two-start, full Quest and
merge/publication gates are unchanged. Parent preserves the complete original
artifacts and failed retrieval receipts; no successful or failed attempt is
discarded.

Line-reference correction: the final runner census cited above is worker log
line **3041**. Line 3039 is the native child's duration record. The reported
file/assertion totals are unchanged.
