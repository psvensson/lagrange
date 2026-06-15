> EXAMPLE — illustrative only. Replace with this project's own content.

# Contract: <short invariant name>

A **system contract** records a durable, hard-won invariant so it cannot silently
regress. One contract = one invariant + one owner + one guard.

| Field | Value |
| --- | --- |
| `id` | `CONTRACT-###` |
| `invariant` | One falsifiable sentence that must always hold. |
| `owner` | The single component/path responsible for upholding it. |
| `authoritativeState` | The concrete row/epoch/projection that decides truth. |
| `allowedInputs` | Signals the owner may consume to decide. |
| `forbiddenInputs` | Signals that must NOT promote to truth (diagnostics only). |
| `guard` | The test or `tooling/validators/` checker that fails if violated. |
| `evidence` | Where the proof lives (test name, trace, model). |

## Why it exists

One or two sentences: what broke (or could break) without this invariant, and why
ordinary review kept missing it.

## How it is enforced

Point at the concrete guard. A contract with no guard is a wish — wire a test or a
checker so a regression turns red automatically.

## Related

- Closure records that exercised this invariant: `../ledger/records/CL-###.md`
- Steering rule(s) that cite it.
