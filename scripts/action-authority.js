#!/usr/bin/env node
/**
 * Whether an outward or irreversible action is authorized now (R26).
 *
 * R26 says such an action is performed only where the operator's authority for
 * it already exists. Before this owner, that was a description of four
 * unrelated gates rather than a decision anything made: the publisher read a
 * flag, a reason and a commit marker and judged them itself; the exemption
 * store was consulted directly; publishing a package, replacing a shared
 * evidence asset and provisioning cloud hosts were behind no signal at all;
 * and the absence of a signal meant proceed.
 *
 * This module owns exactly one decision and nothing else. It is given the
 * action, the operator's signal for it, and what the caller knows about what is
 * actually about to happen, and it answers `authorized`, `refused` or
 * `unavailable`. It performs no action, writes no record, and knows nothing
 * about how any action is carried out; publication, evidence storage, package
 * release, cloud execution and Git remain consumers that ask and then act, and
 * the exemption store remains the persistence owner and decides nothing.
 *
 * A signal is what the operator supplied, not what the caller already knew.
 * Where an executor could read the value out of its own inputs - the version in
 * the tarball it just packed, the project in the configuration that made it run
 * - the authority compares the operator's stated intent against what is
 * actually about to happen, so an executor presenting its own data authorizes
 * nothing. That distinction is the whole difference between asking and
 * pretending to ask.
 *
 * The door is closed by default. An action nobody has registered is refused,
 * so introducing a new outward action cannot open a door by omission; an action
 * name is looked up as a key rather than resolved along the registry's
 * prototype chain, so `toString` is not an action and a malformed request is a
 * refusal rather than a thrown error no caller can read as a decision. A
 * registered action whose signal is absent, empty, or addressed elsewhere is
 * refused, and `unavailable` - the answer when the authority cannot determine
 * whether the authority holds - never permits anything. Only `isAuthorized`
 * grants, and only for `authorized`.
 *
 * One action carries a standing authority instead of a signal, and says so:
 * landing work and then publishing the exact head is what this repository asks
 * of every unit of work, so demanding a fresh operator signal for each ordinary
 * publish would describe a policy nobody holds. A standing authority is
 * declared in the registry, never inferred from silence, and the acceptance
 * scenarios name by hand exactly which action may carry one.
 */

const OUTCOME = Object.freeze({
  AUTHORIZED: 'authorized',
  REFUSED: 'refused',
  UNAVAILABLE: 'unavailable',
});

const ACTION = Object.freeze({
  PUBLISH_HEAD: 'publish-head',
  PUBLISH_HEAD_ON_RED: 'publish-head-on-red',
  ROUTE_SELF_HOSTED_RUNNER: 'route-self-hosted-runner',
  PUBLISH_WITHOUT_DATASET: 'publish-without-dataset',
  REPLACE_SHARED_EVIDENCE: 'replace-shared-evidence',
  DELETE_SHARED_EVIDENCE: 'delete-shared-evidence',
  PUBLISH_PACKAGE: 'publish-package',
  PUBLISH_RELEASE_TAG: 'publish-release-tag',
  PROVISION_CLOUD_HOSTS: 'provision-cloud-hosts',
  PUBLISH_CONTAINER_IMAGE: 'publish-container-image',
  CREATE_PUBLIC_RELEASE: 'create-public-release',
});

const EMPTY_TEXT = '';
const ACTION_FIELD = 'action';
const VERSION_FIELD = 'version';
const TAG_FIELD = 'tag';
const PROJECT_FIELD = 'project';
const ASSET_FIELD = 'asset';
const UNREGISTERED = 'no authorization semantics are registered for this ' +
  'action; register them before performing it';

// What would authorize each action, stated once so a caller that presents
// nothing can still be told what it needed.
const REQUIRES = Object.freeze({
  STANDING_PUBLISH: 'nothing beyond the standing authority to publish a landed head',
  RED_REPAIR: 'the exact head the shared branch is red at, and a reason',
  RUNNER: 'a routing marker in the reviewed head commit, and an explicit ' +
    'request to route there',
  PROOF_WEAKENING: 'an explicit request to proceed without the missing input, ' +
    'naming it',
  REPLACEMENT: 'an explicit request to replace, naming the asset',
  DELETION: 'an explicit request naming the asset to delete, matching ' +
    'the asset at hand',
  PACKAGE: 'an explicit request naming the version the operator intends to ' +
    'publish, matching the candidate',
  TAG: 'an explicit request naming the tag to publish, matching the tag at hand',
  CLOUD: 'an explicit request naming the project hosts may be created in, ' +
    'matching the project being provisioned',
  IMAGE: 'an explicit request naming the image tag to publish, matching ' +
    'the tag at hand',
  RELEASE: 'an explicit request naming the release to create, matching the ' +
    'tag at hand',
});

