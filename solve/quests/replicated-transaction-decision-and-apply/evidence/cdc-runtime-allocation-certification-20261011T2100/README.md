# CDC runtime/allocation certification packet

This directory records the bounded prerequisite for implementing the approved
CDC transport/resource design. It does not approve or implement product source.

The production observation is always addressed by immutable manifest digest:

```text
docker.io/psvensson/lagrange@sha256:b58d44906ac09ffbb7959f717ce5f1a50b087dbd74431e506620a581a894da17
```

Run the exact production capture from this directory with:

```sh
sh capture-production-image.sh
```

`capture-production-image.sh` contains every Docker command and produces the
raw OCI manifest, full local image inspection, exact runtime/content inventory,
and SHA-256 list. The inventory uses the same length-framed content-record
algorithm as `src/diagnostics/source-fingerprint.js` and the proposed existing
runtime provenance owner. The script reads the image and registry; it does not
modify product source or deploy anything.

Run the remaining captures and checks with these exact commands:

    sh capture-production-release-source.sh
    sh capture-upstream-native-sources.sh
    sh run-ws-fragment-root-probe.sh
    sh run-adrop-runtime-probe.sh
    sh run-approved-ledger.sh
    sh refresh-packet-manifest.sh

The upstream capture downloads only the versioned official Node and libuv
source URLs spelled out in the script. The two probes run only the immutable
production image manifest. The allocation ledger performs integer arithmetic
over the approved equations. The packet manifest excludes itself.
