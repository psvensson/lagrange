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
| core | manual | 29 | 2327 |
| architecture | generated | 110 | 3699 |
| testing | generated | 97 | 4097 |
| style | generated | 8 | 209 |
| governance | generated | 80 | 3422 |

## Notes

- `rules.json` is the complete generated domain source with IDs and citations.
- `core.md` is manually curated so the always-load contract stays memorable.
- Domain Markdown packs are generated and compact for prompt loading.
