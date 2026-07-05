# Verification Template: Transport / Delivery / Wake Semantics

For changes touching messageRouter delivery, wakes, dispatch handoffs, or
response classification. Each item requires an evidence path.

1. **ACK is not processed.** Transport `acknowledged: true` can coexist
   with `noHandler: true` (ACK-before-handler-lookup; mid-startup targets
   drop messages). Every consumer of a delivery outcome must branch on
   `noHandler`/processing evidence, not `acknowledged` alone. (run-26 wake
   drop; contract suite: test/contract/message-router-contract.test.js.)
2. **Late responses.** SERVICE_RESPONSEs can arrive after the waiter
   retired; verify late-honor paths cannot cancel the only remaining
   re-drive on ambiguous (row-invisible) evidence.
3. **Outcome classification.** New response shapes: run them through
   `classifyTransportDeliveryOutcome` semantics — DELIVERED/DEFERRED/FAILED
   mapping, `deferRetry`, `retryAfterMs` — and verify the retryable-error
   classifier accepts what must be retried.
4. **Undeliverable never hangs.** Missing handler / no connection must
   resolve with a retryable signal within a bounded time, never hang the
   awaiting workflow.
5. **Stub fidelity.** Any test stub of the router in the change: does it
   honor the contract suite (register/deliver semantics, undeliverable
   shape)? Prefer `createContractMessageRouterStub`.
