// Source-order owns whether an occurrence still has an effect in this cache.
// A handler's receipt is not such evidence: an image or another authority may
// have replaced it. All source paths consume this one typed application.
import {captureCdcEvents} from '../cdc/cdc-event-envelope.js';
import {resolveSystemCacheRowKey} from './system-cache-key-descriptor.js';
import {SOURCE_EFFECT_STATE, isSourceMember} from './system-table-cache-source-order.js';
import {CDC_EVENT_IDENTITY} from '../constants/cdc-lifecycle-constants.js';

const SOURCE_EFFECT_APPLICATION_FAILED = 'CDC source effect application failed; image recovery owed';

function effectOutcome(state, context) {
  return Object.freeze({state, context});
}

function unavailableEffect(cache, event, range, context) {
  cache.sourceOrder.retainEffectRecovery(event, range);
  return effectOutcome(SOURCE_EFFECT_STATE.UNAVAILABLE, context);
}

function applySourceCdcEvent(cache, input, range, observedAtMs) {
  const event = captureCdcEvents([input])[0];
  if (!isSourceMember(range, event) || typeof event.eventKey !== 'string') {
    throw Object.assign(new Error(CDC_EVENT_IDENTITY.INVALID_MESSAGE),
      {code: CDC_EVENT_IDENTITY.INVALID_CODE});
  }
  const metadata = {...event, sourceIncarnation: range.incarnation};
  const order = cache.sourceOrder;
  const key = resolveSystemCacheRowKey(event.tableName, event.data);
  const context = order.captureEffectContext(event.sourcePartition, event.tableName, range.incarnation);
  const decision = order.classifyEffect(event.tableName, key, event.data, metadata);
  if (decision === SOURCE_EFFECT_STATE.COVERED) return effectOutcome(decision, context);
  if (decision === SOURCE_EFFECT_STATE.UNAVAILABLE) {
    return unavailableEffect(cache, event, range, context);
  }
  try {
    cache.applySystemTableChange(event.tableName, event.operation, event.data, {
      ...metadata, cdcObservedAtMs: observedAtMs, sourceEffectContext: context,
    });
  } catch (error) {
    // The committed source retains its obligation, and this cache retains the
    // existing relist continuation even when a row callback throws.
    const outcome = unavailableEffect(cache, event, range, context);
    cache.logger.error(SOURCE_EFFECT_APPLICATION_FAILED, {tableName: event.tableName,
      sourcePartition: event.sourcePartition, eventKey: event.eventKey, error: error.message});
    return outcome;
  }
  return order.effectContextIsCurrent(context) &&
    order.classifyEffect(event.tableName, key, event.data, metadata) === SOURCE_EFFECT_STATE.COVERED ?
    effectOutcome(SOURCE_EFFECT_STATE.APPLIED, context) : unavailableEffect(cache, event, range, context);
}

export {applySourceCdcEvent};
