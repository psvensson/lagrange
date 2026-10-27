// The one owner of "may this command enter a message group's consensus log"
// (design R3 section 1.1). A committed entry is applied on every replica and
// cannot be taken back, so a command the committed apply would refuse - a
// type it does not dispatch - is refused here, before it is proposed, with a
// typed reason of MESSAGE_GROUP_COMMAND_REFUSAL. The committed apply asks the
// same owner which types exist.

import {
  MESSAGE_GROUP_COMMAND_REFUSAL,
  MESSAGE_GROUP_COMMAND_TYPE,
  MESSAGE_GROUP_SERVICE_ERROR_MSG,
} from './constants.js';
import {copyCdcEvent} from '../cdc/cdc-event-envelope.js';
import {HLCTimestamp} from '../hlc/hlc-timestamp.js';
import {CDC_OPERATION} from '../constants/index.js';
import {isDeepStrictEqual} from 'node:util';

const COMMITTED_COMMAND_TYPES = Object.freeze(
  new Set(Object.values(MESSAGE_GROUP_COMMAND_TYPE)));
const ADMITTED = Object.freeze({admitted: true});

function isEventObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Retained observation must not reuse live normalization, which can drop
// malformed members and mint timestamps. This neither applies nor ACKs events.
function retainedMessageGroupEvents(command) {
  let events;
  if (command?.type === MESSAGE_GROUP_COMMAND_TYPE.CDC) {
    const {type: _type, ...event} = command;
    events = [event];
  } else if (command?.type === MESSAGE_GROUP_COMMAND_TYPE.CDC_BATCH &&
      Object.keys(command).length === 2 && Array.isArray(command.events) &&
      command.events.length > 0) {
    events = command.events;
  } else return null;
  try {
    return events.every((event) => {
      const clock = HLCTimestamp.tryFromString(event?.timestamp);
      return isEventObject(event) &&
        event.operation === CDC_OPERATION.UPSERT && typeof event.tableName === 'string' &&
        isEventObject(event.data) &&
        clock !== null && clock.toString() === event.timestamp &&
        event.replayOnly !== true && isDeepStrictEqual(event, copyCdcEvent(event));
    }) ? events : null;
  } catch {
    return null;
  }
}

/**
 * Whether a type is one of the message group's committed command types.
 * @param {*} type - The command's type.
 * @return {boolean} True for a committed command type.
 */
function isMessageGroupCommandType(type) {
  return COMMITTED_COMMAND_TYPES.has(type);
}

/**
 * Decide whether a command may be proposed.
 * @param {Object} command - The command about to be proposed.
 * @return {Object} Frozen {admitted: true}, or {admitted: false, reason,
 *   type} with a MESSAGE_GROUP_COMMAND_REFUSAL reason.
 */
function admitMessageGroupCommand(command) {
  if (isMessageGroupCommandType(command?.type)) {
    return ADMITTED;
  }
  return Object.freeze({
    admitted: false,
    reason: MESSAGE_GROUP_COMMAND_REFUSAL.UNKNOWN_TYPE,
    type: command?.type ?? null,
  });
}

/**
 * The typed error of a refused admission: never retried, nothing proposed.
 * @param {Object} admission - A refused admission.
 * @return {Error} The error, carrying the refusal's reason and type.
 */
function messageGroupCommandRefusalError(admission) {
  const error = new Error(
    `${MESSAGE_GROUP_SERVICE_ERROR_MSG.COMMAND_TYPE_REFUSED}: ` +
    `${String(admission.type)}`);
  error.code = admission.reason;
  error.reason = admission.reason;
  error.retryable = false;
  return error;
}

export {
  retainedMessageGroupEvents,
  MESSAGE_GROUP_COMMAND_REFUSAL,
  admitMessageGroupCommand,
  isMessageGroupCommandType,
  messageGroupCommandRefusalError,
};
