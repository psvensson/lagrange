# Lite Steering

Thirty-second checklist for cold starts. Use this to choose the first tool and
template, then load `core.md` and the domain pack named by `work:context`.

## Must Not

1. Do not skip `npm run work:context` for non-trivial implementation work. See `work/RULES.md#validator-phases`.
2. Do not edit without a bounded package when implementation truth, roadmap status, or architecture ownership changes. See `work/RULES.md#lane-definitions`.
3. Do not choose a heavy lane when read-doc or maintenance proof is enough. See `work/RULES.md#lane-definitions`.
4. Do not use raw JSON, raw logs, broad search, or ad hoc `jq` before canonical workflow tools. See `work/RULES.md#proof-requirements`.
5. Do not write runtime/domain scalars inline; use named constants or ingress normalization. See `work/RULES.md#coding-constraints`.
6. Do not encode runtime state with `null` or `undefined`; use explicit variants. See `work/RULES.md#coding-constraints`.
7. Do not implement semantic decisions as independent branch piles; collect evidence and emit one canonical outcome. See `work/RULES.md#coding-constraints`.
8. Do not let callers reproduce owner logic locally; owners decide and caches observe. See `work/RULES.md#coding-constraints`.
9. Do not weaken guardrails, scripts, allowlists, or scan scope to make proof pass. See `work/RULES.md#proof-requirements`.
10. Do not close a package without closure validation, focused commit, push, and ledger proof. See `work/RULES.md#proof-requirements`.

## Template Picker

- Docs only: `work/templates/doc-only-package.md`.
- One file, no runtime contract: `work/templates/single-file-maintenance-package.md`.
- Small tooling/template/test maintenance: `work/templates/lightweight-maintenance-package.md`.
- Runtime owner boundary, scenario gate, or architecture work: use the full package tools and templates.
