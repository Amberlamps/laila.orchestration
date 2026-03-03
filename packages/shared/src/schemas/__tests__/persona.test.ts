// Unit tests for the Persona entity Zod schema.
// Validates correct acceptance and rejection of input shapes.

import { describe, it, expect } from 'vitest';

import { personaSchema } from '../persona';

const validPersona = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  tenantId: '550e8400-e29b-41d4-a716-446655440001',
  projectId: '550e8400-e29b-41d4-a716-446655440002',
  name: 'Backend Developer',
  description: 'Expert in server-side development with Node.js',
  systemPrompt: 'You are a backend developer specializing in Node.js and TypeScript.',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as const;

describe('personaSchema', () => {
  it('accepts a valid persona', () => {
    const result = personaSchema.safeParse(validPersona);
    expect(result.success).toBe(true);
  });

  it('accepts a persona with null description', () => {
    const result = personaSchema.safeParse({ ...validPersona, description: null });
    expect(result.success).toBe(true);
  });

  it('accepts a persona without description (optional)', () => {
    const result = personaSchema.safeParse({
      id: validPersona.id,
      tenantId: validPersona.tenantId,
      projectId: validPersona.projectId,
      name: validPersona.name,
      systemPrompt: validPersona.systemPrompt,
      createdAt: validPersona.createdAt,
      updatedAt: validPersona.updatedAt,
    });
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

  it('rejects a non-UUID projectId', () => {
    const result = personaSchema.safeParse({ ...validPersona, projectId: 'bad' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty name', () => {
    const result = personaSchema.safeParse({ ...validPersona, name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects name exceeding 255 characters', () => {
    const result = personaSchema.safeParse({
      ...validPersona,
      name: 'x'.repeat(256),
    });
    expect(result.success).toBe(false);
  });

  it('rejects description exceeding 2000 characters', () => {
    const result = personaSchema.safeParse({
      ...validPersona,
      description: 'x'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it('accepts description up to 2000 characters', () => {
    const result = personaSchema.safeParse({
      ...validPersona,
      description: 'x'.repeat(2000),
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty systemPrompt', () => {
    const result = personaSchema.safeParse({ ...validPersona, systemPrompt: '' });
    expect(result.success).toBe(false);
  });

  it('rejects systemPrompt exceeding 50000 characters', () => {
    const result = personaSchema.safeParse({
      ...validPersona,
      systemPrompt: 'x'.repeat(50001),
    });
    expect(result.success).toBe(false);
  });

  it('accepts systemPrompt up to 50000 characters', () => {
    const result = personaSchema.safeParse({
      ...validPersona,
      systemPrompt: 'x'.repeat(50000),
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing systemPrompt', () => {
    const result = personaSchema.safeParse({
      id: validPersona.id,
      tenantId: validPersona.tenantId,
      projectId: validPersona.projectId,
      name: validPersona.name,
      description: validPersona.description,
      createdAt: validPersona.createdAt,
      updatedAt: validPersona.updatedAt,
    });
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
