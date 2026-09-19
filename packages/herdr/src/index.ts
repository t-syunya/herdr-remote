export { createHerdrClient } from "./client.js";
export {
  HerdrOperationError,
  HerdrUnavailableError,
  InvalidHerdrResponseError,
  TargetNotFoundError,
  TransportDisconnectedError,
  UnsupportedOperationError,
} from "./errors.js";
export type {
  Agent,
  AgentStatus,
  HerdrClient,
  HerdrClientOptions,
  Pane,
  PaneOutput,
  SpecialKey,
  Tab,
  Workspace,
} from "./domain.js";
