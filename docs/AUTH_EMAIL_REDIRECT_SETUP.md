# PLAY80: Supabase email verification redirect (production project)

Project ref: `suhpmjqrcqkzaslptpca` (PLAY80 only). This does not affect Hossain Group.

## Confirmed

- The official, branded confirmation landing page is deployed as Supabase Edge Function `play80-auth-confirmed`, status `ACTIVE`, with public HTTPS URL:
  `https://suhpmjqrcqkzaslptpca.supabase.co/functions/v1/play80-auth-confirmed`
- The mobile app calls `POST /auth/v1/signup` without an explicit redirect override. Supabase therefore uses its configured Auth **Site URL** for normal confirmation links. Previously `http://localhost:3000` was used and the browser showed `ERR_CONNECTION_REFUSED` after the verification had already succeeded.

## Required one-time Supabase Dashboard change

1. Open `https://supabase.com/dashboard/project/suhpmjqrcqkzaslptpca/auth/url-configuration`.
2. In Authentication → URL Configuration, set **Site URL** to the HTTPS Edge Function URL above (not `localhost:3000`). Save.
3. Add exactly the same HTTPS URL to **Redirect URLs** / allow list if this project dashboard asks for additional URLs. Avoid broad wildcard redirects.
4. Check the email template **Confirm signup** still uses the Supabase verification action (`{{ .ConfirmationURL }}`), so the server validates tokens *before* redirecting to the landing page. Do not replace the confirmation link with a raw link to the Edge Function.
5. On a new test customer email, create an account → click verification email → verify the destination is the PLAY80 confirmation page (rather than `localhost`) → return to app and log in using email and six-digit PIN.

Existing verified Owner accounts need not re-register. Avoid publishing registration PINs, access tokens, or confirmation links.

**Cannot mark fixed until:** Dashboard **Site URL** change is saved, and an actual new customer-email confirmation succeeds. The Supabase connector in this environment can deploy functions but does not expose the hosted Auth configuration write endpoint.

## Important boundary

This page is a **confirmation landing screen**, not an app session handler. It does not store any tokens, and the user signs in to PLAY80 after confirmation. PIN recovery is a separate flow and requires an appropriate recovery handler; do not infer recovery works from confirmation alone.
