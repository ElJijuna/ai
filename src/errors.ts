export class AILibError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AILibError';
  }
}

/** Thrown when a browser does not expose a given built-in AI API at all. */
export class AIFeatureNotSupportedError extends AILibError {
  constructor(feature: string) {
    super(
      `"${feature}" is not supported in this browser. Check availability with isAvailable() before use.`,
    );
    this.name = 'AIFeatureNotSupportedError';
  }
}

/** Thrown when a feature exists but the browser rejected creating a session for it. */
export class AIFeatureUnavailableError extends AILibError {
  constructor(feature: string, reason?: string) {
    super(`"${feature}" is unavailable${reason ? `: ${reason}` : '.'}`);
    this.name = 'AIFeatureUnavailableError';
  }
}
