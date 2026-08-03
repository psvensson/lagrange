---
audience: development
documentClass: planning
---

# Brief: HTTP Endpoint To Distributed Call Composition

> Implementation brief from Peter, 2026-08-03, preserved verbatim below.
> It is the acceptance authority for the Quests that implement the
> request-to-call composition bridge. Related planning:
> `docs/development/cluster-owned-artifacts-parallel-dispatch-brief.md`
> (the landed prerequisite work this composes with). Note: the brief's
> final documentation items on em-dash removal and the doc style guard
> were already landed ahead of this brief (audit:doc-ascii).

---

Implement the missing bridge that lets a WASM request handler invoke a named
data-local Call Binding.

The intended developer experience is one logical service containing:

* an HTTP request handler;
* one or more partition-local `run` functions;
* their reducers;
* a manifest declaring the exports;
* a request Binding exposing the endpoint;
* a call Binding declaring the data selector and distributed operation.

The complete path should look like this:

```text
POST /accounts/summary
        |
        v
request Binding
        |
        v
handleRequest() in a WASM Cell
        |
        | callBinding("account-summary", arguments)
        v
existing CallCellInvoker
        |
        +-- run() beside partition A
        +-- run() beside partition B
        +-- run() beside partition C
        |
        `-- reduce() -> final JSON
        |
        v
HTTP response
```

Do not implement a new distributed execution mechanism. The request handler
must enter the existing `CallCellInvoker` path, with the existing routing,
activation, bounded parallel dispatch, topology fencing, reduction leases,
and atomic final result.

Read `AGENTS.md`, the relevant architecture documents, and the current
Solver instructions before editing anything.

## Product Contract

A developer should be able to author something close to:

```js
import {
  callBinding,
  emit,
} from 'lagrange:cell/service-context';

export function handleRequest(requestJson) {
  const request = JSON.parse(requestJson);

  try {
    const result = callBinding(
      'account-summary-inner',
      JSON.stringify({
        accountId: request.body.accountId,
      }),
    );

    return JSON.stringify({
      status: 200,
      headers: [['content-type', 'application/json']],
      body: result,
    });
  } catch (error) {
    return JSON.stringify(mapCallFailureToHttp(error));
  }
}

export function run(batch, argumentsJson) {
  const {accountId} = JSON.parse(argumentsJson);

  let count = 0;
  let total = 0;
  let shardKey = null;

  for (const row of batch) {
    if (integerColumn(row, 'account_id') !== accountId) continue;

    const id = integerColumn(row, 'id');
    const amount = integerColumn(row, 'amount_cents');

    if (id === null || amount === null) continue;

    shardKey = shardKey === null ? id : Math.min(shardKey, id);
    count += 1;
    total += amount;
  }

  if (count > 0) {
    emit(`count:${shardKey}`, JSON.stringify(count));
    emit(`total:${shardKey}`, JSON.stringify(total));
  }

  return JSON.stringify({count});
}

export function reduce(partials, argumentsJson) {
  const {accountId} = JSON.parse(argumentsJson);

  let transactions = 0;
  let totalCents = 0;

  for (const [key, valueJson] of partials) {
    const value = JSON.parse(valueJson);

    if (key.startsWith('count:')) transactions += value;
    if (key.startsWith('total:')) totalCents += value;
  }

  return JSON.stringify({
    accountId,
    transactions,
    totalCents,
  });
}
```

The exact imported interface may differ after inspecting the ABI
constraints. Keep the conceptual surface small:

```text
callBinding(bindingName, argumentsJson) -> resultJson
```

The guest never supplies:

* a node;
* a partition;
* a replica;
* a package ID;
* a manifest digest;
* an export name;
* a SQL statement;
* placement policy.

It supplies only a declared, authorized Binding name and a bounded
arguments object.

## One Artifact, Two Bindings

Prove the complete flow with one immutable Artifact manifest containing at
least:

```json
{
  "exports": [
    {
      "name": "handle-request",
      "interface": "request_v1"
    },
    {
      "name": "run",
      "interface": "call_v1"
    }
  ]
}
```

Create two Bindings against that Artifact:

### Request Binding

```json
{
  "schema_version": 2,
  "name": "account-summary-http",
  "source": {
    "kind": "request",
    "method": "POST",
    "path": "/accounts/summary"
  },
  "target": {
    "package_id": "<same package>",
    "manifest_digest": "<same manifest>",
    "export_name": "handle-request"
  },
  "budgets": {
    "...": "request budgets"
  }
}
```

### Call Binding

```json
{
  "schema_version": 2,
  "name": "account-summary-inner",
  "source": {
    "kind": "call",
    "name": "account-summary-inner",
    "statement": "SELECT id, account_id, amount_cents FROM account_activity"
  },
  "target": {
    "package_id": "<same package>",
    "manifest_digest": "<same manifest>",
    "export_name": "run"
  },
  "budgets": {
    "...": "distributed call budgets"
  }
}
```

These may compile into separate Binding-derived service definitions and
separate Cell actuals. That is fine.

"One service" means one authored, versioned, installed Artifact and one
logical application boundary. It does not require the HTTP handler and
every partition execution to share one process or Cell instance.

Do not merge their service identities or bypass Binding-derived lifecycle
ownership.

## Extend The Authoring ABI

The current request world cannot initiate a distributed call. Add a typed
request-side host import for invoking a named Call Binding.

A suitable WIT shape is conceptually:

```wit
record binding-call-error {
  code: string,
  message: string,
  retryable: bool,
}

