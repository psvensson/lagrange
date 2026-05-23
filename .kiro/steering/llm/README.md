# Steering LLM Pack

This directory contains curated and generated low-token steering artifacts.

Generation command:

```bash
npm run steering:llm:pack
```

Recommended load strategy:

1. Use this README as the index only.
2. Load `boot.md` for precedence, lane vocabulary, and per-lane first commands.
3. Load `lite.md` only when a 30-second must-not checklist is useful.
4. Always load `core.md` for non-trivial implementation work.
5. Load one domain pack based on task:
   - `architecture.md` for runtime/control-plane/bootstrap/join/rebalance work
   - `testing.md` for test design and regression policy
   - `style.md` for lint/style/naming policy
   - `governance.md` for roadmap/scope checks
6. Use `rules.json` when you need IDs + source traceability.

## Pack Sizes

| Pack | Mode | Rules | Estimated Tokens |
| --- | --- | ---: | ---: |
| core | manual | 7 | 946 |
| architecture | generated | 107 | 3674 |
| testing | generated | 97 | 4153 |
| style | generated | 10 | 294 |
| governance | generated | 80 | 3378 |

## Notes

- `boot.md` is the manual LLM precedence and lane-routing contract.
- `lite.md` is a manual must-not checklist for cold starts and template choice.
- `rules.json` is the complete generated domain source with IDs and citations.
- `core.md` is manually curated so the always-load contract stays memorable.
- Domain Markdown packs are generated and compact for prompt loading.
