# Security Runbook

## Authentication Baseline

The application is configured to fail closed by default.

- Self-registration is disabled unless explicitly enabled.
- Login is restricted to users configured in environment variables.
- Any account not configured in the allowlist cannot authenticate.
- Passwords must include uppercase, lowercase, number, and special character.
- Failed login attempts are rate-limited per IP+identifier with temporary lockout.
- Password reset tokens are only returned in API responses during development.

## Required Production Environment Variables

Set these in your deployment platform for the server component:

- `Authentication__Jwt__Key` with a long random secret (at least 32 characters)
- `Authentication__Jwt__Issuer` (recommended `Wiseravenshare.Server`)
- `Authentication__Jwt__Audience` (recommended `Wiseravenshare.Client`)
- `Authentication__AllowSelfRegistration=false`

For each allowed user:

- `Authentication__Users__0__Name`
- `Authentication__Users__0__Email`
- `Authentication__Users__0__Password`

Add additional users with index increments:

- `Authentication__Users__1__Name`
- `Authentication__Users__1__Email`
- `Authentication__Users__1__Password`

## Verification Checklist After Deploy

1. Ensure login with gibberish credentials fails with `401`.
2. Ensure register endpoint returns `403` when self-registration is disabled.
3. Ensure one allowlisted user can log in successfully.
4. Ensure protected endpoints reject unauthenticated requests with `401`.
5. Ensure repeated failed login attempts receive `429` with `Retry-After` header.

## Regression Script

Run the auth regression script after each deployment:

- `pwsh -File ./scripts/auth-regression-check.ps1 -BaseUrl https://your-domain`

Optional allowlisted login verification without exposing password in command history:

- `$cred = Get-Credential`
- `pwsh -File ./scripts/auth-regression-check.ps1 -BaseUrl https://your-domain -ValidCredential $cred`

If all checks pass, the script exits with `0`.
If any security check fails, the script exits with `2`.
