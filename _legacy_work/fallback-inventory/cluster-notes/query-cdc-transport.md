# Query CDC And Transport Cluster

## Classified Fallback IDs

1. `FB-CDC-001`
2. `FB-CDC-002`
3. `FB-QR-001`
4. `FB-TP-001`
5. `FB-TR-001`
6. `FB-TR-002`

## Current Assessment

1. The authoritative control-plane read ladder in
   [cdc-integration-service.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/src/cdc/cdc-integration-service.js#L1143)
   is the canonical owner path for authoritative reads and should not be
   replicated at callers.
2. The degraded provisioning cohort logic in
   [sql-query-engine.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/src/query/sql-query-engine.js#L4425)
   is architecturally important because it widens admission evidence under
   low-node or bootstrap conditions.
3. Transport reconnect and remote-path fallbacks are currently owner-contained
   in
   [message-router.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/src/transport/message-router.js#L2932)
   and
   [message-router.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/src/transport/message-router.js#L3408),
   which is the right shape even if the fallback triggers should shrink over
   time.
