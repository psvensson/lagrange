// Durable delivery methods of MessageGroupForwardingOwner. The source ledger
// retains retry custody; this owner forwards one exact vector in the live grant.
import {captureCdcEvents} from '../cdc/cdc-event-envelope.js';
import {CDC_COMPLETION, hasDurableCdcEvents, isCommittedCdcDelivery, isProvisionalCdcDelivery,
  unknownCdcAcceptance} from '../cdc/cdc-delivery-outcome.js';
import {CDC_DELIVERY_REMAINING_MS, cdcDeliveryBudgetError, checkedCdcRemainingMs,
  createCdcDeliveryBudget, prepareCdcDeliveryMessage} from
  '../cdc/cdc-delivery-budget.js';
import {copyStrictOwnDataRecord} from '../utils/strict-own-data.js';
import {MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE, MESSAGE_GROUP_CDC_ERROR_MSG} from './constants.js';
import {CDC_FORWARD_MAX_RELAY_DEPTH, cdcRelaySendDepth} from
  './message-group-service-runtime-support.js';
import {MESSAGE_GROUP_CDC_FORWARD_MODE, MESSAGE_GROUP_CDC_INGRESS_ACTION,
  resolveCDCForwardDeliveryProfile} from './message-group-forwarding-owner-constants.js';

const objectHasOwn = Object.hasOwn;
const objectCreate = Object.create;
const objectFreeze = Object.freeze;
const numberIsInteger = Number.isInteger;
const arrayIsArray = Array.isArray;
const arrayFind = Function.call.bind(Array.prototype.find);

const CDC_FORWARD_MODE_FIELD = 'cdcForwardMode';
const CDC_FORWARD_CONTEXT_FIELDS = objectFreeze(['targetGroupId', 'relayDepth', CDC_FORWARD_MODE_FIELD]);
const CDC_FORWARD_WRAPPER_FIELDS = objectFreeze([
  ...CDC_FORWARD_CONTEXT_FIELDS, CDC_DELIVERY_REMAINING_MS, 'events',
]);
const CDC_FORWARD_TARGET_STEP = objectFreeze({
  ACCEPTED: 'accepted',
  ADVANCE: 'advance',
  STOP: 'stop',
});

// Validate descriptors before reading a caller's values. The null-prototype
// snapshot cannot acquire omitted controls from a polluted Object prototype.
// Private invocation operations remain local options, never wire payload data.
function captureCdcForwardRecord(input) {
  const captured = copyStrictOwnDataRecord(input);
  if (captured === null) throw cdcDeliveryBudgetError(CDC_COMPLETION.INVALID);
  for (let index = 0; index < CDC_FORWARD_WRAPPER_FIELDS.length; index += 1) {
    const field = CDC_FORWARD_WRAPPER_FIELDS[index];
    if (!objectHasOwn(captured, field) && field in input) {
      throw cdcDeliveryBudgetError(CDC_COMPLETION.INVALID);
    }
  }
  if (objectHasOwn(captured, CDC_DELIVERY_REMAINING_MS)) {
    checkedCdcRemainingMs(captured[CDC_DELIVERY_REMAINING_MS]);
  }
  return objectFreeze(captured);
}

function hasCdcForwardMode(input) {
  return objectHasOwn(input, CDC_FORWARD_MODE_FIELD);
}

function requiresDurableCdcForwarding(events, options, payload = options) {
  return hasDurableCdcEvents(events) || hasCdcForwardMode(options) || hasCdcForwardMode(payload);
}

function combinedCdcForwardContext(payload, options) {
  const context = objectCreate(null);
  for (let index = 0; index < CDC_FORWARD_CONTEXT_FIELDS.length; index += 1) {
    const field = CDC_FORWARD_CONTEXT_FIELDS[index];
    if (payload[field] !== undefined && options[field] !== undefined &&
        payload[field] !== options[field]) throw cdcDeliveryBudgetError(CDC_COMPLETION.INVALID);
    context[field] = payload[field] === undefined ? options[field] : payload[field];
  }
  return context;
}

function assertCdcForwardMode(mode) {
  if (mode !== undefined && mode !== MESSAGE_GROUP_CDC_FORWARD_MODE.NATIVE_COMMIT) {
    throw cdcDeliveryBudgetError(CDC_COMPLETION.INVALID);
  }
}

function readCdcForwardContext(service, input, {requireTarget = false} = {}) {
  input = captureCdcForwardRecord(input);
  const targetGroupId = input.targetGroupId === undefined ?
    (requireTarget ? null : service.groupId) : input.targetGroupId;
  const relayDepth = input.relayDepth === undefined ? 0 : input.relayDepth;
  const cdcForwardMode = input.cdcForwardMode;
  if (targetGroupId !== service.groupId || !numberIsInteger(relayDepth) ||
      relayDepth < 0 || relayDepth > CDC_FORWARD_MAX_RELAY_DEPTH) {
    throw cdcDeliveryBudgetError(CDC_COMPLETION.INVALID);
  }
  assertCdcForwardMode(cdcForwardMode);
  const context = objectCreate(null);
  context.targetGroupId = targetGroupId;
  context.relayDepth = relayDepth;
  if (cdcForwardMode !== undefined) context.cdcForwardMode = cdcForwardMode;
  return objectFreeze(context);
}

