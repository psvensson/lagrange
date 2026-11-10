---
audience: development
documentClass: planning
---

# Owned agent tooling integration

This is Q1's bounded implementation design. Current coordination remains in the
[epic](../../epics/quest-agent-tooling-integration.md); the
[implementation plan](implementation-plan.md) retains the feature requirements.

## Actual inputs and selection

The inspected host provides Codex CLI 0.167.0 with ChatGPT authentication and
uv 0.10.2. Serena's pinned CLI installed successfully into uv's tool cache and
answered start-mcp-server --help. These were the initial intake observations,
before project activation; the epic records subsequent execution and open gaps.

- Superpowers: obra/superpowers at 22f0b463e7a5e579904dd6211a520321035526f7,
  MIT; adapt debugging and verification instructions.
- Compound Engineering: EveryInc/compound-engineering-plugin at
  fb5548f246c67044a43940adb3f9b84d3f62606a, MIT; adapt report-only review and
  learning instructions.
- Serena: oraios/serena at 6e5c3776d4e67befaab7c290bc29b0279c98d1ed,
  GPL-3.0-or-later; execute as a separate pinned MCP service.
- Context7: npm @upstash/context7-mcp 4.6.0, integrity from the actual registry;
  documentation reference c5e34a01799bce82534eb0ed74bb16b025d75f47. The
  source reference does not assert that the registry package was built from
  that revision. A pinned client does not freeze its remote documentation service.

## Producer and consumers

One repository profile under scripts/agent-tooling defines supported host,
pinned upstream inputs, project skills and MCP commands/allowed tools. Project
skills under .agents/skills consume the routed owners. They do not carry their
own task state, fixed escalation rules or alternate completion semantics.

Setup renders an owned block in project .codex/config.toml from the profile.
The block contains worktree-local absolute paths derived at setup. It refuses
an existing colliding server/table or altered owned block instead of guessing.
Before/after bytes outside that block stay unchanged. Config is a generated
projection, not the authority. No global profile or credential store is edited.

Codex consumes that real project configuration. MCP stdout belongs to the
protocol; launches preserve cancellation and exit status. Serena is restricted
to source navigation, with no shell/edit/memory tools. Context7 is restricted
to library resolution and documentation queries. External document coverage
is verified from each response and remains unmeasured when unavailable.

## Evidence and commit points

A live observation producer records the actual command/tool/client invocation,
exit/outcome, stdout or event stream, source/configuration identities and digests.
It never supplies a success response on a failed/unavailable invocation.
Retained raw files follow the existing evidence owner; local materialization
must verify against retained digests before a probe reads it.

Every component and the Epic invoke one read-only scoped admission function.
It checks underlying retained observations, direct source/configuration state,
candidate applicability and an independent review entry for that scope.
Raw observations remain in the existing solve-evidence store; compact receipts
reference its verified findings and hash-checked local materializations. They do
not embed raw streams or create a second evidence ledger. No pass-flag fast path
exists. Missing observers are unavailable; an actual
observation of an absent/unconfigured capability is a measuring negative.

The existing script-probe owner gains explicit args.artifacts: a validated
list of unique literal repository-relative retained files. Validation rejects
absolute paths, traversal, globs and invalid shapes. The script consumes the
same declaration that requiredProofArtifacts returns. Existing sealed script
probes that specify none retain no artifacts and keep their original meaning.
No new probe type, success ledger, MCP proxy or general agent runtime is added.

Proof scaffolding first observes actual absence/invalidity; only then start
seals a red predicate. A raw missing receipt cannot impersonate that observation.
Q4's positive control uses an actually completed component execution; it also
shows the Epic remains incomplete before Q8. Q8's complete positive consumes a
separate pilot's landing/publication, avoiding self-referential acceptance.

## Lifecycle and learning

Installing the same profile is idempotent. An explicit update changes pinned
inputs and requires affected evidence review; version substitution is forbidden.
Interrupted or invalid setup retains a typed failure and preserves unrelated
configuration. Removal removes only a still-matching owned block and owned
resources; changed user content is refused, never silently deleted.

Capture a verified lesson before the pilot's land. Later corrections belong
to an open owning/successor record with a reference to the immutable closed
pilot; a terminal Quest log is never reopened. Process/index ownership and
cancellation are verified through actual client sessions in Q7 and Q8.

The scope remains tooling. No product source repair, formation acceptance or
comparative measurement is granted by this design, and no synthetic measurement
may enter any comparative system campaign.
