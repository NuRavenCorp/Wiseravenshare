# DigitalOcean Terraform Scaffold

This directory is the phase 1 infrastructure scaffold for the NuRavenCorpLLM platform.

It is intentionally split into small modules so the three site identities can share core infrastructure while keeping site-scoped configuration and knowledge separate.

## Layout

- `modules/core` - VPC, cluster, registry, and shared platform names
- `modules/data` - PostgreSQL, Redis, Spaces, and retention settings
- `modules/app` - API, frontend, and worker deployment wiring
- `modules/edge` - load balancer, TLS, and host routing
- `environments/stage` - stage variables
- `environments/prod` - production variables

## Phase 1 Scope

This scaffold defines naming, variables, and deployment boundaries first. The actual DigitalOcean resources will be added next once the site routing and data shape are finalized.
