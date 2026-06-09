# Webhook Login And Headers Review

This note explains how the current webhook flow works, how login and headers are handled, and what should be tightened before using the harness outside a local demo.

## Files Reviewed

- `server/proxy.js`
- `public/pages/test-harness.html`
- `public/pages/Invoice.html`
- `public/pages/KYC.html`
- `config/workhq-config.example.json`
- `README.md`

## Current Flow

The browser pages do not call WorkHQ directly. They call the local Express proxy on `http://localhost:3000`.

There are two patterns:

1. `test-harness.html`
   - User clicks `Login`.
   - Browser calls `GET http://localhost:3000/token`.
   - The proxy requests a WorkHQ access token using the configured service account.
   - The browser stores the returned token in the page variable `bearerToken`.
   - User clicks `Send Request`.
   - Browser posts `{ endpoint, method, token, body }` to `POST http://localhost:3000/proxy`.
   - The proxy forwards the request to the selected webhook endpoint with the bearer token.

2. Demo pages such as `Invoice.html` and `KYC.html`
   - User clicks the submit button.
   - The page calls `GET /token` automatically.
   - The page then calls `POST /proxy` with the webhook endpoint, method, token, and payload.
   - The output section shows the payload and response.

## Login And Token Handling

`server/proxy.js` loads WorkHQ config from environment variables first, then `config/workhq-config.json`.

Required WorkHQ settings:

- `tenantId`
- `tenantDomain`
- `clientId`
- `clientSecret`
- `region`

The token request is sent to:

```text
https://{tenantDomain}/realms/{tenantId}/protocol/openid-connect/token
```

The proxy uses the OAuth client credentials grant:

```text
client_id={clientId}
client_secret={clientSecret}
grant_type=client_credentials
```

Token request headers:

```http
Content-Type: application/x-www-form-urlencoded
```

The `/token` endpoint currently returns the full token response to the browser. That is acceptable for a local demo harness, but it is not the safest design for a shared or hosted tool.

## Webhook Request Headers

The browser sends this request to the local proxy:

```http
POST http://localhost:3000/proxy
Content-Type: application/json
```

The body contains:

```json
{
  "endpoint": "https://.../api/workflows/v1/webhooks/.../sync",
  "method": "POST",
  "token": "access-token",
  "body": {
    "eventId": "EVT-...",
    "eventType": "...",
    "receivedAt": "...",
    "request": {}
  }
}
```

The proxy forwards the webhook call with:

```http
Content-Type: application/json
Authorization: Bearer {token}
```

For `GET` and `DELETE`, the proxy omits the request body. For other methods, it sends `JSON.stringify(body)`.

## What Works Well

- Service account secrets are kept out of browser source files.
- The real local config file is ignored by git.
- The test harness masks the token in the visible `Request Sent` output.
- Invoice and KYC flows fetch tokens automatically, which makes the demo easier to run.
- JSON payloads are displayed before or after submission, which is useful for walkthroughs.
- File upload payloads in KYC have a size limit before they are sent through the proxy.

## Issues And Risks

1. Browser receives the bearer token

   `/token` returns the access token to the browser. Any browser script on the page can read it. For a local trusted demo this is manageable, but a safer architecture is for the server to own the token and never send it to the browser.

2. `/proxy` is an open forwarder

   The proxy accepts any `endpoint` from the browser and forwards the request with a bearer token. This should be restricted to allowed WorkHQ domains or known webhook URL patterns.

3. Token is passed back from browser to proxy

   The browser gets the token, then sends it back to `/proxy`. This is unnecessary. The proxy can fetch/cache the token internally when forwarding the webhook.

4. No token caching

   Every submit calls `/token`. That is simple, but it can add latency and unnecessary auth traffic. The proxy should cache tokens until shortly before expiry.

5. Hardcoded localhost URLs

   Pages call `http://localhost:3000/...` directly. That works locally, but makes deployment or port changes harder. Prefer relative proxy URLs or a shared config value.

6. Hardcoded webhook URLs

   `Invoice.html` has a fixed `WEBHOOK_URL`. `KYC.html` allows editing the URL. For maintainability, webhook URLs should come from config, page settings, or a central environment selector.

7. Proxy response body is returned as text

   `/proxy` reads the upstream response with `text()` and returns it as a string in JSON. This means JSON responses are nested as escaped text. It is usable, but less clean for debugging.

8. Missing `Accept` header on webhook forwarding

   `/proxy` sends `Content-Type` and `Authorization`, but not `Accept: application/json`. Many APIs do not require it, but adding it makes intent clearer.

9. Method is not normalized or validated

   `/proxy` uses whatever `method` the browser sends. It should uppercase and validate against a small allowed list.

10. Archived page still shows the old direct-call pattern

   `public/archive/Invoice-copy.html.old` still contains a direct `Authorization: Bearer ...` pattern. It is archived, but it can confuse future readers. Add a note in the archive file or remove it if no longer needed.

## Recommended Changes

### Short Term

- Change `/proxy` so it gets the token server-side instead of receiving `token` from the browser.
- Add `Accept: application/json` to forwarded webhook/API calls.
- Validate `endpoint` so it only targets trusted WorkHQ domains and webhook paths.
- Normalize `method = method.toUpperCase()` and reject unsupported methods.
- Update pages to call `/proxy` with `{ endpoint, method, body }` only.
- Parse upstream JSON responses before returning them where possible.
- Replace hardcoded `http://localhost:3000` with a shared proxy base or relative URL.

### Medium Term

- Cache the service account token in `server/proxy.js` using `expires_in`.
- Move webhook URLs into a local config file or an environment selector.
- Add a visible error when WorkHQ config is incomplete.
- Add a small smoke test for `/token` and `/proxy` behavior with mocked upstream calls.
- Remove or clearly label archived direct-auth examples.

## Cleaner Target Design

The preferred flow is:

```text
Browser page
  -> POST /proxy
     { endpoint, method, body }

Local proxy
  -> validates endpoint and method
  -> gets or reuses WorkHQ service account token
  -> sends webhook request with Authorization header
  -> parses and returns response
```

In that model, the browser never sees the bearer token.

## Example Improved Proxy Contract

Browser request:

```json
{
  "endpoint": "https://presales.nextgen.blueprism.com/regions/eu-central/api/workflows/v1/webhooks/example/sync",
  "method": "POST",
  "body": {
    "eventId": "EVT-10001",
    "eventType": "invoice_received"
  }
}
```

Forwarded WorkHQ request:

```http
POST /regions/eu-central/api/workflows/v1/webhooks/example/sync
Accept: application/json
Content-Type: application/json
Authorization: Bearer {server-owned-token}
```

This keeps the demo simple while reducing token exposure and making the request path easier to reason about.