interface context {
  read: func(table: u32, key: u32) -> s32;
  write: func(table: u32, key: u32, value: s32);
  capability: func(capability: u32) -> s32;

  call-binding: func(
    name: string,
    arguments: string
  ) -> result<string, binding-call-error>;
}
```

Use a closed error enum instead of free-form `code` strings if the current
Component Model tooling handles that cleanly.

Requirements:

* old request components must continue to instantiate;
* old call components must continue to instantiate;
* a combined component must be able to import the request context and call
  context;
* host imports unavailable in the current invocation mode must fail closed;
* no invocation mode receives accidental authority merely because the
  component imports both interfaces.

The current worker chooses request imports or call imports exclusively.
Change this so a combined component can instantiate while each invocation
still gets only its authorized behavior.

For example:

* request invocation:

  * `read`, `write`, `capability`, and authorized `callBinding` may work;
  * `emit` and call-cell-only functions refuse.
* call invocation:

  * `emit` works under the existing call budgets;
  * request-table functions and request-side `callBinding` refuse unless
    separately designed and authorized.

Do not silently enable the existing call-cell `call-bounded` placeholder as
part of this work. Its semantics are not identical to request-to-Binding
invocation. Leave it denied unless a separate, explicit contract is
designed and tested.

## Bridge The Synchronous WASM Import To The Async Invoker

The distributed `CallCellInvoker` is asynchronous. The current WIT host
import is synchronous.

Do not block the Node.js main thread.

Implement a worker-to-parent host-call protocol:

```text
WASM worker
  callBinding(name, args)
        |
        | host-call request message
        v
WasiComponentCellRuntime on the parent thread
        |
        v
authorized request-call bridge
        |
        v
existing CallCellInvoker.invoke(...)
        |
        | result or typed failure
        v
shared response buffer + Atomics.notify
        |
        v
blocked WASM worker resumes
```

A practical implementation is:

1. The worker-side host import validates the name and argument bounds.
2. It sends a typed host-call request to the parent.
3. It waits using `Atomics.wait` in the worker thread.
4. The parent handles the request asynchronously.
5. The parent writes a bounded result or failure into a
   `SharedArrayBuffer`.
6. The parent wakes the worker with `Atomics.notify`.
7. The WIT host import returns the result or throws the typed WIT error.

Rules:

* never call `Atomics.wait` on the main thread;
* use named message types and a dedicated protocol owner;
* include a request ID so stale responses cannot satisfy a later call;
* permit only one outstanding host call per request Cell initially;
* bound every request and response buffer;
* clear and reset shared state between calls;
* detect worker termination and deadline expiry;
* never allow a late result to become visible to a later invocation;
* keep protocol parsing and buffer handling in one owner.

First verify whether the installed JCO and ComponentizeJS versions provide
a reliable asynchronous host-function mechanism for this ABI. Use it only
if there is executable proof that it preserves the same deadline,
cancellation, and error semantics. Do not assume that returning a Promise
from a synchronous WIT import works.

## Reuse The Existing Call Owner

Create a small request-to-call bridge owner. Its job is only to:

1. validate outbound call authority;
2. preserve the incoming identity and deadline;
3. normalize guest arguments;
4. delegate to the existing `CallCellInvoker.invoke`;
5. normalize the result or typed failure for the WASM host boundary.

It must not:

* plan partitions;
* execute SQL;
* route replicas;
* create Cells;
* publish activation leases itself;
* coordinate reduction;
* create a second `CallBindingRouteResolver`;
* call through PostgreSQL wire;
* call through HTTP;
* duplicate `CallCellInvoker`.

Conceptually:

```js
class RequestCellCallBridge {
  async invoke({
    sourceServiceId,
    targetBindingName,
    argumentsJson,
    securityContext,
    deadlineMs,
    callChain,
  }) {
    // authorize
    // validate recursion and budgets
    // delegate to the one CallCellInvoker
  }
}
```

Inject the bridge through the existing runtime composition.

A likely wiring path is:

```text
call-cell invocation bootstrap setup
        |
        +-- creates the canonical CallCellInvoker
        |
        `-- injects a delegate into WasmComponentDriver
```