function captureCdcForwardOptions(service, input) {
  const options = captureCdcForwardRecord(input);
  readCdcForwardContext(service, options, {requireTarget: hasCdcForwardMode(options)});
  return options;
}

function assertCdcTerminalEvents(events, context) {
  // A terminal delivery needs a durable occurrence, while a legitimate mixed
  // vector keeps every ordinary member for the same whole-command acceptance.
  if (context.cdcForwardMode === MESSAGE_GROUP_CDC_FORWARD_MODE.NATIVE_COMMIT &&
      !hasDurableCdcEvents(events)) {
    throw cdcDeliveryBudgetError(CDC_COMPLETION.INVALID);
  }
}

function captureCdcForwardRequest(service, payload, batch) {
  payload = captureCdcForwardRecord(payload);
  const incoming = batch ? payload.events : [payload];
  const durable = hasDurableCdcEvents(incoming);
  const context = readCdcForwardContext(service, payload,
    {requireTarget: durable || hasCdcForwardMode(payload)});
  if (hasCdcForwardMode(payload) && (!durable || context.cdcForwardMode === undefined)) {
    throw cdcDeliveryBudgetError(CDC_COMPLETION.INVALID);
  }
  return {payload, incoming, durable, context};
}

function exactForwardPayload(payload, events) {
  return payload.type === MESSAGE_GROUP_APPLICATION_MESSAGE_TYPE.LATENCY_CDC_PROPAGATION_BATCH ?
    {...payload, events} : {...payload, ...events[0]};
}

function forwardEventContext(service, events, options) {
  const event = arrayFind(events, (item) =>
    service.shouldUseStrictCDCForwarding(item)) ?? events[0];
  return {...event, ...options, events};
}

function successfulForward(answer, events, groupId, terminal) {
  return isCommittedCdcDelivery(answer, events, groupId) ||
    (!terminal && isProvisionalCdcDelivery(answer, events, groupId));
}

function durableForwardTargetStep(owner, target, result) {
  if (result.accepted) return CDC_FORWARD_TARGET_STEP.ACCEPTED;
  return owner.isNativeCdcForwardTarget(target) || result.error?.retryable === false ?
    CDC_FORWARD_TARGET_STEP.STOP : CDC_FORWARD_TARGET_STEP.ADVANCE;
}

