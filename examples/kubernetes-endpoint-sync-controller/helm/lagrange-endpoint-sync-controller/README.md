# lagrange-endpoint-sync-controller Chart

This chart deploys a Kubernetes-side endpoint sync controller that projects
Lagrange `service_endpoints` metadata into native Kubernetes objects.

## Runtime entrypoint

Your container image should start:

```bash
node scripts/start-endpoint-sync-controller.js
```

The script reads endpoint-sync env vars plus in-cluster service account
credentials for Kubernetes API access.

If your image does not define this as the default entrypoint, set:

- `controller.command[0]=node`
- `controller.command[1]=scripts/start-endpoint-sync-controller.js`

## Required values

- `source.adminStreamUrl`

## Optional secret

If the source admin API requires a token, create a secret and point the chart
values at it:

```bash
kubectl -n endpoint-sync create secret generic endpoint-sync-auth \
  --from-literal=token='<token>'
```

Then set:

- `source.auth.existingSecret.name=endpoint-sync-auth`
- `source.auth.existingSecret.tokenKey=token`
