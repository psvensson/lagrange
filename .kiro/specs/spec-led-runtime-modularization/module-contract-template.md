# Module Contract Template

Use this template before implementing any replacement module.

## Contract Status

Package:

Frozen before runtime edit:

Spec owner:

## Owner

Name:

Boundary:

Existing runtime files:

New module files:

## Scalar And Variant Owners

| Value or variant family | Owner constant/module | Runtime import path | Notes |
| --- | --- | --- | --- |
|  |  |  |  |

Every string, number, boolean policy value, `null`-like condition, and
`undefined`-like condition used by the runtime contract must be represented by a
named owner value. Runtime packages must not use raw `null` or `undefined` to
encode domain state.

## Canonical Inputs

1. Input:
   Owner:
   Shape:
   Freshness or revision:

## Forbidden Inputs

1. Raw evidence that must not be read:
   Reason:

## Absence Semantics

| Missing or stale signal | Named variant | Allowed meaning | Forbidden interpretation |
| --- | --- | --- | --- |
|  |  |  |  |

## Normalized Evidence

```js
const evidence = Object.freeze({
  ownerKey,
  sourceRevision,
  observedState,
  blockingSignals,
  timingSignals,
  pressureSignals,
});
```

Replace this sketch with the actual contract for the package. Every field must
have a named owner, explicit variant set, and freshness or revision rule.

## State Vocabulary

1. `state_name`
   Meaning:
   Terminal:
   Retryable:
   Emits effect:

## Decision Table

Totality rule:

Default behavior when evidence is outside contract:

| Priority | State | Evidence predicate | Outcome | Reasons |
| ---: | --- | --- | --- | --- |
| 1 |  |  |  |  |

## Outcome Shape

```js
const outcome = Object.freeze({
  owner,
  boundary,
  state,
  nextRequiredAction,
  effectCommand,
  reasons,
  correlationKey,
  sourceRevision,
});
```

If no runtime effect is required, use a named no-effect command from the owner
contract.

## Effects

| Effect command | Allowed executor | Idempotency key | Retry owner |
| --- | --- | --- | --- |
|  |  |  |  |

## Consumers

Allowed:

Forbidden:

## Legacy Deletion

Delete or block:

Structural guard:

Tail consumers:

## Proof

1. Decision table fixture:
2. Owner adapter test:
3. Consumer test:
4. Representative proof:
5. Static guardrails:
6. Work tracker validation:
7. Diff hygiene:
