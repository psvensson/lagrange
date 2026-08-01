# Examples

Six runnable examples, ordered from no-rewrite compatibility to the full
data-local execution story. Each
directory has its own README with step-by-step commands, a plain-language
introduction to the problem it addresses, and references for every concept
beyond basic programming.

## The Problem Lagrange Works On

Most applications keep code and data in different places. The application tier
runs on one set of machines; the database runs on another. Every piece of
business logic that needs data must pull that data across the network, work on
it, and often push results back:

```mermaid
%%{init: {'theme':'base','themeVariables':{'background':'#ffffff','lineColor':'#334155','textColor':'#0f172a'}}}%%
flowchart LR
  subgraph APP["Application tier"]
    S["Service replica<br/>(business logic)"]:::svc
  end
  subgraph DB["Database tier"]
    P1["Partition 1"]:::data
    P2["Partition 2"]:::data
    P3["Partition 3"]:::data
  end
  C["Client"]:::ctrl --> S
  S -- "queries" --> P1 & P2 & P3
  P1 & P2 & P3 -- "rows, aggregates,<br/>intermediate results" --> S
  S -- "writes, decisions" --> P1

  classDef data fill:#dbeafe,stroke:#1e40af,color:#0b2545
  classDef svc fill:#dcfce7,stroke:#166534,color:#052e16
  classDef ctrl fill:#fef3c7,stroke:#b45309,color:#451a03
```

That round-tripping is often the dominant cost of a data-heavy operation: rows
cross the network only to be filtered, scored, or aggregated and mostly thrown
away.

**Lagrange is an experimental distributed database that inverts this: it moves
the function to the data.** It partitions and replicates tables (like a
distributed SQL database), and it can also run small, sandboxed pieces of
application code — and place that code on the machines that hold the data the
code actually uses:

```mermaid
%%{init: {'theme':'base','themeVariables':{'background':'#ffffff','lineColor':'#334155','textColor':'#0f172a'}}}%%
flowchart LR
  C["Client"]:::ctrl --> SEL["data selector + function"]:::move
  SEL --> W1["Partition 1<br/>local work"]:::data
  SEL --> W2["Partition 2<br/>local work"]:::data
  SEL --> W3["Partition 3<br/>local work"]:::data
  W1 & W2 & W3 -- "compact partial results" --> R["Reducer"]:::svc
  R --> C

  classDef data fill:#dbeafe,stroke:#1e40af,color:#0b2545
  classDef svc fill:#dcfce7,stroke:#166534,color:#052e16
  classDef ctrl fill:#fef3c7,stroke:#b45309,color:#451a03
  classDef move fill:#ede9fe,stroke:#6d28d9,color:#2e1065
```

The overview of this idea, its current status, and honest limits is the
top-level [project README](../README.md). The conceptual deep-dive is
[The Lagrange Native Programming Model](../docs/native-programming-model.md),
and the complete before-and-after walkthrough is
[Rewrite A Hot Path For Lagrange](../docs/tutorials/rewrite-a-hot-path.md).

## Where WebAssembly Fits (a two-minute primer)

Running someone's code *inside* a database cluster raises an obvious question:
how do you do that safely, for more than one programming language?

Lagrange's answer is [WebAssembly](https://webassembly.org/) (**WASM**): a
small, portable binary format that many languages (Rust, C, JavaScript, Go,
and others) can compile to. WASM was originally built so browsers could run
non-JavaScript code safely; the same properties make it attractive on servers:

- **Sandboxed by default.** A WASM module cannot open files, sockets, or
  processes. It can only call functions the host explicitly hands it.
- **Portable.** The same binary runs on any machine with a WASM runtime,
  regardless of OS or CPU.
- **Language-neutral.** The host does not care what language produced the
  binary.

Two related terms appear throughout these examples:

