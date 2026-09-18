# `/.well-known/assetlinks.json`

This file is how Android decides whether the 8338 Logistics app is allowed to
create and use **passkeys** for this domain. Android fetches it itself, over
HTTPS, with no cookies — which is why `/.well-known` is listed in `PUBLIC_PATHS`
in `src/proxy.ts`.

**It currently authorises nothing.** `sha256_cert_fingerprints` is an empty
array, so passkey enrolment will fail on every build. That is deliberate: it
fails closed until the real values are known, rather than appearing to work.

## Filling it in

Two things must happen first, in this order:

1. **The production domain must be decided and live.** The WebAuthn RP ID is
   baked permanently into every credential ever created — change it later and
   every enrolled driver must start again from a fresh invite. Use the
   registrable apex (`8338logistics.ph`), not a subdomain: a credential scoped to
   the apex can be used from any subdomain afterwards, while one scoped to
   `app.` can never be used from the apex. Do **not** enrol real drivers against
   a `*.vercel.app` hostname.

2. **Collect every signing certificate SHA-256 that will ever sign the app.**
   There is more than one, and this is the single most common reason a passkey
   integration works in testing and breaks in production:

   - the **EAS / internal build** key — `eas credentials -p android`
   - the **Play App Signing** key — Play Console → Setup → App signing
     (Google re-signs uploads, so this differs from the upload key)
   - the **local debug** keystore, if enrolling from `expo run:android` during
     development — never ship this one to production

Put all applicable fingerprints in the array, colon-separated uppercase hex:

```json
"sha256_cert_fingerprints": [
  "AA:BB:CC:...:99",
  "11:22:33:...:FF"
]
```

## Keep it in step with the backend

The same certificates also have to appear in the backend's
`WEBAUTHN_ALLOWED_ORIGINS`, in Android's native origin form:

```
android:apk-key-hash:<base64url of the SHA-256 digest bytes>
```

Note the different encoding — this file uses colon-separated hex, the origin uses
base64url of the same digest. If the two disagree, verification fails with an
error that gives no hint as to why.

The backend env needs, roughly:

```
WEBAUTHN_RP_ID=8338logistics.ph
WEBAUTHN_RP_NAME=8338 Logistics
WEBAUTHN_ALLOWED_ORIGINS=android:apk-key-hash:<eas>,android:apk-key-hash:<play>,https://8338logistics.ph
FRONTEND_URL=https://8338logistics.ph
```

## Verifying

Before enrolling anyone, confirm the file is served correctly — over HTTPS, with
no redirect, as `application/json`:

```
curl -sI https://<domain>/.well-known/assetlinks.json
```

Then check it through Google's own validator:

```
https://digitalassetlinks.googleapis.com/v1/statements:list
  ?source.web.site=https://<domain>
  &relation=delegate_permission/common.get_login_creds
```

Next **does** serve this dot-directory from `public/` — verified 2026-09-17
against a production build, returning `application/json`. No route handler is
needed.

The gotcha is the proxy, not the static handler. Before `/.well-known` was added
to `PUBLIC_PATHS` in `src/proxy.ts`, this path answered **307 → `/`** on the
deployed site, because the middleware runs ahead of static files and treated it
as an unauthenticated page request. Android follows no redirect here — it just
sees a non-JSON response and silently refuses the passkey. If enrolment fails
with no useful error, re-check this path first:

```
curl -sI https://<domain>/.well-known/assetlinks.json   # want 200 + application/json, no Location
```

## What this file is *not* for

It does not make `https://` links open the app. That is App Links, a separate
mechanism needing `handle_all_urls` here plus `autoVerify` intent filters in the
app — and it is deliberately not used: the driver setup email points at
`/driver-setup`, which hands off to the app's custom scheme. That works from a
desktop mailbox and from a phone without the app installed, neither of which App
Links handles.
