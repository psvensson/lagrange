// test-receipt probe — reads a file-backed evidence receipt produced by a
// focused test-run harness and answers the two independent probe questions:
//
//   metric = the number of required receipt ids that are missing or not passing
//            (lower is better; 0 means every required receipt is green)
//   done   = metric === 0 and the receipt file records a passing overall status
//
// `test-receipt/1` does not bind its result to an exact candidate/proof-input
// fingerprint. It therefore remains time/path-sensitive evidence: `generatedAt`
// and filesystem freshness are still part of its identity. A future receipt
// schema may opt into deterministic evidence only after it carries a binding the
// Solver can independently compare to the candidate and declared proof inputs.
//
// Receipt file shape:
// {
//   "schema": "test-receipt/1",
//   "quest": "<quest-id>",
//   "status": "pass" | "fail",
//   "generatedAt": "<iso>",
//   "receipts": [
//     {"id": "<receipt-id>", "passed": true,
//      "command": "npm run test:file -- test/.../x.test.js",
//      "detail": "<one-line claim the receipt proves>"}
//   ]
// }

import fs from 'node:fs';

import {EVIDENCE_CLASS} from '../evidence-identity.js';

const RECEIPT_SCHEMA = 'test-receipt/1';
const PROBE_NAME = 'test-receipt';
const RECEIPT_STATUS_PASS = 'pass';
const UTF8_ENCODING = 'utf8';
const INVALID_SAMPLE_REASON = Object.freeze({
  MISSING_OR_WRONG_SCHEMA: 'receipt file missing or wrong schema',
  NO_RECEIPTS: 'receipt file carries no receipts',
  COMMANDLESS_RECEIPT: 'a receipt lacks its producing command',
  NO_REQUIRED_RECEIPTS: 'probe args name no required receipts',
});
const SAMPLE_VALID_REASON = 'sample is measurable';
const SAMPLE_VALIDITY_RULES = Object.freeze([
  Object.freeze({
    reason: INVALID_SAMPLE_REASON.MISSING_OR_WRONG_SCHEMA,
    matches: (data) => !data || data.schema !== RECEIPT_SCHEMA,
  }),
  Object.freeze({
    reason: INVALID_SAMPLE_REASON.NO_RECEIPTS,
    matches: (data) => !Array.isArray(data.receipts) ||
      data.receipts.length === 0,
  }),
  Object.freeze({
    reason: INVALID_SAMPLE_REASON.COMMANDLESS_RECEIPT,
    matches: (data) => data.receipts.some((r) =>
      typeof r?.command !== 'string' || r.command.length === 0),
  }),
]);
const REQUIRED_RECEIPTS_ABSENT = Object.freeze({
  invalid: true,
  reason: INVALID_SAMPLE_REASON.NO_REQUIRED_RECEIPTS,
});
const NON_MEASURING = Object.freeze({
  metric: null,
  done: false,
  evidence: null,
  invalidSample: true,
  satisfiedInvariants: [],
});

function readReceiptFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, UTF8_ENCODING));
  } catch (_error) {
    return null;
  }
}

function classifySample(data, requiredReceipts) {
  const rule = SAMPLE_VALIDITY_RULES.find((candidate) =>
    candidate.matches(data));
  const structural = rule ?
    {invalid: true, reason: rule.reason} :
    {invalid: false, reason: SAMPLE_VALID_REASON};
  const argsInvalid = !Array.isArray(requiredReceipts) ||
    requiredReceipts.length === 0;
  return structural.invalid ?
    structural :
    (argsInvalid ? REQUIRED_RECEIPTS_ABSENT : structural);
}

function measureOutstanding(data, requiredReceipts) {
  const byId = new Map(data.receipts.map((r) => [r.id, r]));
  return requiredReceipts.filter((id) => byId.get(id)?.passed !== true);
}

export const testReceiptProbe = {
  name: PROBE_NAME,
  evidenceClass: EVIDENCE_CLASS.LIVE,
  measure(args = {}) {
    const file = args.file;
    if (!file || !fs.existsSync(file)) {
      return {...NON_MEASURING, evidence: file || null};
    }
    const data = readReceiptFile(file);
    const required = Array.isArray(args.requiredReceipts) ?
      args.requiredReceipts :
      [];
    const sample = classifySample(data, required);
    if (sample.invalid) {
      return {
        ...NON_MEASURING,
        evidence: file,
        detail: {reason: sample.reason},
      };
    }
    const outstanding = measureOutstanding(data, required);
    return {
      metric: outstanding.length,
      done: outstanding.length === 0 && data.status === RECEIPT_STATUS_PASS,
      evidence: file,
      invalidSample: false,
      satisfiedInvariants: data.receipts
        .filter((r) => r?.passed === true && required.includes(r.id))
        .map((r) => r.id),
      detail: {
        outstanding,
        status: data.status,
        generatedAt: data.generatedAt || null,
      },
    };
  },
};
