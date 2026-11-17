---
audience: evidence
recorded: 2026-11-17
---

# HTTP probe deadline repair

## Assignment and unchanged contract

The operator authorized repair of the verified review errors and continuation
of comparative measurements. This component is a bounded direct repair under
the integration assignment in [README.md](README.md). Its author is
`core_args_runtime`; root owns integration, generated manifests, managed-lab
submission, independent review and publication.

Base: `4b0c8ec1de59e9a074afa97ce260afb2868685c5`.
Branch: `work/review-probe-deadline-fix-20261117`.
Instructions loaded before editing: rule-set revision 5, `AGENTS.md`, rules and
router, the workflow's causal-scope and transition-record requirements, code
style, harness timeout/classification guidance, operational ground truth, and
the owner-interaction/harness-fidelity verification templates.

The unchanged contract is that a finite caller timeout bounds the entire
remote HTTP probe, while native curl timeouts, SSH/process failures and caller
cancellation retain their distinct attribution. A healthy response remains
eligible for readiness. Extending the caller's deadline is not transport grace.

Exactly these source/test paths are writable for this component:

- `test/distributed/harness/real-product-remote-shell.js`
- `test/distributed/harness/__tests__/real-product-remote-shell-and-attribution.test.js`

This evidence record is also maintained by the component author. Existing
`benchmark-remote-shell-identity-campaign-attribution` impact registration
already names both files. Root owns generated test-selection metadata. No
runtime subsystem, independent cancellation service, public option, alternate
classifier, literal-checker change or increased ratchet is included.

## Cause and original evidence

Production construction is `deployLagrangeCluster` -> operation-window context
-> `nodeReady` / `readinessOf` -> `probeCallOptions` -> `httpFromHost` ->
`createSshCommandRunner`. `probeCallOptions` supplies the remaining operation
budget. The operation window forwards an inherited signal but creates no timer
for its own shorter deadline. The poll checks that deadline after awaiting the
probe. `httpFromHost` discarded `boundedSshTimeoutMs`'s caller cap and rounded
curl's duration up before adding two seconds of SSH allowance.

