# AGENTS.md

## Project Context

This repository contains the WiseRavenShare frontend.

Start with `README.md` for setup and run commands.

## Key Files

- `src/`: application source code
- `src/api/client.js`: API client used across auth, entities, and function calls
- `vite.config.js`: Vite configuration
- `.env.local`: local-only environment values (never commit secrets)

## Working Notes

- Prefer existing request helpers in `src/api/client.js` before adding new ones.
- Keep changes focused on the requested task.
- Run relevant scripts from `package.json` before finishing.
