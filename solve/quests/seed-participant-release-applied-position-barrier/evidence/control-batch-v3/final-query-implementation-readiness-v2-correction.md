# Final-query readiness correction

This note corrects only the reusable hold-seam attribution in the read-only readiness report. It makes no source, fixture or test design decision.

Native V8 holds Raft carriers and committed-membership answers. It does not expose a reusable `OBSERVE_APPLIED_POSITION` delivery gate. The existing post-ENABLE control-loss case in `test/partition/participant-release-protocol.test.js` holds the actual registered OBS delivery and is the truthful reuse candidate if the separately approved query case becomes a second real consumer. Any extraction remains conditional on that concrete two-consumer implementation and its scoped review; this V3 batch neither extracts the gate nor begins the query case.
