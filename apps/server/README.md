# `apps/server`

Hono backend and Hono RPC contract.

## Responsibilities

- expose application-facing RPC routes
- validate browser inputs
- call the stable `packages/herdr` adapter API
- translate adapter errors into application/API errors
- compose application use cases

## Boundary rule

This app must not parse Herdr raw payloads, know Herdr socket method names, or depend on raw Herdr types.
