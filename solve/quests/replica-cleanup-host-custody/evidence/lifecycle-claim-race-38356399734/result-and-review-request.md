# Lifecycle claim race — measured result and independent review request

Status: focused claim-race proof PASSED. This is not whole-release certification,
Quest landing, main integration, or an approving independent review.

Pre-fix source control: `733da50e2bb5a70f1fbef0779a966012a150f74e`.
Measured branch head: `4bafc6b872e3708edf343b1dad4b63f30c23f9d0`.
Run: `38356399734`.
Artifact: `11792184267`.
Artifact SHA256:
`b7630507e21bc79c3d19abea47a43fa0785811610cf0a6f38ba61d2f85080ac5`.

## Correction

Partition and message-group initialization now have one joined
`initializationSettlement`. Concurrent callers cannot open two operation ports.
An externally requested shutdown fences new initialization immediately, waits the
in-flight initialization settlement, and only then tears down its resources.

Partition startup-refusal cleanup is initialization-owned: it does not wait for
the same initialization promise that invoked it. If an external shutdown already
owns teardown, initialization rejects and lets that owner continue after the
joined settlement. This avoids the self-deadlock found by the first regression run.

The public initialize path checks the shutdown fence before joining an existing
settlement. This prevents a recently resolved initialization promise from letting
a new initialize call succeed during a pending shutdown.

ReplicaHandler CREATE rechecks `shuttingDown` immediately after awaited retained
runtime cleanup and before prior-existence/status/context mutation. A final
ownership guard releases the physical-worker claim and removes operation tracking
if a failed runtime shutdown exits before the existing branch-specific release
paths. The exact unreleased runtime remains in `pendingRuntimeShutdowns`; claim
release is not treated as resource release.

No retry interval, protocol deadline, durable record, election rule, or new
lifecycle coordinator is introduced.

## Exact controls

The final six-case adversarial witness is run unchanged against the exact pre-fix
source and the corrected source.

Pre-fix source:
- concurrent partition initialize opens twice;
- concurrent message-group initialize opens twice;
- shutdown can tear resources down under in-flight initialization;
- failed CREATE cleanup can leave the physical-worker claim unreleased.

Corrected source:
- all six claim-race cases pass.

The existing lifecycle/cleanup cone also passes:
- replica runtime cleanup custody;
- startup cleanup;
- runtime opening refusal;
- runtime opening history;
- shared runtime replacement review;
- partition construction seam;
- message-group lifecycle/ledger;
- WASM lifecycle;
- WASM replica lifecycle.

That cone reports 268 assertions across nine files, all passing. Focused ESLint,
the rs-raft operation-boundary audit, and changed-range whitespace checks pass.

The first candidate iteration and its red evidence are retained. It exposed an
initialization-owned shutdown self-wait. A second regression run exposed the
shutdown-fence-versus-resolved-settlement ordering. Neither red was rewritten.

## Evidence ceiling

This proof covers in-process native partition/message-group initialization,
concurrent shutdown, retained cleanup debt, and ReplicaHandler CREATE claim
custody. It does not certify complete NodeService startup, coordinator crash
recovery, FreshMG replacement, seed-storage loss, or physical multi-host behavior.

The four legacy/TX1 historical-admission fixtures, full global static closure, and
the release-wide exact-candidate gates remain separate merge obligations.

## Independent review requested

Review the owner interaction rather than only the final diff:
- concurrent initialize/initialize;
- initialize/shutdown while native campaign/open is pending;
- startup refusal cleanup invoked from initialization itself;
- external shutdown concurrently with startup refusal;
- shutdown beginning while CREATE awaits retained cleanup;
- failed runtime shutdown retaining exact cleanup custody while the physical
  worker claim is released;
- no double claim release on ordinary success/error paths;
- no successor resource is retired by predecessor cleanup.

No automated review should be treated as approving Solver verification.
