# Style Steering Pack

Load for coding-style and lint policy enforcement.

Generated rules: 23
Estimated tokens: 594
Domains: style

## Rules

1. [STYLE-0001] NEVER introduce eslint override comments!
2. [STYLE-0002] Do not defer guideline conformance to a follow-up.
3. [STYLE-0003] All code must be written with ESLint rules in mind from the start.
4. [STYLE-0004] There must be just one way of doing something.
5. [STYLE-0005] There must be no legacy or fallback code.
6. [STYLE-0006] Every completed change must pass a self-review against doctrine.md and the system guidelines (system guidelines.md).
7. [STYLE-0007] Do not allow several ways to define a property (like m.typ and m.operation, m.foo.t, et.c.) simplify and unify logic Collect all scalars into constants that can be imported and only defined once Do not use strings and number directly in the code, but import them from files containing constants
8. [STYLE-0008] Indentation: Use 2 spaces (not tabs)
9. [STYLE-0009] Quotes: Use single quotes for strings
10. [STYLE-0010] Semicolons: Always include semicolons at end of statements
11. [STYLE-0011] Line Length: Maximum 100 characters per line
12. [STYLE-0012] Unused Variables: Prefix unused function parameters with underscore (e.g., _unused)
13. [STYLE-0013] Ensure all new code follows the linting rules above
14. [STYLE-0014] Break long lines appropriately to stay under 100 characters
15. [STYLE-0015] Use consistent formatting with existing codebase patterns
16. [STYLE-0016] Zero duplication - Confirm no new parallel implementation, shadow state, or duplicated logic was introduced. Re-check the verification checklist in §1.5 of the system guidelines.
17. [STYLE-0017] Single owner - Confirm every new piece of state, every row mutation, and every field write is routed through its canonical owner.
18. [STYLE-0018] No magic values - Confirm all scalars are named constants imported from the appropriate constants file.
19. [STYLE-0019] Single naming - Confirm no new synonyms were introduced for existing concepts.
20. [STYLE-0020] Communication paths - Confirm messages go through the MessageRouter and data-plane traffic uses Message Group transport.
21. [STYLE-0021] Cache discipline - Confirm no new ad-hoc caches or shadow copies of system data were created outside SystemTableCache.
22. [STYLE-0022] Error handling - Confirm no swallowed errors or try/catch control flow.
23. [STYLE-0023] Architecture docs - If the change affects system behavior, confirm architecture.md is updated.
