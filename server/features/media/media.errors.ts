export class MediaForbiddenError extends Error {
  constructor(message = 'No tienes permiso para acceder a este archivo') {
    super(message)
    this.name = 'MediaForbiddenError'
  }
}

export class MediaNotFoundError extends Error {
  constructor(message = 'El recurso multimedia no existe') {
    super(message)
    this.name = 'MediaNotFoundError'
  }
}

export class MediaValidationError extends Error {
  constructor(message = 'Parámetros multimedia inválidos') {
    super(message)
    this.name = 'MediaValidationError'
  }
}
