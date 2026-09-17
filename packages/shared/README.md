# `packages/shared`

Herdr-independent code that is genuinely shared across apps/packages.

Good candidates:

- generic application types
- validation helpers not tied to Herdr
- shared constants with no Herdr transport semantics

Do not move raw Herdr request/response types here. Those belong exclusively in `packages/herdr`.
