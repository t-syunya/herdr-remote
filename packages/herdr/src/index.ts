export { createHerdrClient } from "./client.js";
export {
  AgentBlockedError,
  AgentNotReadyError,
  HerdrOperationError,
  HerdrTimeoutError,
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