- [**WASI**](https://wasi.dev/) — a standard set of interfaces for running
  WASM *outside* a browser.
- The [**Component Model**](https://component-model.bytecodealliance.org/) — a
  packaging standard on top of WASM. A *component* declares typed imports
  (functions it needs from the host) and exports (functions it offers), in an
  interface language called
  [WIT](https://component-model.bytecodealliance.org/design/wit.html). This is
  what lets Lagrange give a service exactly three host functions — `read`,
  `write`, `capability` — and nothing else.

For Lagrange this sandbox is not a detail; it is the security model. A
deployed service receives *declared capabilities* instead of database
credentials and open network access. If the code tries to touch a table it did
not declare, the call fails at the component boundary.

## Choosing An Example

Two different questions lead to different examples:

1. **How do I package and deploy code into Lagrange?** Start with the
   request-binding examples. They teach the Artifact / Binding / Cell
   deployment surface and the current public `lagrange:cell/context` API.
2. **What actually improves when work moves to the data?** Read the MovieLens
   example (`service-data-affinity`). It compares a strong conventional
   baseline against shard-local execution with bounded reduction.

```mermaid
%%{init: {'theme':'base','themeVariables':{'background':'#ffffff','lineColor':'#334155','textColor':'#0f172a'}}}%%
flowchart TD
  Q1{"What do you want<br/>to understand?"}:::ctrl
  Q1 -- "Can my existing app<br/>connect unchanged?" --> SP["service-portability<br/><i>compatibility, no rewrite</i>"]:::svc
  Q1 -- "How is code deployed<br/>and sandboxed?" --> RB["request-binding-deployment<br/><i>WASI component from WAT</i>"]:::move
  RB --> JS["js-request-binding-deployment<br/><i>same path, plain JavaScript</i>"]:::move
  Q1 -- "What does data-local<br/>execution buy?" --> DA["service-data-affinity<br/><i>MovieLens three-way comparison</i>"]:::data
  Q1 -- "How do partitions run<br/>callback logic? (legacy)" --> DS["distributed-sql<br/><i>older callback surface</i>"]:::data
  Q1 -- "How do I expose services<br/>in Kubernetes?" --> K8["kubernetes-endpoint-sync-controller"]:::svc

  classDef data fill:#dbeafe,stroke:#1e40af,color:#0b2545
  classDef svc fill:#dcfce7,stroke:#166534,color:#052e16
  classDef ctrl fill:#fef3c7,stroke:#b45309,color:#451a03
  classDef move fill:#ede9fe,stroke:#6d28d9,color:#2e1065
```

Deployment always goes through the Artifact / Binding / Cell surface:
`INSTALL SERVICE` and `CREATE BINDING` statements sent over the SQL ingress.
The design is specified in
[`architecture/minimal-deployment-surface.md`](../architecture/minimal-deployment-surface.md)
and the operator flow in the
[Service Deployment Guide](../docs/service-deployment-guide.md). Three terms
recur everywhere:

- **Artifact** — immutable, digest-pinned service code plus its manifest.
- **Binding** — an immutable declaration connecting one Artifact export to an
  invocation source (for example, an HTTP request route).
- **Cell** — a ready, running, replaceable instance derived from a Binding.
  The cluster — not the author — decides where Cells run.

## The Examples

### [request-binding-deployment/](request-binding-deployment/README.md)

Builds a genuine WASI component from committed
[WebAssembly text](https://developer.mozilla.org/en-US/docs/WebAssembly/Guides/Understanding_the_text_format)
source, deploys it with `INSTALL SERVICE` / `CREATE BINDING` /
`CONFIGURE SERVICE ACCESS`, and shows matched, denied, and unmatched HTTP
requests behaving against a ready Cell.

Answers: **how is a sandboxed Artifact installed and invoked, and what happens
when it oversteps its declared access?** It does not claim a public fan-out or
reduction API.

- **You'll need**: Node.js 22.12+, repository dependencies, and
  [`wasm-tools`](https://github.com/bytecodealliance/wasm-tools) on `PATH`.

### [js-request-binding-deployment/](js-request-binding-deployment/README.md)

The same public deployment path, but the component is compiled from plain
JavaScript with
[ComponentizeJS](https://github.com/bytecodealliance/ComponentizeJS). The
service imports only:

```js
import {read, write} from 'lagrange:cell/context';
```

No connection string, no node addresses, no shard awareness. **This is the
best API introduction for service authors today.**

- **You'll need**: Node.js 22.12+ and repository dependencies; no `wasm-tools`
  binary is required.

### [service-portability/](service-portability/README.md)

Runs one ordinary Node.js/[`pg`](https://node-postgres.com/) application image
unchanged against stock PostgreSQL and against Lagrange's PostgreSQL
wire-protocol listener: exact result parity, password authentication, verified
TLS, and fail-closed credential attacks.

Answers: **can an existing PostgreSQL application talk to Lagrange without a
rewrite?** This is deliberately the compatibility end of the adoption ladder —
no WASM involved.

- **You'll need**: Docker and Node.js 20+.

### [distributed-sql/](distributed-sql/README.md)

Copyable partition-callback examples run against a live node by a
manifest-driven runner. This is the **older, pre-Binding surface**, kept for
understanding partition-local execution mechanics; the sixth example is a
JavaScript-envelope lifecycle rehearsal, *not* a real WebAssembly component.
[Current Capabilities And Limitations](../docs/current-capabilities-and-limitations.md)
is the status authority.

- **You'll need**: a running Lagrange node (`npm start` from the repository
  root).
- The per-example `index.js` files are callback modules loaded by the runner,
  not standalone programs; `node index.js` does nothing on its own.

### [service-data-affinity/](service-data-affinity/README.md)

The flagship comparison. Computes the same
[MovieLens 100k](https://grouplens.org/datasets/movielens/100k/) top-ten
ranking three ways — PostgreSQL grouped SQL, Lagrange distributed grouped SQL,
and a replicated Lagrange service applying shard-local ranking policy with
bounded top-N reduction — and shows placement converging toward the data.

Answers: **what can disappear when a hot path is rewritten for partition-local
work and bounded reduction?** Note its honest boundary: it drives the
kernel-internal `native_js` substrate, not yet a public `call`/`pushdown`
Binding.

- **You'll need**: Docker for PostgreSQL and internet access for the first
  dataset download; Lagrange nodes run as local processes.

### [kubernetes-endpoint-sync-controller/](kubernetes-endpoint-sync-controller/README.md)

A small controller that mirrors Lagrange's canonical service-endpoint metadata
into Kubernetes
[`Service` + `EndpointSlice`](https://kubernetes.io/docs/concepts/services-networking/endpoint-slices/)
objects, with a [Helm](https://helm.sh/docs/) chart. For operators connecting
a Lagrange cluster to Kubernetes-native networking.

- **You'll need**: nothing for rendering the chart (`helm template`); a
  running Lagrange node plus Kubernetes credentials for the live modes.
