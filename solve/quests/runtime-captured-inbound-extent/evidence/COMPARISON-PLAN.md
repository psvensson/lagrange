# Immutable source comparisons

All comparisons use the final unchanged W07 and companion test/helper bytes, the same dependency graph and locked lenovo-laptop. Each is a new isolated worktree and exact checkpoint; no candidate worktree or historical proof is overwritten.

1. Predecessor-only: replace only src/raft/raft-rs-runtime-owner.js with a7e821154 bytes. Run the whole frozen W07 file once. Required negative is its named late-service 4 > 1 assertion after byte/reply preservation. Setup, import and timeout failures do not count.
2. Capture-before-admission: move only inboundExtent capture above thenMaybe(ensureExecution(...)); generation capture remains after admission. Run the whole companion file once. The reconstruction control must show actual completed durable replay and native selected-operation refusal/order failure because the heartbeat accepted during ensureExecution was excluded. Its full result and positions are retained.
3. Blanket-one: change only inboundExtent to Math.min(1, group.inbound.length). Run the same whole companion file once. The two preaccepted inputs must still be preserved by the queued wake, and the capture-point control must reject their ordering relative to the selected proposal.

Generated metadata follows each source checkpoint through the existing producer. These are deliberately incorrect treatments, never proposed production behavior. No bound, clock, deadline, test byte, schema or callable symbol is changed to manufacture a failure. Exact source and test hashes and all first outputs are recorded separately.
