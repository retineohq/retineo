/**
 * RETINEO Core — Error Hierarchy Tests
 * Phase 7
 */

import { describe, it, expect } from 'vitest';
import {
  BaseRetineoError,
  AdapterError,
  AdapterSpawnFailed,
  AdapterIngestFailed,
  LLMError,
  LLMTimeout,
  LLMRateLimited,
  LLMCircuitOpen,
  SearchError,
  SearchEmpty,
  ConfigError,
  ConfigSecretNotFound,
} from '../../packages/core/src/utils/errors.js';
import { isRetineoError, retineoErrorFrom } from '../../packages/core/src/utils/error-handler.js';

describe('Error Hierarchy', () => {
  it('BaseRetineoError has code, message, statusCode', () => {
    const err = new BaseRetineoError('TEST_CODE', 'test message', 418);
    expect(err.code).toBe('TEST_CODE');
    expect(err.message).toBe('test message');
    expect(err.statusCode).toBe(418);
    expect(err.toJSON()).toEqual({ code: 'TEST_CODE', message: 'test message', statusCode: 418 });
  });

  it('BaseRetineoError includes details and cause', () => {
    const cause = new Error('root');
    const err = new BaseRetineoError('TEST', 'msg', 500, { foo: 'bar' }, cause);
    expect(err.details).toEqual({ foo: 'bar' });
    expect(err.cause).toBe(cause);
  });

  it('AdapterError factory functions produce correct types', () => {
    const err = AdapterSpawnFailed({ adapterId: 'pdf' });
    expect(err.code).toBe('ADAPTER_SPAWN_FAILED');
    expect(err.statusCode).toBe(500);
    expect(err.details).toEqual({ adapterId: 'pdf' });
  });

  it('LLMError factory functions', () => {
    const err = LLMTimeout('openai');
    expect(err.code).toBe('LLM_TIMEOUT');
    expect(err.statusCode).toBe(504);
    expect(err.details).toEqual({ providerId: 'openai' });
  });

  it('LLMCircuitOpen factory', () => {
    const err = LLMCircuitOpen('openai');
    expect(err.code).toBe('LLM_CIRCUIT_OPEN');
    expect(err.statusCode).toBe(503);
  });

  it('SearchEmpty factory', () => {
    const err = SearchEmpty('foo bar');
    expect(err.code).toBe('SEARCH_EMPTY');
    expect(err.statusCode).toBe(404);
  });

  it('ConfigSecretNotFound factory', () => {
    const err = ConfigSecretNotFound('OPENAI_API_KEY');
    expect(err.code).toBe('CONFIG_SECRET_NOT_FOUND');
    expect(err.statusCode).toBe(400);
  });
});

describe('isRetineoError', () => {
  it('returns true for RetineoError instances', () => {
    expect(isRetineoError(new BaseRetineoError('X', 'y', 500))).toBe(true);
  });

  it('returns false for plain Error', () => {
    expect(isRetineoError(new Error('plain'))).toBe(false);
  });

  it('returns false for strings', () => {
    expect(isRetineoError('oops')).toBe(false);
  });
});

describe('retineoErrorFrom', () => {
  it('wraps plain Error', () => {
    const wrapped = retineoErrorFrom(new Error('plain'));
    expect(wrapped.code).toBe('INTERNAL_ERROR');
    expect(wrapped.message).toBe('plain');
    expect(wrapped.statusCode).toBe(500);
  });

  it('passes through RetineoError', () => {
    const original = LLMRateLimited('openai');
    const wrapped = retineoErrorFrom(original);
    expect(wrapped.code).toBe('LLM_RATE_LIMITED');
    expect(wrapped.statusCode).toBe(429);
  });

  it('wraps strings', () => {
    const wrapped = retineoErrorFrom('something broke');
    expect(wrapped.message).toBe('something broke');
  });
});
