---
audience: development
documentClass: evidence
---

# Startup-owned original allocation: bounded source checkpoint

This continues the opening correction at
`7766ccafbe3767c9e397fabf97f41a197d7fb53e`, whose lab #735 receipt reports
6/6 files and 58/58 runner-reported tests on tv-dator, with execution and
thermal scopes closed. That result belongs to that revision. It is not a
result for the new startup wiring.

## Preserved witness baseline

Commit `3fa20cefeca622ec2060509903a921979d32a082`, branch
`work/original-startup-witnesses-20261022`, adds the first 14 cases in
`test/bootstrap/seed-original-attempt-lifetime.test.js` and producer-generated
metadata/inventory. Its runtime source tree remains exactly
`ee7f5447b63e7d291a286ef66ea51532a4ceecec`, the runtime tree of 7766ccaf.
The 20,600-byte witness has SHA-256
`e4afdcabc63bd3397b992978a5cdaa7da136122d4802eb203482b3e975a72790`.
The two baseline-compatible admission witnesses are selected for lab
measurement; no baseline runtime outcome is asserted in this source record.

The baseline tree `9c6c1e422a7e0c45c2acc7d66e5dc8e8e37c51cd` matches local
commit `ec5355597f8a5eb6d821d35a603e4dd80e754c25`, whose normal pre-commit
hook passed after allowing a 6 GiB Node heap for the inventory generator.
An earlier inventory attempt exhausted the default heap. No hook was skipped
for that baseline. Native git push lacked credentials; GitHub repository
object APIs preserved the exact tree, followed by a fetch and tree comparison.

## Existing-owner interaction

The actual seed runtime supplies its directory custodian and startup abort
signal to BootstrapService. Preparation is a single live attempt established
before the bootstrap pipeline, reconciliation or public listener startup.
Concurrent preparation shares its settlement. Build measurement is followed
by renewed ownership checking; retained declarations stop with the named
CLASSIFICATION_UNAVAILABLE outcome until the application-history owner exists.

The existing allocation-preparation owner admits creation descriptors against
the complete declaration. It owns exact member identity, paths, peers,
membership, the deeply frozen catalog schema, deferred election and the
opaque original-opening token. Queue admission precedes desired-state and
creation-map mutation. Both actual creators renew admission after any stagger
await and carry the same token through the service to the operation port.
The existing final native-opening check remains authoritative.

The host retains each actual native service before initialization can yield.
Map presence does not grant creation success: pending or failed partition
initialization is a typed RESOURCE hold. Shutdown/failure revokes the attempt
synchronously. Router custody is retained immediately after construction;
cleanup joins router and lifecycle-owner acquisition before teardown. The
reconciler is retained before its initial cycle, and failed cleanup retains
the exact object for a real retry.

The seed router uses the existing listenerless local-routing path. The HTTP
bootstrap API remains uninitialized until successful bootstrap. Elections,
ordinary registration, public-transport admission and successful completion
explicitly refuse with CONTINUATION_UNAVAILABLE at this WIP boundary. This
checkpoint therefore cannot complete a fresh or retained startup.

## Review and additive witnesses

Independent review found four material draft defects: message-group custody
after native initialization, partition map presence mistaken for settled
creation, caller-owned schema reaching DDL, and infrastructure acquisition
completing after shutdown. All four were repaired in their existing owners.
The review history is retained in REVIEW-startup-lifetime-2026-10-22.md.

Seven focused witnesses were appended. They exercise real native construction,
SQLite schema effects, router initialization, initial reconciliation and exact
resource release while substituting only pacing or a named failure. The first
14 cases remain byte-identical. The complete 21-case file has SHA-256
`3ef091d21e2e67af4ae40f06e6061fa1334f29a88583a6aa4a5d9547584018c7`.
Scoped ESLint and whitespace checks passed. Canonical metadata was regenerated;
the containing candidate still requires exact-head lab measurement.

The router factory's physical constructor selection is now a named synchronous
helper in the same owner. Immediate custody remains in setup before any
configuration or await. The scoped complexity checker reports no violation
for that file after this decomposition.

## Acceptance ceiling and remaining work

This is source preservation on a WIP branch under the existing solver runbook,
not Quest landing, main publication, serving approval or release proof.
Independent source approval is bounded to the explicitly unavailable
startup-to-native checkpoint. It does not waive any static gate.

The partition decision-boundary audit finding also exists on unchanged
7766ccaf. It is retained and routed to the guideline-audit owner; no rule,
baseline, assertion or source identity is changed to hide it. Normal hook and
lab outcomes will be appended as measured, including failures.

The next product boundary is retained-command classification. Protected
activation through leader acknowledgment and durable transfer, complete public
admission exclusions, and the composed two-start proof remain unfinished.
The shared public message ingress still needs its own complete exclusion
proof; listenerless seed infrastructure alone does not establish it.
All eight handoff receipts and the sealed Quest record remain unchanged.
Current steering revision 4 is applied from main's
`a75050381a582475450441d812ca4e8e54bca6d3`; unrelated main changes are not
merged into this lane.
