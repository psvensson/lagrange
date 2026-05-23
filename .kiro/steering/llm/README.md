# Steering LLM Pack

This directory contains curated and generated low-token steering artifacts.

Generation command:

```bash
npm run steering:llm:pack
```

Recommended load strategy:

1. Load `lite.md` for a 30-second cold-start checklist.
2. Always load `core.md` for non-trivial implementation work.
3. Load one domain pack based on task:
   - `architecture/INDEX.md` for runtime/control-plane/bootstrap/join/rebalance work
   - `testing.md` for test design and regression policy
   - `style.md` for lint/style/naming policy
   - `governance.md` for roadmap/scope checks
4. Use `rules.json` when you need IDs + source traceability.

## Pack Sizes

| Pack | Mode | Rules | Estimated Tokens |
| --- | --- | ---: | ---: |
| core | manual | 7 | 946 |
| architecture | generated | 107 | 3674 |
| testing | generated | 97 | 4153 |
| style | generated | 10 | 294 |
| governance | generated | 80 | 3378 |

## Notes

- `lite.md` is a manual must-not checklist for cold starts and template choice.
- `rules.json` is the complete generated domain source with IDs and citations.
- `core.md` is manually curated so the always-load contract stays memorable.
- Domain Markdown packs are generated and compact for prompt loading.
