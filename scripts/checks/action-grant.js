#!/usr/bin/env node
/**
 * A durable authorization grant an executor can be unable to act without
 * (`node scripts/checks/action-grant.js issue|require ...`).
 *
 * R26 says an outward or irreversible action is performed only where the
 * operator's authority for it already exists. Most of this repository's outward
 * actions are performed by modules, which ask the action authority directly.
 * Two are not: pushing a container image and creating a public release happen
 * in workflow YAML, which cannot import a decision. Registering those actions
 * and writing a note that YAML "cannot ask" would leave a global invariant
 * false wherever it is most consequential.
 *
 * A grant closes that without asking YAML to become a program. The authority
 * decides once, before the noninteractive executor runs, and records the
 * decision as a scoped artifact; the executor is then a step that cannot
 * proceed unless the grant it names is present, valid and for exactly what it
 * is about to do. YAML does not ask - it is simply unable to act.
 *
 * A grant is deliberately narrow. It names one action and one subject, it is
 * bound to the head it was issued for, and `require` re-asks the authority
 * rather than trusting the file: a grant is evidence that an authorization
 * existed, never a substitute for the decision. A grant for one subject
 * authorizes no other, and a grant issued for a different head authorizes
 * nothing here.
 */

import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

import {ACTION, authorizeAction, isAuthorized} from '../action-authority.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GRANT_DIRECTORY = 'test-output/action-grants';
const GRANT_SUFFIX = '.json';
const SCHEMA = 'action-grant/1';
const TEXT_ENCODING = 'utf8';
const LINE_SEPARATOR = '\n';
const JSON_INDENT = 2;
const VERB = Object.freeze({ISSUE: 'issue', REQUIRE: 'require'});
const ACTION_FLAG = '--action';
const SUBJECT_FLAG = '--subject';
const EXIT_OK = 0;
const EXIT_REFUSED = 1;
const ARGV_OFFSET = 2;
const NOT_PRESENT = -1;
const HEAD_ARGUMENTS = Object.freeze(['rev-parse', 'HEAD']);
const GIT = 'git';
const MESSAGE = Object.freeze({
  USAGE: 'usage: action-grant.js issue|require --action <action> --subject <subject>',
  NO_GRANT: 'no grant for that action and subject',
  WRONG_SUBJECT: 'the grant names a different subject',
  WRONG_HEAD: 'the grant was issued for a different head',
  UNREADABLE: 'the grant could not be read',
});

const arrayIndexOf = Function.call.bind(Array.prototype.indexOf);
const stringTrim = Function.call.bind(String.prototype.trim);

function headSha(root) {
  try {
    return stringTrim(execFileSync(GIT, HEAD_ARGUMENTS,
      {cwd: root, encoding: TEXT_ENCODING}));
  } catch {
    return '';
  }
}

function grantPath(root, action) {
  return path.join(root, GRANT_DIRECTORY, `${action}${GRANT_SUFFIX}`);
}

/**
 * Record that the authority permitted one action for one subject at this head.
 * Refuses, and writes nothing, when the authority does not.
 * @param {{root?: string, action: string, subject: string}} request
 * @return {{outcome: string, because?: string, grant?: Object}}
 */
function issueGrant(request) {
  const root = request.root || REPO_ROOT;
  const {action, subject} = request;
  const decision = authorizeAction({
    action,
    signal: {action, tag: subject, version: subject, project: subject,
      asset: subject},
    context: {tag: subject, version: subject, project: subject, asset: subject},
  });
  if (!isAuthorized(decision)) {
    return {outcome: decision.outcome, because: decision.because};
  }
  const grant = {schema: SCHEMA, action, subject, head: headSha(root),
    requires: decision.requires};
  fs.mkdirSync(path.dirname(grantPath(root, action)), {recursive: true});
  fs.writeFileSync(grantPath(root, action),
    `${JSON.stringify(grant, null, JSON_INDENT)}${LINE_SEPARATOR}`);
  return {outcome: decision.outcome, grant};
}

/**
 * Why an executor may not proceed, or null when it may. The grant is checked
 * for identity and the authority is asked again: the file records that a
 * decision happened, it does not replace one.
 * @param {{root?: string, action: string, subject: string}} request
 * @return {?string}
 */
function grantShortfall(request) {
  const root = request.root || REPO_ROOT;
  const {action, subject} = request;
  const file = grantPath(root, action);
  if (!fs.existsSync(file)) return MESSAGE.NO_GRANT;
  let grant = null;
  try {
    grant = JSON.parse(fs.readFileSync(file, TEXT_ENCODING));
  } catch {
    return MESSAGE.UNREADABLE;
  }
  if (grant.schema !== SCHEMA || grant.action !== action) return MESSAGE.NO_GRANT;
  if (grant.subject !== subject) return MESSAGE.WRONG_SUBJECT;
  const head = headSha(root);
  if (head && grant.head && grant.head !== head) return MESSAGE.WRONG_HEAD;
  const decision = authorizeAction({
    action,
    signal: {action, tag: grant.subject, version: grant.subject,
      project: grant.subject, asset: grant.subject},
    context: {tag: subject, version: subject, project: subject, asset: subject},
  });
  return isAuthorized(decision) ? null : decision.because;
}

function argumentAfter(argv, flag) {
  const index = arrayIndexOf(argv, flag);
  return index === NOT_PRESENT ? null : argv[index + 1];
}

function main(argv) {
  const [verb] = argv;
  const action = argumentAfter(argv, ACTION_FLAG);
  const subject = argumentAfter(argv, SUBJECT_FLAG);
  if (!action || !subject ||
    (verb !== VERB.ISSUE && verb !== VERB.REQUIRE)) {
    process.stderr.write(`${MESSAGE.USAGE}${LINE_SEPARATOR}`);
    return EXIT_REFUSED;
  }
  if (verb === VERB.ISSUE) {
    const issued = issueGrant({action, subject});
    process.stdout.write(`${JSON.stringify(issued, null, JSON_INDENT)}${LINE_SEPARATOR}`);
    return issued.grant ? EXIT_OK : EXIT_REFUSED;
  }
  const shortfall = grantShortfall({action, subject});
  if (shortfall) {
    process.stderr.write(`action-grant: ${action} for ${subject} is refused: ` +
      `${shortfall}${LINE_SEPARATOR}`);
    return EXIT_REFUSED;
  }
  process.stdout.write(`action-grant: ${action} for ${subject} is authorized` +
    LINE_SEPARATOR);
  return EXIT_OK;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(ARGV_OFFSET));
}

export {ACTION, GRANT_DIRECTORY, MESSAGE, grantShortfall, issueGrant};
