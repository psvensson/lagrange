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

export {NOT_CERTIFICATION_EVIDENCE};