function createMessageGroupForwardingOwnerNativeDeliveryMethods() {
  return {
    async tryAddressedDurableCdcIngress(events, options) {
      if (options.cdcForwardMode === MESSAGE_GROUP_CDC_FORWARD_MODE.NATIVE_COMMIT) return null;
      options.assertCurrent();
      const context = this.buildAddressedStrictConvergenceContext(
        forwardEventContext(this.service, events, options));
      const decision = this.resolveCdcIngressDecision(context);
      if (decision.action !== MESSAGE_GROUP_CDC_INGRESS_ACTION.APPLY_LOCAL ||
          decision.localIngress !== true) return null;
      const answer = await options.applyProvisionalIngress();
      options.assertCurrent();
      return answer;
    },

    async repairDurableCdcForwardTopology(context, options) {
      options.assertCurrent();
      await this.service.maybeRepairAuthoritativeForwardTopology(
        {...context, remainingMs: options.remainingMs});
      options.assertCurrent();
    },

    assertDurableCdcForwardTarget(target, options, address) {
      options.assertCurrent();
      if (this.service.isForwardTargetSuppressed(target)) throw cdcDeliveryBudgetError();
      if (this.isNativeCdcForwardTarget(target)) {
        this.assertNativeForwardTarget(target);
      } else this.assertCachedCdcForwardTarget(target, address);
      options.assertCurrent();
    },

    async deliverDurableCdcForwardTarget(target, payload, events, options) {
      const service = this.service;
      const address = target.address || service.buildPeerAddress(target.serviceId);
      if (!address) throw cdcDeliveryBudgetError();
      this.assertDurableCdcForwardTarget(target, options, address);
      const terminal = this.isNativeCdcForwardTarget(target);
      const request = {...payload, targetGroupId: service.groupId,
        relayDepth: cdcRelaySendDepth(options.relayDepth),
        ...(terminal ? {cdcForwardMode: MESSAGE_GROUP_CDC_FORWARD_MODE.NATIVE_COMMIT} : {})};
      const profile = resolveCDCForwardDeliveryProfile(events[0].tableName, payload,
        options.replayOnly === true);
      const answer = await service.transport.deliver(address, request, {
        deliveryPriority: profile.deliveryPriority, deliverySource: profile.deliverySource,
        timeoutMs: options.remainingMs(), remainingMs: options.remainingMs,
        ...(options.deliveryContext === null ? {} : {deliveryContext: options.deliveryContext}),
        deliveryDurationField: CDC_DELIVERY_REMAINING_MS,
        prepareDeliveryMessage: (message, remainingMs) => {
          this.assertDurableCdcForwardTarget(target, options, address);
          return prepareCdcDeliveryMessage(message, remainingMs);
        },
      });
      options.assertCurrent();
      return {answer, terminal, address};
    },

    async tryDurableCdcForwardTargets(targets, payload, events, options) {
      let lastAnswer = null;
      let lastError = null;
      let addressedConvergence = false;
      for (let index = 0; index < targets.length; index += 1) {
        const target = targets[index];
        const result = await this.tryDurableCdcForwardTarget(target, payload, events, options);
        const step = durableForwardTargetStep(this, target, result);
        if (step === CDC_FORWARD_TARGET_STEP.ACCEPTED) return result;
        lastAnswer = result.answer ?? lastAnswer;
        lastError = result.error ?? lastError;
        addressedConvergence ||= result.addressedConvergence;
        if (step === CDC_FORWARD_TARGET_STEP.STOP) break;
      }
      return {accepted: false, answer: lastAnswer, error: lastError, addressedConvergence};
    },

    async tryDurableCdcForwardTarget(target, payload, events, options) {
      try {
        const {answer, terminal, address} =
          await this.deliverDurableCdcForwardTarget(target, payload, events, options);
        if (successfulForward(answer, events, this.service.groupId, terminal)) {
          this.clearForwardTargetSuppression({serviceId: target.serviceId, address});
          return {accepted: true, answer};
        }
        const addressedConvergence = await this.observeDurableCdcForwardFailure(
          target, answer, answer?.error, options);
        return {accepted: false, answer, addressedConvergence};
      } catch (error) {
        options.assertCurrent();
        const addressedConvergence = await this.observeDurableCdcForwardFailure(
          target, null, error?.message, options);
        return {accepted: false, error, addressedConvergence};
      }
    },

    async observeDurableCdcForwardFailure(target, answer, message, options) {
      const service = this.service;
      if (service.shouldSuppressForwardTarget(answer, message)) this.suppressForwardTarget(target);
      if (this.isNativeCdcForwardTarget(target) ||
          !service.shouldRepairForwardTopology(message)) return false;
      await this.repairDurableCdcForwardTopology({serviceId: target.serviceId,
        address: target.address, errorMessage: message}, options);
      return true;
    },

    async forwardDurableCdcPayload(payload, incomingOptions = {}) {
      const service = this.service;
      const startedAtMs = service.timeSource.now();
      payload = captureCdcForwardRecord(payload);
      incomingOptions = captureCdcForwardRecord(incomingOptions);
      // Durable forwarding is raw work of one admitted committed-acceptance
      // wait, which supplies its provisional operation for that exact vector.
      // Anything else is refused before capture, reservation or any forward.
      if (typeof incomingOptions.applyProvisionalIngress !== 'function') {
        throw cdcDeliveryBudgetError(CDC_COMPLETION.INVALID);
      }
      const budget = createCdcDeliveryBudget(service, incomingOptions, startedAtMs);
      const context = readCdcForwardContext(service,
        combinedCdcForwardContext(payload, incomingOptions));
      const options = {...incomingOptions, ...context, ...budget};
      const events = captureCdcEvents(arrayIsArray(payload.events) ? payload.events : [payload]);
      assertCdcTerminalEvents(events, context);
      if (context.cdcForwardMode === MESSAGE_GROUP_CDC_FORWARD_MODE.NATIVE_COMMIT ||
          context.relayDepth >= CDC_FORWARD_MAX_RELAY_DEPTH) return unknownCdcAcceptance();
      let decision = this.resolveCdcIngressDecision(forwardEventContext(service, events, options));
      if (decision.shouldRepairAuthoritativeTopology) {
        await this.repairDurableCdcForwardTopology({tableName: events[0].tableName,
          errorMessage: MESSAGE_GROUP_CDC_ERROR_MSG.FORWARD_LEADER_UNKNOWN}, options);
        decision = this.resolveCdcIngressDecision(forwardEventContext(service, events, options));
      }
      return this.deliverDurableCdcDecision(decision, exactForwardPayload(payload, events),
        events, options);
    },

    async deliverDurableCdcDecision(decision, payload, events, options) {
      if (decision.targets.length === 0) {
        return await this.tryAddressedDurableCdcIngress(events, options) ?? unknownCdcAcceptance();
      }
      const result = await this.tryDurableCdcForwardTargets(
        decision.targets, payload, events, options);
      if (result.accepted) return result.answer;
      if (result.addressedConvergence) {
        const provisional = await this.tryAddressedDurableCdcIngress(events, options);
        if (provisional !== null) return provisional;
      }
      if (result.answer !== null) return {...unknownCdcAcceptance(), cause: result.answer};
      if (result.error) throw result.error;
      return unknownCdcAcceptance();
    },
  };
}

export {assertCdcTerminalEvents, captureCdcForwardOptions, captureCdcForwardRequest,
  createMessageGroupForwardingOwnerNativeDeliveryMethods, requiresDurableCdcForwarding};