// Why a decision came out the way it did, in the authority's own words.
const BECAUSE = Object.freeze({
  RED_HEAD_UNKNOWN: 'the red head could not be determined',
  WRONG_HEAD: 'the signal names a head the branch is not red at',
  NO_REASON: 'no reason was given',
  RUNNER_UNREQUESTED: 'routing there was not asked for',
  RUNNER_UNMARKED: 'the reviewed head carries no marker for that runner',
  NOTHING_MISSING_NAMED: 'nothing names what is missing',
  REPLACEMENT_UNREQUESTED: 'replacement was not asked for',
  NO_ASSET_NAMED: 'no asset was named',
  NO_SIGNAL: 'no operator authorization was presented',
  WRONG_ACTION: 'the authorization presented is addressed to a different action',
  NOTHING_INTENDED: 'the operator named nothing to authorize',
  NOTHING_ACTUAL: 'what is about to happen could not be determined',
  MISMATCH: 'what the operator authorized is not what is about to happen',
});

const objectKeys = Object.keys;
const objectHasOwn = Object.hasOwn;
const stringTrim = Function.call.bind(String.prototype.trim);

function text(value) {
  return typeof value === 'string' ? stringTrim(value) : EMPTY_TEXT;
}

function refused(requires, because) {
  return {outcome: OUTCOME.REFUSED, requires, because};
}

function authorized(requires, standing = false) {
  return {outcome: OUTCOME.AUTHORIZED, requires, standing};
}

function unavailable(requires, because) {
  return {outcome: OUTCOME.UNAVAILABLE, requires, because};
}

// A red-branch repair names the head it repairs and why. Naming a head the
// branch is not actually red at is a different repair, not this one; not
// knowing which head is red is not knowing whether the authority holds.
function decideRedRepair(signal, context) {
  const redHead = text(context.redHead);
  if (redHead === EMPTY_TEXT) {
    return unavailable(REQUIRES.RED_REPAIR, BECAUSE.RED_HEAD_UNKNOWN);
  }
  if (text(signal.head) !== redHead) {
    return refused(REQUIRES.RED_REPAIR, BECAUSE.WRONG_HEAD);
  }
  if (text(signal.reason) === EMPTY_TEXT) {
    return refused(REQUIRES.RED_REPAIR, BECAUSE.NO_REASON);
  }
  return authorized(REQUIRES.RED_REPAIR);
}

// Routing elsewhere is authorized by a marker in the commit message that was
// already reviewed AND by an explicit request. Either half alone is a
// mismatch: a marker nobody asked to honour, or a request the reviewed commit
// does not carry.
function decideRunnerRouting(signal, context) {
  if (signal.requested !== true) {
    return refused(REQUIRES.RUNNER, BECAUSE.RUNNER_UNREQUESTED);
  }
  if (context.headCarriesMarker !== true) {
    return refused(REQUIRES.RUNNER, BECAUSE.RUNNER_UNMARKED);
  }
  return authorized(REQUIRES.RUNNER);
}

// A deliberate weakening of the proof a publish runs: it must be asked for,
// and the caller must say what it is proceeding without.
function decideProofWeakening(signal) {
  return text(signal.missing) === EMPTY_TEXT ?
    refused(REQUIRES.PROOF_WEAKENING, BECAUSE.NOTHING_MISSING_NAMED) :
    authorized(REQUIRES.PROOF_WEAKENING);
}

// Replacing something shared and already published cannot be undone. The
// operator must ask for a replacement, not merely name what would be replaced:
// the executor always knows the name, so a name alone authorizes nothing.
function decideReplacement(signal) {
  if (signal.replace !== true) {
    return refused(REQUIRES.REPLACEMENT, BECAUSE.REPLACEMENT_UNREQUESTED);
  }
  return text(signal.asset) === EMPTY_TEXT ?
    refused(REQUIRES.REPLACEMENT, BECAUSE.NO_ASSET_NAMED) :
    authorized(REQUIRES.REPLACEMENT);
}

