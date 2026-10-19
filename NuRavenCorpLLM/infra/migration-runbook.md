# Migration Runbook

This repository now uses a three-site, one-cluster model:

- WiseRavenShare -> `wiseravenshare-app`
- VoterAlliance -> `voteralliance-app`
- WiseRavenStream -> `wiseravenstream-app`

The matching site sources are:

- `E:\NuRavenCorp\Wiseravenshare\Wiseravenshare`
- `E:\NuRavenCorp\Voter-Alliance`
- `E:\NuRavenCorp\wiseravenstream`

## Order Of Work

1. Inspect each source tree separately.
2. Identify the config that sets the database connection string, site key, and site domain.
3. Point each site at the shared DigitalOcean PostgreSQL cluster, but keep the site-specific `-app` database name.
4. Use a non-admin user per site.
5. Keep `sslmode=require` enabled.
6. Validate each site independently before cutover.
7. Retire the old database or credentials only after the replacement is proven stable.

## Final Runtime Mapping

### WiseRavenShare

- Site key: `wiseravenshare`
- Database: `wiseravenshare-app`
- App user: site-scoped non-admin user
- Source: `E:\NuRavenCorp\Wiseravenshare\Wiseravenshare`

### VoterAlliance

- Site key: `voteralliance`
- Database: `voteralliance-app`
- App user: `voteralliance_app`
- Source: `E:\NuRavenCorp\Voter-Alliance`

### WiseRavenStream

- Site key: `wiseravenstream`
- Database: `wiseravenstream-app`
- App user: `wiseravenstream_app`
- Source: `E:\NuRavenCorp\wiseravenstream`

## Local Development

For local Docker Compose:

- database: `nuraven-app`
- user: `nuraven_app`
- folder knowledge root: `E:\NuRavenCorp123`

## Cutover Rule

Do not delete or disable any legacy database, user, or secret until:

- the app starts successfully
- core read/write flows work
- logs show the new connection string in use
- at least one successful rollback window has passed
