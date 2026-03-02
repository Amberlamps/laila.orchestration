import { describe, it, expect } from 'vitest';

describe('vitest setup', () => {
  it('should run tests in the shared package', () => {
    expect(true).toBe(true);
  });

  it('should have access to the node environment', () => {
    expect(typeof process).toBe('object');
    expect(typeof process.env).toBe('object');
  });
});
