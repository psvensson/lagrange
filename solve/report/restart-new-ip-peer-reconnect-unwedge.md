# Solve report: restart-new-ip-peer-reconnect-unwedge

**Goal:** When a node restarts with the SAME nodeId but a NEW network address, its peers detect the address change (or the dead stale-but-open connection), close the stale socket, and re-establish connectivity to the new address, proven by a deterministic test that injects a same-nodeId address change and asserts peers redial the new address (red-on-revert). Covers three confirmed defects: (1) no active reconnect/close trigger on a node_endpoints address change [cdc-event-handler.js:492,538 handleNodeJoinedCDC is INSERT-only + skips-if-CONNECTED], (2) stale-but-open connections pin the old IP because startPingInterval has no pong-timeout close and refreshReconnectAuthority won't overwrite a live connection's address [connection-authority.js:199-206], (3) a stale bootstrap seedNodeWsAddress beats the fresher canonical node_endpoints row [node-address-resolution.js:433-446].

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/restart-new-ip-peer-reconnect-unwedge-2026-07-03T06-27-47-378Z.report.json

**Attempts:** 0

## Current Blocker
- Frontier: restart-new-ip-peer-reconnect-unwedge-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for restart-new-ip-peer-reconnect-unwedge-main

## Continuation
- Status: allowed
- Next action: continue supervised step for restart-new-ip-peer-reconnect-unwedge-main
- Blocker: none

## Scope Pressure
- Changed files: 0
- Owner areas: none
- Categories: none
- Signals: none

## Frontiers
- **restart-new-ip-peer-reconnect-unwedge-main** [open] rung 0, attempts 0, metric ? -> ?

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
