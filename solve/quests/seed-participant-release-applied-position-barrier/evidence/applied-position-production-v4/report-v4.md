# Applied-position production V4 HC freeze

## Binding

- Mutable worktree HEAD: `eda09027839a06b1d25cfa28dd06c894c1523574`.
- Preserved V3 source commit: `7a755cf833b342c275ff5138e087a97832e28c2d` / src `f414d6384776c04dfdaf7be70f84ce782bdd796d`.
- Complete V3 review: `4169231929e4346cdceb349773c55d21c80f68b51a454b77d41831680f989989`.
- No behavioral or lab test, metadata refresh, Quest edit, commit, or push was performed.

## Correction

Only `src/node/replica-runtime-cleanup-custody.js` changed. The existing cleanup owner now appends service and final observation cleanup failures by defining each bounded numeric own property. It no longer depends on mutable `Array.prototype.push`, spread, or Array iteration.

The final aggregate receives a dedicated bounded iterable whose own captured `Symbol.iterator` yields the exact retained values by index. The `AggregateError` constructor is captured at module load. Exact causes, including thrown `null`, therefore remain present and ordered in the existing shutdown rejection even when Array push or iteration is replaced. The existing pre-await observation cancellation, final retry, service custody, Promise rejection/reset, lifecycle state, deadlines and resource owners are unchanged.

## Scope and evidence

`source-manifest-v4.sha256` binds the full seventeen-source-plus-impact scope. `v3-preservation-v4.log` proves the other seventeen paths are byte-identical to V3. HC changed from `24fd2fae358dab21be3517b00a688570b44730c827b6e32fa4f04f9d86d206b5` to `4503564fd10384fc63fafed6e7ac8363fdbd8abf09a4f1ace11e3084774101d0`.

Syntax, exact ESLint, scoped cognitive complexity, scoped literals, dependency cycles and diff check pass. Scoped cyclomatic checking retains the same inherited `fenceFailedReplicaCreateRuntime` complexity 14 finding recorded by V3; no new function is reported and no baseline changed. HC is 169 lines, below the source threshold. Behavioral acceptance remains pending independent review and locked evidence.
