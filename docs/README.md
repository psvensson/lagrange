---
audience: human
---

# Documentation Index

This is the human documentation index for people evaluating, running,
integrating, or studying Lagrange. It contains product concepts, tutorials,
operator guidance, and architecture. Development workflow is deliberately kept
in the separate [contributor documentation](development/README.md).

## Start Here

- [Start Here](start-here.md) - choose a first-hour, service-development, or
  architecture-learning path
- [Current Capabilities And Limitations](current-capabilities-and-limitations.md)
  - the authoritative human-readable implementation status
- [Distributed-Systems Primer](distributed-systems-primer.md) - the concepts
  Lagrange assumes, explained using Lagrange examples
- [Vocabulary](vocabulary.md) - exact relationships between tables,
  partitions, replicas, Artifacts, Bindings, Cells, and metadata
- [First Hour With Lagrange](tutorials/first-hour.md) - start a node, query it,
  inspect placement, and invoke a genuine WASI request Binding

## Build And Integrate

- [Service Deployment Guide](service-deployment-guide.md) - the supported
  Artifact / Binding / Cell path, including authoring the component in
  JavaScript with ComponentizeJS
- [component-distribution.md](component-distribution.md) - how components are
  distributed across nodes
- [PostgreSQL Wire And SQL Compatibility](../architecture/postgres-wire.md) -
  connection security and the measured compatibility slice
- [Runnable Examples](../examples/README.md) - examples labelled by whether
  they use the public deployment path, built-ins, or legacy substrate

## Operate Lagrange

- [admin-api-reference.md](admin-api-reference.md) - admin API actions,
  diagnostics endpoints, and CLI message contract
- [bootstrap-readiness-probes.md](bootstrap-readiness-probes.md) - readiness
  probes during cluster bootstrap
- [listener-port-model.md](listener-port-model.md) - REST, admin, and transport
  listener configuration and validation
- [storage-capacity-operations.md](storage-capacity-operations.md) - storage
  capacity operations
- [latency-topology-operations.md](latency-topology-operations.md) - latency
  and topology operations
- [runtime-resource-diagnostics.md](runtime-resource-diagnostics.md) - runtime
  resource diagnostics
- [adaptive-timing-resource-diagnostics-runbook.md](adaptive-timing-resource-diagnostics-runbook.md)
  - operator runbook for adaptive timing diagnostics
## Understand The Architecture

- [Architecture Index](../architecture/INDEX.md) - canonical current-system
  entry point
- [The Lagrange System Model](../architecture/system-model.md) - the shortest
  conceptual explanation
- [Process Walkthroughs](../architecture/INDEX.md#start-here) - partitioning,
  replication, rebalancing, request routing, and data affinity

For installation from the repository root, see [README.md](../README.md).
People changing Lagrange itself should use
[docs/development/README.md](development/README.md); none of that process
material is required to use the product.
