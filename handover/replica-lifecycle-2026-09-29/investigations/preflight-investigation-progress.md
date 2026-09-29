# preflight investigation progress

- 2026-09-28T17:10:55+02:00 started
- base 6831054b1: GREEN 85/85 assertions, 22.8s (base-run1.out)
- dirty d467e0563: RED 79/81 — not ok 4 "joining node <2nd> should join successfully" (line 248, success=false) + not ok 1 discovery (line 495). 51s.
- inst-wt (/tmp/claude-1000/-mnt-data-peter-projects-lagrange/42eae958-6576-4059-b7e8-44f638e8d993/scratchpad/preflight-investigation/inst-wt) instrumented: forward-result, hmr-entry/ingress/return/throw, hnsu-*, getAuthoritativeNodeRow, nspo-deliver -> INSTR_OUT
- inst run2: reproduces 79/81 (same two reds). instr-run2.ndjson has 122 records.
- KEY: forwarded NODE_STATE_UPDATE arrives at target replica double-wrapped (payloadKeys=[messageId,payload,sourceGroup,sourceReplica], innerType=NODE_STATE_UPDATE) -> no completion handler -> {status:received} w/o completion -> FORWARD_DELIVERY_REJECTED. 16 forward-results, 0 forwarded dispatches. (instr-run4.ndjson)
