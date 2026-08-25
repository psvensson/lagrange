import {appendArrayValue} from
  './readiness-planning-version-contract.js';
import {defineRecordValue} from
  './readiness-planning-publication-contract.js';
import {copyDenseOwnDataArray} from '../utils/strict-own-data.js';

const MapConstructor = Map;
const mapClear = Function.call.bind(Map.prototype.clear);
const mapDelete = Function.call.bind(Map.prototype.delete);
const mapForEach = Function.call.bind(Map.prototype.forEach);
const mapGet = Function.call.bind(Map.prototype.get);
const mapHas = Function.call.bind(Map.prototype.has);
const mapSet = Function.call.bind(Map.prototype.set);
const mapSize = Function.call.bind(
  Object.getOwnPropertyDescriptor(Map.prototype, 'size').get,
);
const objectCreate = Object.create;
const objectFreeze = Object.freeze;
const READINESS_PLANNING_DIAGNOSTIC_SAMPLE_CAPACITY = 256;

class ReadinessPlanningDiagnosticRetention {
  constructor() {
    this.buildOwnerKeys = [];
    this.nextBuildOwnerKeySampleIndex = 0;
    this.droppedBuildOwnerKeySampleCount = 0;
    this.buildsByToken = new MapConstructor();
    this.droppedBuildTokenSampleCount = 0;
  }

  record(ownerKey, tokenKey) {
    this._recordOwnerKey(ownerKey);
    this._recordToken(tokenKey);
  }

  _recordOwnerKey(ownerKey) {
    if (
      this.buildOwnerKeys.length <
      READINESS_PLANNING_DIAGNOSTIC_SAMPLE_CAPACITY
    ) {
      appendArrayValue(this.buildOwnerKeys, ownerKey);
      return;
    }
    defineRecordValue(
      this.buildOwnerKeys,
      this.nextBuildOwnerKeySampleIndex,
      ownerKey,
    );
    this.nextBuildOwnerKeySampleIndex =
      (this.nextBuildOwnerKeySampleIndex + 1) %
      READINESS_PLANNING_DIAGNOSTIC_SAMPLE_CAPACITY;
    this.droppedBuildOwnerKeySampleCount++;
  }

  _recordToken(tokenKey) {
    if (mapHas(this.buildsByToken, tokenKey)) {
      mapSet(
        this.buildsByToken,
        tokenKey,
        (mapGet(this.buildsByToken, tokenKey) || 0) + 1,
      );
      return;
    }
    if (
      mapSize(this.buildsByToken) >=
      READINESS_PLANNING_DIAGNOSTIC_SAMPLE_CAPACITY
    ) {
      let oldestTokenKey = '';
      let oldestTokenKeyFound = false;
      mapForEach(this.buildsByToken, (_count, candidateTokenKey) => {
        if (!oldestTokenKeyFound) {
          oldestTokenKey = candidateTokenKey;
          oldestTokenKeyFound = true;
        }
      });
      if (oldestTokenKeyFound) {
        mapDelete(this.buildsByToken, oldestTokenKey);
        this.droppedBuildTokenSampleCount++;
      }
    }
    mapSet(this.buildsByToken, tokenKey, 1);
  }

  snapshot() {
    const buildsByToken = objectCreate(null);
    mapForEach(this.buildsByToken, (buildCount, tokenKey) => {
      defineRecordValue(buildsByToken, tokenKey, buildCount);
    });
    return objectFreeze({
      diagnosticSampleCapacity:
        READINESS_PLANNING_DIAGNOSTIC_SAMPLE_CAPACITY,
      buildOwnerKeys: objectFreeze(this._copyBuildOwnerKeys()),
      droppedBuildOwnerKeySampleCount:
        this.droppedBuildOwnerKeySampleCount,
      buildsByToken: objectFreeze(buildsByToken),
      droppedBuildTokenSampleCount: this.droppedBuildTokenSampleCount,
    });
  }

  _copyBuildOwnerKeys() {
    if (this.droppedBuildOwnerKeySampleCount === 0) {
      return copyDenseOwnDataArray(this.buildOwnerKeys);
    }
    const samples = [];
    for (let offset = 0; offset < this.buildOwnerKeys.length; offset++) {
      const index =
        (this.nextBuildOwnerKeySampleIndex + offset) %
        this.buildOwnerKeys.length;
      appendArrayValue(samples, this.buildOwnerKeys[index]);
    }
    return samples;
  }

  clear() {
    this.buildOwnerKeys = [];
    this.nextBuildOwnerKeySampleIndex = 0;
    mapClear(this.buildsByToken);
  }
}

export {ReadinessPlanningDiagnosticRetention};
