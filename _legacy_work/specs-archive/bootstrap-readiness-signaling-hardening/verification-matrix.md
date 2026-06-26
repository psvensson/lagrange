# Verification Matrix

## Requirement-to-Test Mapping

| Requirement | Validation Type | Target Tests |
| --- | --- | --- |
| 1. Single readiness owner | Unit + component | new readiness state owner test file |
| 2. Probe endpoint contract | API unit/integration | `test/bootstrap/bootstrap-api.test.js` |
| 3. Bootstrap operation semantics | API unit | `test/bootstrap/bootstrap-api.test.js` |
| 4. Join retry contract | Unit/integration | `test/bootstrap/node-joining-service.test.js` |
| 5. Startup ordering and gating | Integration + harness | new entrypoint/seed readiness tests + harness tests |
| 6. Harness/integration parity | Integration + distributed | real-network join integration + harness startup gate tests |
| 7. Kubernetes/NGINX profile | Doc + smoke validation | deployment docs + optional e2e smoke |
| 8. Observability | Unit + integration | readiness event/metric tests |
| 9. Backward compatibility | Regression | legacy `/health` and existing join tests |

## Distributed Validation Runs

Minimum distributed checks:

1. pg baseline scenario with startup gate switched to lightweight readiness
   endpoint.
2. startup-gate diagnostics include reason codes and status histogram.
3. replay artifact includes readiness transition events.

Suggested commands:

```bash
npm test -- test/distributed/harness/__tests__/cluster.test.js --grep "bootstrap"
npm test -- test/integration/node-join-convergence-slo.integration.test.js
node test/distributed/run.js --config test/distributed/config/local-benchmark-3node.json \
  --scenario postgres-baseline-comparison --no-fast-local \
  --output test-output/postgres-baseline-size3-readiness-contract.report.json --verbose
```

## Rollout Gates

Gate 1: test contract complete

1. all new probe and retry tests pass.
2. no legacy bootstrap/join tests regress.

Gate 2: distributed harness stability

1. startup readiness errors are diagnosable and consistent.
2. no silent transition from transient success to join failure.

Gate 3: deployment readiness docs

1. Kubernetes probe profile published.
2. NGINX retry/health-check guidance published.