Use a setter or factory pattern consistent with the existing Artifact
loader wiring. Do not introduce a global singleton.

## Preserve Security Context

The incoming HTTP request path already derives and verifies:

```text
tenantId
principal
roles
deadlineMs
```

Pass the full frozen security context into the request component
invocation. Do not pass only `tenantId`.

When the component invokes a Call Binding:

* preserve the same tenant;
* preserve the same principal;
* preserve the same roles for audit and downstream policy;
* do not trust any identity supplied by guest code;
* do not accept a target tenant from guest code;
* let the existing tenant-scoped Call Binding resolver resolve the name.

The service's outbound-call capability is separate from the human caller's
pgwire permission.

Do not require the HTTP caller to hold `pgwire.binding.call`. That is a
transport-specific permission for direct pgwire invocation.

Instead, authorize the nested call through the request service's durable
runtime policy.

## Add Durable Outbound Call Authorization

A request component must not be able to invoke every Call Binding in its
tenant.

Extend the existing service access policy so a request Binding declares an
allowlist of outbound Call Binding names.

Prefer one coherent contract such as:

```json
{
  "schema_version": 2,
  "binding_name": "account-summary-http",
  "tables": [],
  "calls": [
    {
      "binding": "account-summary-inner"
    }
  ]
}
```

Requirements:

* sorted and unique call targets;
* bounded target count;
* tenant-local names only;
* immutable normalized representation;
* stored with the request Binding's service identity;
* visible through the existing runtime-access policy read path;
* empty list means no outbound calls;
* absent policy means fail closed;
* unknown target means fail closed;
* no wildcards in the first version.

Use `CONFIGURE SERVICE ACCESS` rather than creating an unrelated side
channel, provided the existing ownership contract still makes the runtime
access policy owner the right single owner.

Bump the policy schema deliberately if its exact-field contract changes.
Update all fixtures, examples, normalization, stored-policy validation,
replay validation, and current documentation. Do not silently change
schema version 1 semantics.

At invocation time, authority is the intersection of:

```text
source request Binding policy allows target name
AND
target Call Binding exists in the same tenant
AND
target Binding is currently invocable
```

Observed calls never grant authority.

## Budget Composition

The nested call consumes both the request Binding's budget and the target
Call Binding's budget.

The effective deadline is:

```text
min(
  outer request deadline,
  target Call Binding deadline
)
```

Never start a fresh full timeout for the inner call.

Account for at least:

* serialized binding name;
* serialized argument bytes;
* serialized result bytes;
* host-call protocol metadata;
* time spent waiting for activation;
* shard execution;
* reduction.

Use the outer request Binding's `context_bytes` budget, or a clearly owned
sub-budget derived from it, for the nested-call request and response.

The target Call Binding continues enforcing its own:

* input budget;
* output budget;
* context budget;
* CPU budget;
* wall budget;
* shard batch bounds;
* partial bounds;
* parallelism bounds.

Start with a policy-owned maximum of one nested distributed call per HTTP
request. Make the limit a named constant or policy value. Do not allow an
arbitrary loop in guest code to create unbounded fan-out.

## Recursion And Cycles

Carry a bounded call-chain record through internal invocation metadata.

At minimum include:

```text
source service ID
source Binding version ID
target Binding name
depth
```

Refuse:

* a target already present in the chain;
* a depth above the configured maximum;
* direct self-invocation through the same Binding identity;
* malformed or guest-supplied chain metadata.

Guest code cannot supply or edit the call chain.

The first version may allow exactly:

```text
HTTP request Binding -> Call Binding
```

It does not need to support:

```text
HTTP -> Call A -> Call B -> Call C
```

## Failure Mapping

Expose stable, typed failures to the request component.

At minimum distinguish:

* target not allowed;
* target Binding missing or not invocable;
* invalid arguments;
* deadline or budget exhausted;
* target temporarily unavailable;
* target execution failed;
* recursion refused;
* response too large.

