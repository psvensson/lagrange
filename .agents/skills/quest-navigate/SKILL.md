---
name: quest-navigate
description: Trace Lagrange symbols, callers and producer-to-consumer contracts with the project Serena service. Use when exploring an unfamiliar owner or checking the reachability and scope of a proposed repair.
---

# Navigate the actual source

Load AGENTS, rules and router, then only the routed owner. Identify the commit,
worktree and existing Quest or direct-change review record before interpreting a
symbol. Navigation alone does not require a Quest. Use the project integration
owner at docs/development/agent-tooling.md for setup; its capability-acceptance
procedure applies when that capability is the claim under review.

1. Confirm the configured root and current profile with
   `node scripts/agent-tooling/cli.js status`. Configuration is not connection proof.
2. Use `quest_serena` to inspect the relevant symbol, body and references.
   Check returned paths against this worktree and read the actual producer shape,
   persistence/decoder boundary, consumer and teardown/wake owner.
3. Follow imports, prototype composition and dispatch registration in source.
   Empty references are incomplete navigation, never proof that no caller exists.
   JavaScript navigation is the initial supported scope. Rust needs its own
   measured backend; do not infer support from upstream language lists.
4. Record exact files and digests with the actual response in the existing work
   record. Do not create another record solely for navigation.
   After a checkout, worktree switch or edit, restart the owned service/index and
   verify the returned source again. Prior references remain historical.
5. Return the source trace and its limits to the author or verifier. Serena may
   navigate; it has no permission to edit, execute shell commands or write memory.

If the service or a required symbol result is unavailable, name that gap and its
next owner. An independent source read can establish only its stated source claim;
it cannot be recorded as a successful Serena invocation.
