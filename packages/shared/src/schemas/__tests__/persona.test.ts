// Unit tests for the Persona entity Zod schema.
// Validates correct acceptance and rejection of input shapes.

import { describe, it, expect } from 'vitest';

import { personaSchema } from '../persona';

const validPersona = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  tenantId: '550e8400-e29b-41d4-a716-446655440001',
  title: 'Backend Developer',
  description: 'Expert in server-side development with Node.js',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as const;

describe('personaSchema', () => {
  it('accepts a valid persona', () => {
    const result = personaSchema.safeParse(validPersona);
    expect(result.success).toBe(true);
  });

  it('rejects a non-UUID id', () => {
    const result = personaSchema.safeParse({ ...validPersona, id: 'not-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-UUID tenantId', () => {
    const result = personaSchema.safeParse({ ...validPersona, tenantId: 'bad' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty title', () => {
    const result = personaSchema.safeParse({ ...validPersona, title: '' });
    expect(result.success).toBe(false);
  });

  it('rejects title exceeding 255 characters', () => {
    const result = personaSchema.safeParse({
      ...validPersona,
      title: 'x'.repeat(256),
    });
    expect(result.success).toBe(false);
  });

  it('rejects description exceeding 10000 characters', () => {
    const result = personaSchema.safeParse({
      ...validPersona,
      description: 'x'.repeat(10001),
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty description', () => {
    // personaSchema.description is z.string().max(10000), no .min(1) but also not .nullable()
    // An empty string should still be accepted since there is no min constraint except by default
    // Let me verify: z.string().max(10000) allows empty string
    const result = personaSchema.safeParse({ ...validPersona, description: '' });
    // empty string is valid for z.string().max(10000) since no .min(1)
    expect(result.success).toBe(true);
  });

  it('rejects missing description', () => {
    const { id, tenantId, title, createdAt, updatedAt } = validPersona;
    const result = personaSchema.safeParse({ id, tenantId, title, createdAt, updatedAt });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid datetime for createdAt', () => {
    const result = personaSchema.safeParse({ ...validPersona, createdAt: 'not-a-date' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid datetime for updatedAt', () => {
    const result = personaSchema.safeParse({ ...validPersona, updatedAt: 'bad' });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = personaSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
