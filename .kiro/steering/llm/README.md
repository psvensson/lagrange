# Steering LLM Pack

This directory contains curated and generated low-token steering artifacts.

Generation command:

```bash
npm run steering:llm:pack
```

Recommended load strategy:

1. Always load `core.md`.
2. Load one domain pack based on task:
   - `architecture.md` for runtime/control-plane/bootstrap/join/rebalance work
   - `testing.md` for test design and regression policy
   - `style.md` for lint/style/naming policy
   - `governance.md` for roadmap/scope checks
3. Use `rules.json` when you need IDs + source traceability.

## Pack Sizes

| Pack | Mode | Rules | Estimated Tokens |
| --- | --- | ---: | ---: |
| core | manual | 21 | 1291 |
| architecture | generated | 109 | 3511 |
| testing | generated | 95 | 3802 |
| style | generated | 8 | 203 |
| governance | generated | 47 | 1923 |

## Notes

- `rules.json` is the complete generated domain source with IDs and citations.
- `core.md` is manually curated so the always-load contract stays memorable.
- Domain Markdown packs are generated and compact for prompt loading.
