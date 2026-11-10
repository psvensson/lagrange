/**
 * Module-load captures of the prototype methods the comparative-benchmark
 * deployment and campaign owners call on external data (ssh output, product
 * answers, inventory records). Captured once here so a replaced intrinsic
 * cannot invert a readiness, identity or dataset decision
 * (adversarial-js-intrinsics guideline, template item 6).
 */
const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayFindIndex = Function.call.bind(Array.prototype.findIndex);
const arrayFlatMap = Function.call.bind(Array.prototype.flatMap);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayIsArray = Array.isArray;
const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayPush = Function.call.bind(Array.prototype.push);
const arraySome = Function.call.bind(Array.prototype.some);
const DateConstructor = Date;
const dateNow = Date.now;
const dateParse = Date.parse;
const dateToISOString = Function.call.bind(Date.prototype.toISOString);
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const MapConstructor = Map;
const mapGet = Function.call.bind(Map.prototype.get);
const mapSet = Function.call.bind(Map.prototype.set);
const numberIsFinite = Number.isFinite;
const numberIsInteger = Number.isInteger;
const objectFreeze = Object.freeze;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectHasOwn = Object.hasOwn;
const objectKeys = Object.keys;
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringIndexOf = Function.call.bind(String.prototype.indexOf);
const stringLastIndexOf = Function.call.bind(String.prototype.lastIndexOf);
const stringPadStart = Function.call.bind(String.prototype.padStart);
const stringReplace = Function.call.bind(String.prototype.replace);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringToLowerCase = Function.call.bind(String.prototype.toLowerCase);
const stringTrim = Function.call.bind(String.prototype.trim);
const toNumber = Number;
const toStringValue = String;

export {
  DateConstructor,
  MapConstructor,
  arrayEvery,
  arrayFilter,
  arrayFind,
  arrayFindIndex,
  arrayFlatMap,
  arrayIncludes,
  arrayIsArray,
  arrayJoin,
  arrayMap,
  arrayPush,
  arraySome,
  dateNow,
  dateParse,
  dateToISOString,
  jsonParse,
  jsonStringify,
  mapGet,
  mapSet,
  numberIsFinite,
  numberIsInteger,
  objectFreeze,
  objectGetPrototypeOf,
  objectHasOwn,
  objectKeys,
  stringEndsWith,
  stringIncludes,
  stringIndexOf,
  stringLastIndexOf,
  stringPadStart,
  stringReplace,
  stringSplit,
  stringStartsWith,
  stringToLowerCase,
  stringTrim,
  toNumber,
  toStringValue,
};
