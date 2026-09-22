# NuRavenCorpLLM Context Memory

- WiseravenShare social integrations now run through `wiseravenshare.server` plugin architecture.
- Primary contract is `POST /webhook/post` with `{platform, action, data}` and `POST /webhook/<platform>/events` for inbound webhooks.
- Supported platforms: facebook, instagram, tiktok, youtube, linkedin, reddit.
- Prefer capability-aware behavior using `GET /capabilities` and platform readiness checks via `GET /platforms`.
- For long-running media operations, expect queued async flow and job IDs rather than blocking inline responses.
