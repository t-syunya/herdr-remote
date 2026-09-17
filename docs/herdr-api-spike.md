# Herdr API Spike

This document must contain observations from the actual installed Herdr version before adapter implementation is finalized.

## Environment

- Date:
- macOS version:
- Herdr version:
- Herdr install method:
- Socket path:

## Schema / capabilities

Record the output or relevant summary of the installed API schema.

- [ ] workspace operations verified
- [ ] tab operations verified
- [ ] pane list/read verified
- [ ] text input verified
- [ ] special-key input verified
- [ ] agent list/read verified
- [ ] agent prompt/input verified
- [ ] event/subscription capability checked

## Observed identifiers

### Workspace

TBD

### Tab

TBD

### Pane

TBD

### Agent

TBD

## Pane read behavior

TBD

Questions to resolve:

- Is output a full snapshot, delta, terminal frame, or something else?
- How is truncation represented?
- Are ANSI/control sequences present?

## Input behavior

### Text

TBD

### Special keys

TBD

Confirm at least:

- Enter
- Escape
- Ctrl+C
- Arrow Up/Down/Left/Right

## Agent behavior

TBD

Record actual raw status values and propose mappings to:

- `idle`
- `working`
- `blocked`
- `done`
- `unknown`

## Failure / lifecycle behavior

Check:

- [ ] Herdr not running
- [ ] socket disconnect
- [ ] Herdr restart
- [ ] stale/invalid pane ID
- [ ] unsupported method
- [ ] malformed/unexpected response

## Documentation differences

List any difference between the installed version and public documentation/previous assumptions.

TBD

## Adapter decisions resulting from spike

TBD
