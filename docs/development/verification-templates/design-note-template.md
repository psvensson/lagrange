# Design-Note Template: Pre-Vet Structure

Authoring structure for a Quest design note BEFORE the design-vet
subagent runs. On the raft-snapshot-transfer-install epic (S1–S6,
2026-07-26) the design verifier's round-1 refutations fell into the same
four categories on all six rungs; a design note that satisfies these
sections up front pre-empts most of that round.

Required sections:

1. **Consumed surfaces — cite or it doesn't exist.** Every function,
   event, config key, table, or seam the design consumes gets a
   `file:line` citation from the CURRENT tree. "The dispatcher calls X"
   without a citation is the S3/S4/S6 failure mode (assumed pressure
   owner, assumed injection path, missed second production factory). A
   surface you cannot cite is a surface the design must create — say so
   explicitly.
2. **Typed failure edges.** Enumerate every failure edge of the new
   mechanism and give each a TYPED outcome (refusal code, decision-table
   row, marker state) — not prose. State for each edge whether it fails
   closed, and what a caller observes. Include the "input is absent /
   empty / already-satisfied" edges: S4's `catchup_range_empty` had to be
   distinguishable from corruption.
3. **Cached-view audit.** List every cache, memo, staged copy, or
   read-through view the mechanism touches or introduces. For each: what
   invalidates it, what happens when it is stale at the read site, and why
   staleness cannot resurrect a closed livelock/laundering path (S5's
   boundary cache adopted refresh-on-row-miss after exactly this
   refutation).
4. **Identity anchoring.** Every artifact or decision the design produces
   must name the identity fields that pin it: term, epoch, generation,
   cluster id, content digest — and where each is sourced from
   (cite per section 1). State what happens when the anchor moves
   mid-operation (epoch change during transfer aborts; a proof anchored to
   a foreign term must not compact the local log).

Vet instruction: the design verifier attacks each section separately and
reports ALL refutations per section, not the first found.