Each failure should include a stable classification:

```text
terminal
retryable
```

Do not expose raw stack traces, filesystem paths, node addresses, replica
IDs, SQL internals, or unbounded error messages to guest code.

The request handler can then map failures to HTTP responses, for example:

```text
not allowed            -> 403
invalid input          -> 400
deadline exhausted     -> 504
temporarily unavailable -> 503
target failed          -> 500
```

Lagrange should not hardcode the final HTTP status. The component owns its
endpoint response.

## Cancellation

The outer request deadline must stop new work in the nested call.

Pass the deadline into `CallCellInvoker.invoke`.

Where existing cancellation support is available, propagate the same
cancellation cause into:

```text
request runtime
-> request-call bridge
-> CallCellInvoker
-> shard dispatch
-> runtime receiver
-> WASM call Cells
```

If already-dispatched shard work cannot yet be interrupted, it may finish
invisibly, but:

* no new shards start after cancellation;
* no reduce starts after cancellation;
* no final result becomes visible to the HTTP handler;
* no late worker-buffer write satisfies another invocation.

Document any remaining cancellation limitation honestly.

## Invocation Identity And Replay

The nested call needs a system-owned child invocation identity derived from
the outer invocation identity plus a stable child ordinal.

Do not let guest code provide it.

For example:

```text
<outer invocation UUID>#call-1
```

Keep this grammar separate from the existing `#slot-N` and `#reduce`
identities, or extend the canonical identity parser in one owner.

A replayed HTTP request should return the journaled outer response without
invoking the inner Call Binding again.

Add executable proof for this.

## Combined WIT World

Add a committed authoring WIT world that proves one component can contain:

```text
handle-request
run
reduce
```

and import the request and call host interfaces it needs.

For example:

```wit
package lagrange:cell;

interface context {
  read: func(table: u32, key: u32) -> s32;
  write: func(table: u32, key: u32, value: s32);
  capability: func(capability: u32) -> s32;
  call-binding: func(
    name: string,
    arguments: string
  ) -> result<string, binding-call-error>;
}

interface call-context {
  // existing row and value types
  // existing emit contract
}

world service-cell {
  import context;
  import call-context;

  export handle-request: func(request: string) -> string;
  export run: func(batch: list<row>, arguments: string) -> string;
  export reduce: func(
    partials: list<tuple<string, string>>,
    arguments: string
  ) -> string;
}
```

Do not publish an API contract based only on a fixture. The world must
have:

* ABI tests;
* ComponentizeJS compilation proof;
* real worker instantiation proof;
* request invocation proof;
* call invocation proof;
* compatibility proof for existing request-only and call-only components.

Use the repository's canonical WIT location if one now exists. Otherwise
land the canonical authoring artifact as part of this work and update all
examples to import it instead of copying divergent fixtures.

## Required Integration Example

Upgrade the account-summary flagship example, or add one equally small
example, proving:

```text
POST /accounts/summary
-> handle-request
-> callBinding("account-summary-inner")
-> run on at least two partition hosts
-> reduce
-> one HTTP JSON response
```

The example must:

1. build one JavaScript source file into one WASM component;
2. install one immutable Artifact;
3. declare request and call exports in one manifest;
4. create one request Binding and one call Binding;
5. configure the request Binding to call only the inner Binding;
6. split data across at least two partitions;
7. expose a real HTTP endpoint;
8. invoke the endpoint with an authenticated request;
9. prove at least two shard runs overlap when hosted on separate nodes;
10. prove raw rows stay on their partition hosts;
11. prove only partials and the final result cross the call path;
12. return the reduced result as the HTTP response;
13. refuse an undeclared target before dispatch;
14. prove replay does not execute the inner call twice.

Keep a direct `CALL BINDING` assertion as well, so both public ingress
surfaces remain covered.

## Required Tests

### ABI and compatibility

Prove:

* existing request-only component still starts and runs;
* existing call-only component still starts and runs;
* combined component starts as a request Cell;
* the same combined component starts as a call Cell;
* request-only imports are refused during call execution;
* call-only imports are refused during request execution;
* host result errors map correctly through JCO.

### Worker bridge

Prove:

* successful call result;
* typed terminal failure;
* typed retryable failure;
* timeout while waiting;
* worker termination while waiting;
* stale response ignored;
* oversized result refused;
* malformed shared-buffer state refused;
* no main-thread blocking;
* only one outstanding host call initially;
* late completion cannot leak into the next request.

### Authorization

Prove:

