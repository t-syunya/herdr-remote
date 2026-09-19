export class HerdrError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}
export class HerdrUnavailableError extends HerdrError {}
export class TransportDisconnectedError extends HerdrError {}
export class InvalidHerdrResponseError extends HerdrError {}
export class TargetNotFoundError extends HerdrError {}
export class UnsupportedOperationError extends HerdrError {}
export class AgentBlockedError extends HerdrError {}
export class AgentNotReadyError extends HerdrError {}
export class HerdrTimeoutError extends HerdrError {}
export class HerdrOperationError extends HerdrError {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}
