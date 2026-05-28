export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainError';
  }
}

export class InvalidProductIdError extends DomainError {
  constructor(productId: string) {
    super(`Invalid product ID: ${productId}`);
    this.name = 'InvalidProductIdError';
  }
}

export class EmptyResponseError extends DomainError {
  constructor(productId: string) {
    super(`Empty response received for product: ${productId}`);
    this.name = 'EmptyResponseError';
  }
}

export class SourceServerError extends DomainError {
  constructor(productId: string, statusCode: number) {
    super(`Source server error for product ${productId}: HTTP ${statusCode}`);
    this.name = 'SourceServerError';
  }
}

export class SourceClientError extends DomainError {
  constructor(productId: string, statusCode: number) {
    super(`Client error for product ${productId}: HTTP ${statusCode}`);
    this.name = 'SourceClientError';
  }
}

export class InvalidResponseStructureError extends DomainError {
  constructor(productId: string, details?: string) {
    super(`Invalid response structure for product ${productId}${details ? `: ${details}` : ''}`);
    this.name = 'InvalidResponseStructureError';
  }
}

export class NetworkError extends DomainError {
  constructor(productId: string, originalError: Error) {
    super(`Network error for product ${productId}: ${originalError.message}`);
    this.name = 'NetworkError';
  }
}

export class RateLimitError extends DomainError {
  constructor(productId: string) {
    super(`Rate limit exceeded for product ${productId}`);
    this.name = 'RateLimitError';
  }
}

export class DataCollectionError extends DomainError {
  constructor(productId: string, collectedCount: number, originalError: Error) {
    super(`Data collection failed for product ${productId} after collecting ${collectedCount} reviews: ${originalError.message}`);
    this.name = 'DataCollectionError';
  }
}