* declared target works;
* undeclared target is refused before route resolution or dispatch;
* another tenant's Binding cannot be resolved;
* guest cannot substitute tenant or principal;
* wildcard-like names are refused;
* policy replay is byte-identical and idempotent;
* conflicting policy replay fails closed.

### Budgets

Prove:

* outer deadline wins when shorter;
* inner Binding deadline wins when shorter;
* argument bytes count against the outer host-call budget;
* result bytes count against the outer host-call budget;
* target Binding budgets still apply;
* budget failure prevents reduce result visibility.

### Runtime path

Prove the nested call uses:

```text
the canonical CallCellInvoker
the canonical CallBindingRouteResolver
the canonical activation lease owner
the canonical bounded shard dispatcher
the canonical reduce coordinator
```

Add guards against:

* direct SQL execution from the bridge;
* direct MessageRouter shard dispatch from the bridge;
* direct Cell creation;
* a second call scheduler;
* pgwire loopback;
* HTTP loopback.

### Failure and replay

Prove:

* one shard failure prevents reduce;
* incomplete partials never produce an HTTP result;
* outer request replay does not repeat the inner call;
* inner retry does not duplicate the visible final snapshot;
* request failure does not poison the target Call Cell when the error is
  classified as state-preserving.

## Documentation Changes

Update the README so the service code no longer floats without its
deployment definition.

Show the complete service in this order:

1. service manifest;
2. request handler, partition function, and reducer together;
3. request Binding;
4. call Binding;
5. service access policy;
6. HTTP invocation;
7. runtime distribution diagram.

Use the real account-summary example rather than introducing a second
fictional domain.

The top-level story should become:

```text
Write an HTTP handler, partition-local functions, and reducers together.
Deploy them as one WASM Artifact.
Lagrange exposes the endpoint and runs the data-heavy parts beside the
partitions holding the rows.
```

State the current mechanics precisely:

* HTTP ingress uses a request Binding;
* the request handler invokes an authorized call Binding through the host
  context;
* the call Binding owns the selector, budgets, and distributed operation;
* shard runs use bounded parallel dispatch;
* only partials move;
* the final reduced result returns through the HTTP handler.

Remove the old qualification saying HTTP handlers cannot initiate
distributed calls once this is landed.

Also remove all em dash characters from public-facing documentation and
replace them with normal hyphens. Add a documentation check covering at
least:

```text
README.md
docs/
examples/
roadmap.md
```

Do not rewrite historical Solver artifacts or generated records merely for
punctuation.

## Non-Goals

Do not add:

* a new HTTP router;
* arbitrary URL templates;
* a JavaScript client SDK;
* cross-tenant calls;
* wildcard outbound-call permissions;
* guest-selected SQL;
* guest-selected placement;
* guest-selected Artifact identity;
* arbitrary recursive service calls;
* managed OCI execution;
* structured reduce partials;
* a second call execution path;
* automatic authorization learned from observed calls.

Do not use this work to implement every future service trigger.

## Suggested Landing Order

1. Write and seal the product/architecture contract.
2. Add the outbound-call access-policy contract.
3. Add the canonical combined WIT authoring world.
4. Make worker host imports composable but invocation-mode restricted.
5. Add the worker-to-parent synchronous host-call protocol.
6. Add `RequestCellCallBridge`.
7. Wire the existing `CallCellInvoker` into the request runtime.
8. Pass full security context, deadline, and call-chain metadata.
9. Add budget, recursion, and failure mapping.
10. Add unit and ABI tests.
11. Add the multi-node HTTP-to-call integration proof.
12. Upgrade the flagship example.
13. Rewrite the README around the complete service definition.
14. Remove public-document em dashes and add the style guard.
15. Run every repository gate and obtain independent verification before
    landing.

## Done When

This work is done when an authenticated HTTP request can invoke one
deployed WASM service whose request handler calls an authorized data-local
operation from the same immutable Artifact, with:

* one request Binding;
* one call Binding;
* one durable outbound-call policy;
* partition-local execution on all selected shard hosts;
* bounded parallel shard dispatch;
* complete reduction;
* one HTTP response;
* inherited identity and deadline;
* no raw row movement before `run`;
* no duplicate visible result;
* no pgwire or HTTP loopback;
* no new call scheduler;
* compatibility with existing request-only and call-only components;
* current docs and examples showing the complete outer service.

The core invariant is:

> A request Cell may ask for an authorized named distributed operation. It
> never learns where that operation runs, and it never bypasses the one
> CallCellInvoker that already owns the distributed call.
