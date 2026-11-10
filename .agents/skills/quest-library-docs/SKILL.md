---
name: quest-library-docs
description: Retrieve and verify external dependency documentation through Context7 for a Lagrange Quest. Use when correctness depends on a third-party API or version-specific behavior, not for internal Lagrange contracts.
---

# Resolve the dependency before its documentation

Read the installed package and lockfile to identify the exact package, ecosystem
and version. Keep internal shapes with the routed Lagrange owner. Setup, pins and
capture are owned by docs/development/agent-tooling.md.

Use the actual `quest_context7` resolve-library-id and query-docs tools. Send only
the necessary public API question; never include credentials or unrelated files.
Record the resolved library identifier, requested version, returned version/scope,
attributable source URLs and the raw response.

A request that names a version does not establish that the answer covers it.
If exact-version coverage is unavailable, report `exact-version-unavailable`.
Compare the relevant API with installed source or primary versioned documentation
before relying on it. Explicitly label cross-version inference and uncertainty;
do not turn a generic current example into an invented installed API.

A pinned MCP client does not pin the remote documentation corpus. Missing service,
missing library and mismatched version remain distinct unavailable observations.
They do not trigger a replacement version or a fabricated tool response. Work
that needs no external facts can continue; this capability's acceptance still
requires a genuine invocation and attributed output.
