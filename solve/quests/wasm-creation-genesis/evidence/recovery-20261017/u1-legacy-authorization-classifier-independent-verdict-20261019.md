# Independent source verdict: legacy REMOVE observation classifier extraction

Reviewer: `subagent:/root/lab_recovery`. Date: 2026-10-19.  
Disposition: **APPROVE the exact bounded source refactor below.**  
Review mode: full-file source comparison and semantic inspection; no behavioral execution, source/test edit, or remote mutation by this reviewer.

## Exact subject

| Input | Bytes | SHA-256 |
| --- | ---: | --- |
| Formatted base `src/control-plane/replica-dispatch-service.js` | 6,052 | `bd4bedd19c06e0ffea3b2c7e03d23a4d31f1cd5c61f30b847866a5a701021398` |
| Draft `/workspace/scratch/580a63fb23ca/u1-legacy-authorization-classifier-draft.js` | 6,398 | `69159b5ecad787cb0131cceb1a6272e89280e397082491eefaaeddd8e73f9fcd` |
| Unchanged strict consumer test `test/control-plane/replica-dispatch-reservation-identity.test.js` | 9,269 | `0dd845ca42bcdbb3db8851fd610df077438ca145bf15c43d8a039d091be86b17` |
| Existing workflow predicate owner `src/rebalancer/replica-operation-step-policy.js` | 20,720 | `1cc0143211472e7949f16b9497ebae2e243fafc60ba1dcc6ffb53200c2ead4b1` |

The complete diff adds two unexported functions in the same module and replaces the public method's post-read classifier with their synchronous invocation. Imports, inheritance, exports, lifecycle methods and all other file content are unchanged. The base already contains the required braces; this verdict approves the subsequent extraction, not a gate exception or a change to that formatting requirement.

## Predicate order and identity are preserved

`matchesLegacyRuntimeRemoval` contains the original eight conjunction terms in their original left-to-right order:

1. Exact original operation ID.
2. Exact REMOVE operation type.
3. Exact runtime-service entity type.
4. Exact logical entity ID.
5. Exact replica ID.
6. Exact target node ID.
7. Workflow step is not PENDING.
8. The existing `isIncompleteOperationRowStep(operation.type, operation.workflowStep)` owner admits the row's type and step.

The explicit PENDING exclusion remains before the existing policy call; the extraction does not replace it with the policy alone. Strict equality, enum sources and short-circuit behavior are unchanged. After an earlier mismatch, no later operation property is read. When the full predicate is reached, `operation.type` and `operation.workflowStep` are each reread for the policy call exactly as before, in the same argument order. This preserves observable getter order and errors, including unusual rows with stateful accessors.

The target object passed to the helper contains only values already captured by the public method's original parameter destructuring. It is a fresh ordinary object with own data properties, does not reacquire the inbound request, and is not retained. Values, including object identity if a malformed caller supplied objects, are passed unchanged. Neither helper reads `this`, and the imported workflow predicate remains the same unbound function invocation. No cache, plan, observer, request ID or authority is created.

## Read interaction and exception boundaries are preserved

The public method retains its original signature and default parameter. In particular, omitted/undefined input still uses the empty object, and invalid destructuring inputs have the same behavior before the method body.

The lookup of `this.rebalanceCoordinator?.repository` and the `typeof repository?.queryAuthoritativeOperationVisibilityObservation` check remain outside the catch. A missing or non-callable read method still returns the same UNAVAILABLE outcome. Exceptions in those earlier property accesses are not newly converted into typed unavailability.

Inside the unchanged try block, the repository method remains invoked as a property call on `repository`, preserving its receiver. It receives the original `operationId` and exactly these options:

```js
{
  authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
  requireAbsenceConfirmation: true,
}
```

There is still one awaited read. A synchronous call failure, rejected promise, or await/thenable assimilation failure remains caught and returns UNAVAILABLE. The potentially accessor-backed repository method is still checked once before the try and accessed again for the call inside it; the extraction does not silently cache or rebind that method.

Crucially, `classifyLegacyRuntimeRemoval` is called **after** the catch. Accessing `observation.operation`, `observation.deferredOutcome`, any operation property, or invoking the workflow predicate can therefore reject the async method as before. Such an exception is not swallowed or rewritten as an unavailable-owner answer. The extra helper stack frames are a normal diagnostic consequence of extraction; the thrown value and catch boundary are unchanged.

## Outcome mapping is unchanged

| Completed read observation | Original and extracted result |
| --- | --- |
| Missing/falsy operation and truthy `deferredOutcome` | `{outcome: LEGACY_AUTHORITY.UNAVAILABLE}` |
| Missing/falsy operation without truthy `deferredOutcome` | `{outcome: LEGACY_AUTHORITY.CONTENT_CONFLICT}` |
| Present/truthy operation satisfying all eight terms | `{outcome: LEGACY_AUTHORITY.ADMITTED}` |
| Present/truthy operation failing any term | `{outcome: LEGACY_AUTHORITY.CONTENT_CONFLICT}` |

The operation is read once by the classifier. `deferredOutcome` is read only when that operation is falsy, preserving the prior conditional access. A truthy operation continues to take the row predicate path even if the observation also contains a deferral field. No new code, carrier field, exception type, absence inference or CREATE authority appears.

The classifier performs no await, promise construction, side effect or additional repository read. Its only collaborators are the existing constants and workflow predicate. This is extraction of existing decisions from the dispatch method, not a second semantic owner for the observed operation.

## Test and gate scope

The strict consumer test remains byte-identical to the independently approved `u1-strict-legacy-read-contract-independent-approval-20261019.md` subject. Its exact original read-ID, OWNER_RPC_REQUIRED and requireAbsenceConfirmation assertions remain, along with its six typed observation cases. Its documented ceiling also remains: it is a dispatch consumer witness with a scripted repository seam, not execution of actual owner RPC or native successor safety.

Root reports that the draft passes syntax/ESLint and decision-boundary scanning. This reviewer did not execute those tools or behavioral tests and does not transfer their report into a measured runtime claim. The normal staged checks and immutable positive lab publication remain root's next gates. No threshold, hook, classification policy or test assertion is waived by this approval.

**Final disposition:** the draft at `69159b5ecad787cb0131cceb1a6272e89280e397082491eefaaeddd8e73f9fcd` preserves the formatted base's authorization behavior and error propagation. No revision is required before applying this exact refactor through the normal checks. This verdict does not accept combined U1, its separate missing controls, or U2.
