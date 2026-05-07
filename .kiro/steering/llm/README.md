# Steering LLM Pack

This directory contains generated low-token steering artifacts.

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

| Pack | Rules | Estimated Tokens |
| --- | ---: | ---: |
| core | 48 | 1678 |
| architecture | 140 | 4855 |
| testing | 120 | 4241 |
| style | 21 | 489 |
| governance | 41 | 1567 |

## Notes

- `rules.json` is the complete machine-readable source with IDs and citations.
- Markdown packs are intentionally compact for prompt loading.
