/**
 * ECHO Core — Circuit Breaker
 * Phase 7: Protect against cascading LLM failures.
 */

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeoutMs: number;
  halfOpenMaxCalls: number;
}

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  recoveryTimeoutMs: 30000,
  halfOpenMaxCalls: 1,
};

export interface CircuitBreaker {
  call<T>(fn: () => Promise<T>): Promise<T>;
  getState(): CircuitState;
  getFailureCount(): number;
  recordSuccess(): void;
  recordFailure(): void;
}

export class DefaultCircuitBreaker implements CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private config: CircuitBreakerConfig;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
  }

  getState(): CircuitState {
    if (this.state === 'open') {
      const now = Date.now();
      if (now - this.lastFailureTime >= this.config.recoveryTimeoutMs) {
        this.state = 'half-open';
        this.failureCount = 0;
        this.successCount = 0;
      }
    }
    return this.state;
  }

  getFailureCount(): number {
    return this.failureCount;
  }

  recordSuccess(): void {
    this.failureCount = 0;
    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= this.config.halfOpenMaxCalls) {
        this.state = 'closed';
        this.successCount = 0;
      }
    }
  }

  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (this.state === 'half-open') {
      this.state = 'open';
    } else if (this.state === 'closed' && this.failureCount >= this.config.failureThreshold) {
      this.state = 'open';
    }
  }

  async call<T>(fn: () => Promise<T>): Promise<T> {
    const currentState = this.getState();
    if (currentState === 'open') {
      throw new Error(`Circuit breaker is OPEN for this provider`);
    }
    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (err) {
      this.recordFailure();
      throw err;
    }
  }
}
