/**
 * The statement a consumer that is NOT certification prints (formation
 * health, the seed budget gate, ship readiness, the GCP handoff streak, the
 * distributed matrix, a quest pass streak). Kept dependency-free so the
 * nightly trend's pre-push hook closure (scripts/checks/formation-health.js)
 * stays small; certification itself is owned by scenario-certification.js.
 */

const NOT_CERTIFICATION_EVIDENCE = Object.freeze({
  certificationEvidence: false,
  statement: 'NOT certification evidence: certification is a ' +
    '`certified: true` verdict from a `--certify <sha>` distributed harness ' +
    'run (test/distributed/harness/scenario-certification.js)',
});

// scripts/checks/certification-verdict.js (`npm run certification:verdict`)
// projects a DIFFERENT notion called certification: a sealed-bar statistical
// verdict over a stat-gate window (rolling-restart, snapshot-live-rebuild).
// Its output says what it certifies and that it is not this one.
const SEALED_BAR_CERTIFICATION_STATEMENT = Object.freeze({
  certifies: 'a sealed-bar statistical certification: the newest stat-gate ' +
    'window of the scenario is admissible against ' +
    'test/distributed/config/convergence-sealed-bars.json',
  formationCertification: false,
  statement: 'NOT the formation certification: that is a ' +
    '`certified: true` verdict from a `--certify <sha>` distributed harness ' +
    'run (test/distributed/harness/scenario-certification.js)',
});

export {NOT_CERTIFICATION_EVIDENCE, SEALED_BAR_CERTIFICATION_STATEMENT};
