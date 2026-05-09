# Steering LLM Pack

This directory contains compact steering artifacts for prompt loading.

Recommended load strategy:

1. Always load `core.md`.
2. Load one domain pack based on task:
   - `architecture.md` for owner, boundary, and contract work
   - `testing.md` for validation and regression policy
   - `style.md` for naming and local code rules
   - `governance.md` for roadmap, package, and closure checks
3. Use the full steering source files one level up when source-level detail is
   needed.

The files are hand-curated for portability. Regeneration is intentionally left
to the receiving project.
