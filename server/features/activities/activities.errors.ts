export class ActivityForbiddenError extends Error {
  constructor(message = 'No tienes permiso para acceder a esta actividad') {
    super(message)
    this.name = 'ActivityForbiddenError'
  }
}

export class ActivityNotFoundError extends Error {
  constructor(message = 'Actividad no encontrada') {
    super(message)
    this.name = 'ActivityNotFoundError'
  }
}

export class ActivityValidationError extends Error {
  constructor(message = 'Datos de respuesta inválidos para esta actividad') {
    super(message)
    this.name = 'ActivityValidationError'
  }
}

export class ActivityImmutableConflictError extends Error {
  constructor(message = 'Tu respuesta ya fue enviada y sellada; no puede modificarse') {
    super(message)
    this.name = 'ActivityImmutableConflictError'
  }
}

export class ActivityIdempotencyHitError extends Error {
  public readonly responseBody: unknown
  public readonly responseCode: number

  constructor(responseBody: unknown, responseCode = 200) {
    super('Idempotency key hit')
    this.name = 'ActivityIdempotencyHitError'
    this.responseBody = responseBody
    this.responseCode = responseCode
  }
}
