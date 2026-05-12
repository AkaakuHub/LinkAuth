export class DataConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataConflictError";
  }
}