Managed native [job 4904](https://github.com/psvensson/lagrange-lab/issues/4904)
ran the exact base. Its retained inner log SHA256 is
`63d0d97e898e7460d4f05ecfef101bdc117be70a088aef7eaa8259bd6fa5636b`.
The frozen V2 HTTP diagnostic SHA256 is
`cc21b97b9db643bef643919d52d0b3a71ecb7eaeb67988ae2e31f4866052f022`.

| Case | Budget | Elapsed | Native/owner result |
| --- | ---: | ---: | --- |
| Healthy response | 1500 ms | 7 ms | curl exit 0; readiness admitted |
| Stalled HTTP, own deadline only | 1500 ms | 2010 ms | curl exit 28 after its 2-second allowance; deadline refusal 510 ms late |
| Stalled HTTP, independent caller abort | 1500 ms | 1504 ms | native AbortError; owner reports aborted |

Every case engaged one native child and one HTTP request and retained the
callback; fixture errors were empty. The subprocess timeout supplied by the
adapter was 4000 ms. The diagnostic's exit 0 means it reproduced the bad case
and validated the controls, not that the product met acceptance.

The earlier job 4900 failed before curl because the fixture expected an
unquoted URL. That first failure remains retained and is not product evidence.

## Repair hypothesis and allocation

Keep the existing normal allocation: 10000 ms for HTTP and 2000 ms for
transport, with a 12000 ms total when the caller supplies no shorter bound.
Use the existing `boundedSshTimeoutMs` result as the hard subprocess cap.
When that total is shorter, scale the existing HTTP and transport allowances
proportionally inside it; do not introduce another hardcoded ratio. For total
budget `B`, the HTTP allowance is `floor(B * 10000 / 12000)` milliseconds, and
transport retains the remainder. For example, 1500 ms becomes at most 1250 ms
for curl and 250 ms for transport. Larger caller budgets retain 10000/12000 ms.

Express curl's allowance as fractional seconds, without rounding upward.
The [curl option owner](https://curl.se/docs/manpage.html#-m) documents decimal
`--max-time` values. If millisecond allocation leaves no positive HTTP budget,
return the existing deadline-exhausted outcome before spawn; never emit curl
`--max-time 0`, which would remove its bound.

The existing classifier and native process-fact contract remain the owners of
attribution: curl exit 28 remains an HTTP/product timeout; an independent
caller abort remains aborted; genuine SSH/native command timeouts and exit 255
remain transport/infrastructure failures. No diagnostic projection supplies a
new semantic verdict. There is no lifecycle generation or durable obligation
change. Existing subprocess completion and timer cleanup remain owned by the
SSH runner; subsequent readiness attempts retain their existing policy.

## Acceptance and verification plan

1. Through `httpFromHost`, finite caller budgets cap both forwarded timeout
   arguments; curl's positive allowance is strictly shorter. Cover subsecond,
   ordinary and uncapped/default budgets plus the tiny-budget refusal.
2. A real native curl subprocess uses the exact generated command, with only
   the SSH/network hop replaced by an ephemeral local HTTP server. A healthy
   response remains ready. A stalled response exits 28 before the caller's
   total bound, and remains `httpTimedOut`, not an infrastructure timeout.
3. Exercise `nodeReady` with a canonical operation window, so this is a
   production owner interaction witness rather than only a timeout calculator
   check. Assert request, subprocess and callback engagement.
4. Independent caller cancellation stops the native call and retains abort
   attribution. Existing real-process timeout/clean-exit, identity and campaign
   attribution witnesses continue to reject their bad controls.
5. The new forwarding/budget regression must fail on the exact base at its
   behavioral assertion. Preserve the original known-bad receipt. Run the
   targeted classified test and affected operation/readiness witnesses only
   through the managed lab; root selects exact-candidate integration gates.

Native subprocess evidence does not claim physical SSH, full cluster formation,
GCP comparative performance, or publishable campaign admission. No new test or
acceptance result is claimed by this preparation record.

## First managed native attempt: job 4908

Managed [job 4908](https://github.com/psvensson/lagrange-lab/issues/4908)
tested the new regression against the defect baseline
`4b0c8ec1de59e9a074afa97ce260afb2868685c5`, then tested the fixed candidate
`670a6acfa41b3ebaa6a6ffe43a868ea90a055eb4`. The candidate tree
`5afb08e5e25031893bd3177ff6a8a7bbab5bc274` is identical to local commit
`1bb07bc458aa362610dbbba60366fea9b55c3daa`. Root retained the 18814-byte native
log as `takeover-http-proof-native.log`, SHA256
`622ce9a7ca05119d11fcfa58e99f6ab97f620cfbdca93565628291cfebdfb28e`.

The baseline failed three new behavioral subtests: the forwarded subprocess
budget exceeded the caller cap, a tiny budget still spawned a subprocess,
and native stalled HTTP exhausted the operation deadline before the probe
returned. Its stalled request took 2005 ms against 1500 ms, with curl exit 28,
curl allowance 2000 ms and subprocess allowance 4000 ms. The healthy control
took 7 ms; independent cancellation took 502 ms and retained SIGTERM/abort
attribution. These are known-bad baseline observations, not repaired timings.

The fixed candidate passed all four selected files: the remote-shell and
attribution suite, workload-call-site suite, campaign suite, and cluster
deployer readiness suite. The classified runner reported 109 passing
assertions. The new native assertions require stalled curl exit 28 and child
settlement before the 1500 ms operation bound, healthy readiness, and
independent caller-cancellation attribution. The retained passing summary
does not expose exact repaired elapsed times, so none are claimed here.

This attempt did not satisfy all static gates. ESLint reported four style
errors on one single-line callback at test line 1265. The ambient-intrinsics
audit scanned both changed JavaScript files and reported two new violations
in the fixture: direct `command.endsWith` and `command.replace` calls at
lines 1173 and 1175. Source inspection of the checker confirms that these
method names are governed; the clock calls are not those violations. The
file-size gate passed. The literal, decision-boundary and silent-catch checks
each reported zero scanned JavaScript files and do not establish coverage
of this harness change.

The follow-up expands that callback and uses the existing shared
`stringEndsWith` and `stringReplace` captures. It changes neither production
code nor the allocation, command, timing, assertion or cleanup semantics.
No baseline, exemption, deadline or ratchet is increased. This correction
has not run locally; root owns exact-candidate managed verification.

Job 4908 is native component and interaction evidence through a substituted
SSH hop and a real local HTTP server. It does not certify physical SSH,
distributed formation, GCP measurements or campaign admission. Its original
static failures remain part of the record. Final acceptance, independent
review and publication remain pending.
