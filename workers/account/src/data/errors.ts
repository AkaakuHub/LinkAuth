export class DataConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataConflictError";
  }
}

export class InactiveUserError extends Error {
  constructor() {
    super("inactive user");
    this.name = "InactiveUserError";
  }
}

export class InvalidDataInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDataInputError";
  }
}

export class RateLimitedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitedError";
  }
}
