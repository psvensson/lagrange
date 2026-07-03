# Solve report: restart-new-ip-name-first-advertising

**Goal:** A node can be configured to advertise a STABLE hostname/DNS name (not a raw IP) as its peer WebSocket address, and that name is preserved end-to-end even when the transport binds to a wildcard host (0.0.0.0/ANY) -- i.e. the routable-local-IP substitution in resolveAdvertisedWebSocketAddress does NOT override an explicitly configured advertised name. Peers dial the node by that name and the OS re-resolves it on each (re)connect, so a restart that changes the node's IP behind a stable name is transparent to peers. Proven by a deterministic test: a name-advertised node publishes its name into node_endpoints, a peer resolves+dials the name, and a changed backing IP is picked up on reconnect without manual address updates. Layered ON TOP of approach (b) (defects 2+3, already landed), not a replacement.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/restart-new-ip-name-first-advertising-2026-07-03T06-27-43-280Z.report.json

**Attempts:** 0

## Current Blocker
- Frontier: restart-new-ip-name-first-advertising-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for restart-new-ip-name-first-advertising-main

## Continuation
- Status: allowed
- Next action: continue supervised step for restart-new-ip-name-first-advertising-main
- Blocker: none

## Scope Pressure
- Changed files: 0
- Owner areas: none
- Categories: none
- Signals: none

## Frontiers
- **restart-new-ip-name-first-advertising-main** [open] rung 0, attempts 0, metric ? -> ?

## Findings
_(none recorded)_

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
