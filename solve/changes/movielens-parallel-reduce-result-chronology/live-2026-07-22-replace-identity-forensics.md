# Live replacement-identity forensics — 2026-07-22

## Immutable report

- Report:
  `test-output/reports/movielens-lagrange-service-affinity-live-2026-07-22T09-46-30-107Z.report.json`
- SHA-256:
  `b47bf1a76853a5914c7f940a4182047d3b965380b9e4a4aa243ab636634d8697`
- Producer/fidelity: `service-data-affinity-demo` / `live`
- Terminal error:
  `learned-affinity stalled with no observable progress for 300s`
- Schema and preload admission both passed. The report did not retain the
  final affinity assessment because the demo threw before returning its
  result.

The stopped cluster state under
`data/examples/service-data-affinity-demo/` is the state from this report.
It was inspected before any later live run could archive and replace it.

## Result and slot witness

All three replicas of the result and coordination tables agreed on these
rows:

```text
result computed_at: 1784713578612
result slot 1: replace-replica-6c78fcfcf169902655ef0304792ee569 @ 1784713578608
result slot 2: svc-movielens-topn-r2 @ 1784713575224

current slot 1: replace-replica-6c78fcfcf169902655ef0304792ee569 @ 1784713578608
current slot 2: svc-movielens-topn-r2 @ 1784713580259
```

The result is chronologically downstream of both partials it sealed. The
later slot-2 update is intentionally non-retroactive and does not invalidate
that owned witness.

The authoritative `services` rows instead named the current placed replicas
as `svc-movielens-topn-r2` and `svc-movielens-topn-r3`. Therefore both the
current slot-owner identity set and the sealed result identity set differed
from placement by exactly this pair:

```text
slot/result only: replace-replica-6c78fcfcf169902655ef0304792ee569
placement only:   svc-movielens-topn-r3
```

## Lifecycle chronology

The node log records the complete identity split:

1. REPLACE operation
   `replace-op-3c569c691dbf29fe038cf6e807ee018c` created and started
   `replace-replica-6c78fcfcf169902655ef0304792ee569` on node
   `d991a533-291b-49f8-a455-a387e8abe52a` at 09:40:04Z.
2. The REPLACE removed source `svc-movielens-topn-r1` and reported the
   operation completed at 09:40:13Z. No removal of the temporary target
   runtime was recorded.
3. ADD operation `89b5eb18-1fe4-483e-97e5-fdbb0fd70c9a` then created and
   started canonical replica `svc-movielens-topn-r3` on the same node at
   09:41:02Z.
4. Both query loops remained active. The earlier temporary target retained
   slot 1, while placement observation correctly exposed `r2` and `r3`.

## Classification

This run does not falsify result-to-partial chronology. It exposes a runtime
service REPLACE finalization/identity leak: a successful REPLACE target keeps
executing under its operation-intent identity after the canonical service
generation is created. The completion observer correctly refuses to equate
those identities. Another live run on unchanged lifecycle bytes would only
sample whether this replacement path happens to engage again.
