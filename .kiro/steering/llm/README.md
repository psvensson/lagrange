---
scope: index
status: manual-pack
always_load: false
source_of_truth: self
---

> **Manual pack — edit here directly.** This is a pure file index for the LLM steering pack directory. Load order is owned by [`AGENTS.md`](../../../AGENTS.md). Do not duplicate the load sequence here.

# Steering LLM Pack — Index

Regenerate the generated packs with:

```bash
npm run steering:llm:pack
```

## Files

| File | Mode | Purpose |
| --- | --- | --- |
| `core.md` | manual | Always-load operating contract, must-not checklist, template picker. |
| `boot.md` | manual | Authority order, lane vocabulary aliases, per-lane first commands, conflict rule. |
| `architecture.md` | generated | Runtime/control-plane/bootstrap/join/rebalance/lifecycle policy. |
| `testing.md` | generated | Test design, fixtures, regression policy, harness rules. |
| `style.md` | generated | Lint, formatting, naming policy. |
| `governance.md` | generated | Roadmap, scope, edition-boundary policy. |
| `rules.json` | generated | Complete generated rule corpus with IDs and source citations. |
| `manifest.json` | generated | Pack metadata (rule counts, token estimates, domains, mode). |

## Conflict Resolution

At execution time, follow the three-level Authority Order in [`boot.md`](boot.md): user instructions and safety limits, then Quest workflow canon plus the active Quest file, then the domain packs. The packs are the canonical execution-time surface; the source-vs-pack distinction is a generator concern, not a runtime one.

If a domain pack rule looks wrong, fix the underlying source file under `.kiro/steering/` and regenerate with `npm run steering:llm:pack`. Do not silently prefer the source at runtime — that hides drift instead of repairing it.

## Notes

- `core.md` and `boot.md` are manually curated so the always-load contract stays memorable.
- Domain Markdown packs are generated and compact for prompt loading.
- Pack sizes (rule counts, token estimates) are recorded in `manifest.json` at generation time; do not maintain a separate static table.
- Cross-pack duplicates are collapsed via `ruleAliases` in [`../llm-pack.config.json`](../llm-pack.config.json): each alias rule carries `canonical_of: <master-id>` in `rules.json` and is suppressed from per-domain pack emission, so the same rule never appears under multiple IDs in the markdown packs. Master rules keep an `aliases: [...]` array listing the suppressed IDs for traceability.
