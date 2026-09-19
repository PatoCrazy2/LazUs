export class CoupleConflictError extends Error {
  constructor(message: string = 'Conflict: One of the users is already in an active couple') {
    super(message)
    this.name = 'CoupleConflictError'
  }
}

export class IdempotencyConflictError extends Error {
  public responseBody: any
  public responseCode: number

  constructor(responseBody: any, responseCode: number) {
    super('Idempotency conflict: operation already executed')
    this.name = 'IdempotencyConflictError'
    this.responseBody = responseBody
    this.responseCode = responseCode
  }
}
