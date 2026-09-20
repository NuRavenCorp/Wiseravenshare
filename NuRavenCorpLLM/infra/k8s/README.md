# Kubernetes Deployment Layout

This directory contains the phase 3 Kubernetes manifests for the NuRavenCorpLLM platform.

The layout is split into:

- `base` - shared app, config, storage, and service primitives
- `overlays/wiseravenshare` - WiseRavenShare site deployment
- `overlays/voteralliance` - VoterAlliance site deployment
- `overlays/wiseravenstream` - WiseRavenStream site deployment

Each overlay uses its own namespace, site config, and ingress host, while sharing the same application image and base manifest shape.
