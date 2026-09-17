# `packages/herdr`

Herdr integration adapter / anti-corruption layer.

## Owns

- Herdr local socket transport
- raw Herdr method names
- raw request/response types
- compatibility handling
- raw -> stable domain mapping
- status normalization
- special-key mapping
- Herdr-specific error translation

## Must not leak

Do not export raw Herdr payload types to `apps/server`, `apps/web`, or `packages/shared`.

The public package API should expose stable application-oriented models and operations only.

## Implementation prerequisite

Do not finalize the public adapter API until `docs/herdr-api-spike.md` contains real observations from the installed Herdr version.
