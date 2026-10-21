---
audience: development
documentClass: current
---

# Independent native retry-suppression result

Reviewer: `subagent:/root/control_source_review`, 2026-10-21. **APPROVE classification as an engaged native semantic-negative kill of the one-line retry-suppression diagnostic at `e88d94ef5bbeaf5c20759fa66518cbd06b1df94c`.** This is expected-negative evidence, never a positive certification population or a production source change. The preparation review remains unchanged and separately hashed. No tests, production files, receipts or commits were changed by this reviewer.

## Exact treatment and packet

All six final packet checksum entries match their complete files. The checksum manifest itself is SHA256 `7b8f89f78f3906dfca3f41e72637460bf6a9214629500558a924a9389e738f0e`. Input/controller/exit/ledger agree on e88, adam-laptop, retry disabled and the single unchanged native test. The controller reports placement-head e88, factor2, retry0, thermal hold followed by admitted execution. The ledger has one file, attempt1, retriedOnce=false and the named second-case failure. TAP reports two cases, one pass, one fail, zero cancellation/skip/todo. Exit status1 is expected and is not by itself the proof.

Independently verified Git source tree `0ec325f696f687afa4c2c8f09d2ff1b0f7adbd21` and the three exact input blob/hash bindings. Compared with positive `393f411ca09449898465cc3cb7320c03fba2aba8`, only one runtime file changes and its only change is the approved deletion of post-answer non-CUT_OVER enqueue. The exact patch hash remains `1468ae44d3487ee43c9e06a0a010a44ee4981f35f07ff37a7670122a645828d3`; old/new source hashes are9b1051f820e4a2ffbe55a123b8d01e28fe05a9ff9a85ed5eecacd4cf284e0937 and959e710416b32ebaf738b6b1904b5cec3b40a696a8e25c666e270aa752a49fd8. No executable test JavaScript changes; witness d2f5be01c26338c9715d4abcb75ed6bd1a9dee269eaad312528bdc255bfcaa7a and fixture3f3b17a7d3fa637b09001fb179170bb1792efbec5acbb96cd009dcdd7117934c match positive393f exactly. The other commit changes are preparation evidence and generated inventory/graph metadata, not hidden treatment changes.

## Intended failure after actual engagement

The first case, pre-ENABLE expiry/authority continuation, passes. The second fails with AssertionError false!==true and exact message `retained recovery retry must reopen the current service after authority returns`. Its stack identifies expectOpenFromExistingRecovery at test145 and the dependent call in proveRetainedRetry at265. The earlier control OPEN call257 therefore completed; this is not a missing-control setup failure or a failure to restore the control service.

The unchanged sequential witness makes reaching265 contingent on all of these mandatory checks:

- Actual dependent ENABLE settled OBSERVED, a real durable origin was present and equal to the answer origin, and only the named lost-answer exception interrupted that response; original dependent remained CLOSED.
- The dependent was shut down and recreated over its intact retained DB; its actual native leader existed, actual consensus notifications were positively dropped, and none was forwarded to the handler relay.
- The replacement origin equaled the original; actual existing-origin recovery returned CURRENT_CONTROL_OWNER unavailable while control was absent and retained CLOSED admission.
- Current control was recreated through its normal retained-store constructor/election, became the registered current object and reached OPEN with its preserved origin.
- At RECOVERY_RETRY_MS minus1, the dependent still remained CLOSED with no extra dependent INSPECT; the final1ms advancement then preceded the pure-admission OPEN wait that failed.

The named failure is a bounded semantic observation timeout inside the deliberately unchanged OPEN oracle, not a runner timeout, import error, missing method, unengaged transport fault or early deadline refusal. No cleanup/observer-restoration error, AggregateError or cancellation is surfaced; the fixture's awaited cleanup path remains unchanged. Assertions after265 (successful due-route reentry, preserved origin after success, SQL progress) do not execute in this negative and are not claimed to pass. They do execute in the separately reviewed positive.

## Positive comparison and scope

The exact same two-case file passes at positive393f on adam-laptop within the reviewed32-file composition. The positive keeps the post-refusal enqueue; the diagnostic removes it. Together, the positive and this engaged negative discriminate the existing returned-refusal retry as necessary for progress in this controlled lost-notification schedule while retaining the preceding safety refusals. Other legitimate wake paths were not disabled to force the result beyond the original already-reviewed fixture fault. No new event or direct dependent release was added.

Positive automatic factor1.9 and diagnostic factor2 reflect unchanged runner policy. This comparison proves the semantic branch under the controlled handler-clock schedule, not timing equivalence, production latency or a general starvation bound. It remains a local one-member native owner witness with in-process transport/empty-cache seams, not full original seed startup, retained-partial admission or cross-host certification.

This supplies the previously pending native retry-suppression negative evidence for its existing owner. Root may incorporate this review and raw packet into its evidence/receipt assessment without merging the diagnostic source. Final canonical broad selection, applicable Quest gates, terminal landing/publication and broader U1/cutover/release obligations remain separate. No receipt was edited and no whole-unit completion is declared here.
