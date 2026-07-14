import {EXTERNAL_SERVICE_MEDIA_TYPE} from './external-service-manifest.js';

const OCI_IMAGE_LAYOUT_VERSION = '1.0.0';
const OCI_IMAGE_SCHEMA_VERSION = 2;
const OCI_IMAGE_MANIFEST_MEDIA_TYPE =
  EXTERNAL_SERVICE_MEDIA_TYPE.OCI_CONTAINER;
const OCI_IMAGE_CONFIG_MEDIA_TYPE =
  'application/vnd.oci.image.config.v1+json';
const OCI_EMPTY_CONFIG_MEDIA_TYPE = 'application/vnd.oci.empty.v1+json';
const OCI_LAGRANGE_ANNOTATION = Object.freeze({
  BUILD_INPUT_FINGERPRINT: 'org.lagrange.service.build-input-fingerprint',
  PLATFORM: 'org.lagrange.service.platform',
});
const OCI_CONTAINER_LAYER_MEDIA_TYPES = Object.freeze([
  'application/vnd.oci.image.layer.v1.tar',
  'application/vnd.oci.image.layer.v1.tar+gzip',
  'application/vnd.oci.image.layer.v1.tar+zstd',
  'application/vnd.oci.image.layer.nondistributable.v1.tar',
  'application/vnd.oci.image.layer.nondistributable.v1.tar+gzip',
  'application/vnd.oci.image.layer.nondistributable.v1.tar+zstd',
]);

function canonicalOciJsonValue(value) {
  if (Array.isArray(value)) return value.map(canonicalOciJsonValue);
  if (!value || typeof value !== 'object' || Buffer.isBuffer(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) =>
      [key, canonicalOciJsonValue(value[key])]),
  );
}

function canonicalOciJsonBytes(value) {
  return Buffer.from(JSON.stringify(canonicalOciJsonValue(value)));
}

export {
  OCI_CONTAINER_LAYER_MEDIA_TYPES,
  OCI_EMPTY_CONFIG_MEDIA_TYPE,
  OCI_IMAGE_CONFIG_MEDIA_TYPE,
  OCI_IMAGE_LAYOUT_VERSION,
  OCI_IMAGE_MANIFEST_MEDIA_TYPE,
  OCI_IMAGE_SCHEMA_VERSION,
  OCI_LAGRANGE_ANNOTATION,
  canonicalOciJsonBytes,
};