// The operator names what they intend to release; the authority compares it
// with what is actually about to be released. An executor reading the value out
// of the artifact it just built would authorize whatever it happened to
// produce, which is not an authorization at all.
function decideIntendedRelease(signal, context, requires, field) {
  const intended = text(signal[field]);
  if (intended === EMPTY_TEXT) return refused(requires, BECAUSE.NOTHING_INTENDED);
  const actual = text(context[field]);
  if (actual === EMPTY_TEXT) return unavailable(requires, BECAUSE.NOTHING_ACTUAL);
  return intended === actual ? authorized(requires) :
    refused(requires, BECAUSE.MISMATCH);
}

function intendedRelease(requires, field) {
  return (signal, context) =>
    decideIntendedRelease(signal, context, requires, field);
}

const REGISTRY = Object.freeze({
  [ACTION.PUBLISH_HEAD]: Object.freeze({
    requires: REQUIRES.STANDING_PUBLISH,
    standing: 'landing work and publishing the exact head is what this ' +
      'repository asks of every unit of work',
  }),
  [ACTION.PUBLISH_HEAD_ON_RED]: Object.freeze({
    requires: REQUIRES.RED_REPAIR, decide: decideRedRepair}),
  [ACTION.ROUTE_SELF_HOSTED_RUNNER]: Object.freeze({
    requires: REQUIRES.RUNNER, decide: decideRunnerRouting}),
  [ACTION.PUBLISH_WITHOUT_DATASET]: Object.freeze({
    requires: REQUIRES.PROOF_WEAKENING,
    decide: (signal) => decideProofWeakening(signal)}),
  [ACTION.REPLACE_SHARED_EVIDENCE]: Object.freeze({
    requires: REQUIRES.REPLACEMENT,
    decide: (signal) => decideReplacement(signal)}),
  [ACTION.DELETE_SHARED_EVIDENCE]: Object.freeze({
    requires: REQUIRES.DELETION,
    decide: intendedRelease(REQUIRES.DELETION, ASSET_FIELD)}),
  [ACTION.PUBLISH_PACKAGE]: Object.freeze({
    requires: REQUIRES.PACKAGE,
    decide: intendedRelease(REQUIRES.PACKAGE, VERSION_FIELD)}),
  [ACTION.PUBLISH_RELEASE_TAG]: Object.freeze({
    requires: REQUIRES.TAG,
    decide: intendedRelease(REQUIRES.TAG, TAG_FIELD)}),
  [ACTION.PROVISION_CLOUD_HOSTS]: Object.freeze({
    requires: REQUIRES.CLOUD,
    decide: intendedRelease(REQUIRES.CLOUD, PROJECT_FIELD)}),
  [ACTION.PUBLISH_CONTAINER_IMAGE]: Object.freeze({
    requires: REQUIRES.IMAGE,
    decide: intendedRelease(REQUIRES.IMAGE, TAG_FIELD)}),
  [ACTION.CREATE_PUBLIC_RELEASE]: Object.freeze({
    requires: REQUIRES.RELEASE,
    decide: intendedRelease(REQUIRES.RELEASE, TAG_FIELD)}),
});

/**
 * The outward actions whose authorization semantics exist. Anything else is
 * refused.
 * @return {string[]}
 */
function registeredActions() {
  return objectKeys(REGISTRY);
}

/**
 * Whether a requested outward or irreversible action is authorized now.
 * @param {{action: string, signal: ?Object, context: ?Object}} request
 * @return {{outcome: string, requires: string, because?: string, standing?: boolean}}
 */
function authorizeAction(request) {
  const action = request && request.action;
  if (typeof action !== 'string' || !objectHasOwn(REGISTRY, action)) {
    return refused(UNREGISTERED, UNREGISTERED);
  }
  const registered = REGISTRY[action];
  if (registered.standing) return authorized(registered.requires, true);
  const signal = request.signal;
  if (!signal || typeof signal !== 'object') {
    return refused(registered.requires, BECAUSE.NO_SIGNAL);
  }
  if (!objectHasOwn(signal, ACTION_FIELD) || signal.action !== action) {
    return refused(registered.requires, BECAUSE.WRONG_ACTION);
  }
  return registered.decide(signal, request.context || {});
}

/**
 * Whether a decision permits the action. Only an explicit authorization does:
 * a refusal and an undeterminable answer are both closed doors.
 * @param {{outcome: string}} decision
 * @return {boolean}
 */
function isAuthorized(decision) {
  return Boolean(decision) && decision.outcome === OUTCOME.AUTHORIZED;
}

export {ACTION, OUTCOME, authorizeAction, isAuthorized, registeredActions};
