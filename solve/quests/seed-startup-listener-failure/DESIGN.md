# Seed startup listener failure

The exact causal divergence is `startSeedNode` catching and warning on a rejected
`bootstrapService.startWebSocketServer()` acquisition. Its caller then completes
startup. `MessageRouterServerLifecycle.startServer` itself waits for the actual
WebSocket `listening` event and rejects the actual listener error, so no new
transport readiness state is needed.

The preserved activation run in `/tmp/fresh-seed-activation-YchPPd` logged
`EADDRINUSE` at `127.0.0.1:49854`, retained a server object with null address, and
still returned a runtime and served readyz200. A probe's implicit ephemeral
self-connect is a matching causal inference for that collision, not a proven
historical tuple. The listener failure is real regardless of who owned the port.
The new witness owns that conflict deliberately and measures actual startup.

Repository census finds one suppression of `WS_START_FAILED`, in seed startup.
Join's shared message-router setup rejects initialization failure and retains
EADDRINUSE/retryable for the existing join retry owner. That policy is unchanged.
The catch predates the fresh activation source (present before7fa4d79ae).

The repair propagates the original bind rejection through `runStartupWithCleanup`
and acquires the seed HTTP listener only after the transport listener succeeds.
The existing acquisition ledger closes acquired owners before releasing process
custody; a cleanup failure retains custody and aggregates the original cause.
No second cleanup or readiness owner is introduced. Internal bootstrap progress
and durable original rights are not rolled back or rearmed.

The decisive witness reserves the real transport port, starts the existing public
fresh-seed child with no runtime doubles, and measures no runtime return, original
EADDRINUSE, no ready HTTP admission, closed HTTP ingress, and a successful real
competing-process directory acquisition while the first child remains alive.
The unrelated occupied listener remains owned by the test. The normal public
write/read/restart witness supplies the paired unoccupied start. This proves a
single-host startup outcome, not a recovery or distributed-release claim.
