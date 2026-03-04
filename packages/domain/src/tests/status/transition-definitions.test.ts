// Unit tests for status transition definitions and validation.
// Verifies that transition maps are correct, validateTransition accepts/rejects
// as expected, and getAllowedTransitions returns the right targets.

import { describe, it, expect } from 'vitest';

import {
  TASK_TRANSITIONS,
  USER_STORY_TRANSITIONS,
  PROJECT_TRANSITIONS,
  validateTransition,
  getAllowedTransitions,
} from '../../status/transition-definitions';

import type {
  TaskStatus,
  UserStoryStatus,
  ProjectStatus,
  TransitionMap,
} from '../../status/transition-definitions';

// ---------------------------------------------------------------------------
// Helper: extract all valid (from, to) pairs from a transition map.
// ---------------------------------------------------------------------------
const allValidPairs = <S extends string>(map: TransitionMap<S>): Array<[S, S]> => {
  const pairs: Array<[S, S]> = [];
  for (const from of Object.keys(map) as S[]) {
    for (const to of map[from]) {
      pairs.push([from, to]);
    }
  }
  return pairs;
};

// ---------------------------------------------------------------------------
// Helper: extract terminal states (no outgoing transitions).
// ---------------------------------------------------------------------------
const terminalStates = <S extends string>(map: TransitionMap<S>): S[] =>
  (Object.keys(map) as S[]).filter((s) => map[s].length === 0);

// ---------------------------------------------------------------------------
// Helper: extract ALL invalid (from, to) pairs from a transition map.
// Generates the exhaustive complement of allValidPairs — every pair that
// is NOT in the valid set (including self-transitions).
// ---------------------------------------------------------------------------
const allInvalidPairs = <S extends string>(map: TransitionMap<S>): Array<[S, S]> => {
  const validSet = new Set(allValidPairs(map).map(([from, to]) => `${from}::${to}`));
  const allStates = Object.keys(map) as S[];
  const pairs: Array<[S, S]> = [];
  for (const from of allStates) {
    for (const to of allStates) {
      if (!validSet.has(`${from}::${to}`)) {
        pairs.push([from, to]);
      }
    }
  }
  return pairs;
};

// ===========================================================================
// Task Transitions
// ===========================================================================
describe('TASK_TRANSITIONS', () => {
  it('covers all TaskStatus values', () => {
    const expected: TaskStatus[] = ['not-started', 'in-progress', 'complete', 'blocked'];
    const actual = Object.keys(TASK_TRANSITIONS);
    expect(actual.sort()).toEqual(expected.sort());
  });

  it('allows not-started -> in-progress', () => {
    expect(TASK_TRANSITIONS['not-started']).toContain('in-progress');
  });

  it('allows not-started -> blocked', () => {
    expect(TASK_TRANSITIONS['not-started']).toContain('blocked');
  });

  it('allows in-progress -> complete', () => {
    expect(TASK_TRANSITIONS['in-progress']).toContain('complete');
  });

  it('allows blocked -> not-started', () => {
    expect(TASK_TRANSITIONS['blocked']).toContain('not-started');
  });

  it('has "complete" as the only terminal state', () => {
    expect(terminalStates(TASK_TRANSITIONS)).toEqual(['complete']);
  });

  it('does not allow complete -> any state', () => {
    expect(TASK_TRANSITIONS['complete']).toEqual([]);
  });
});

// ===========================================================================
// User Story Transitions
// ===========================================================================
describe('USER_STORY_TRANSITIONS', () => {
  it('covers all UserStoryStatus values', () => {
    const expected: UserStoryStatus[] = [
      'draft',
      'not-started',
      'in-progress',
      'complete',
      'failed',
      'blocked',
    ];
    const actual = Object.keys(USER_STORY_TRANSITIONS);
    expect(actual.sort()).toEqual(expected.sort());
  });

  it('allows draft -> not-started', () => {
    expect(USER_STORY_TRANSITIONS['draft']).toContain('not-started');
  });

  it('allows draft -> blocked', () => {
    expect(USER_STORY_TRANSITIONS['draft']).toContain('blocked');
  });

  it('allows not-started -> in-progress', () => {
    expect(USER_STORY_TRANSITIONS['not-started']).toContain('in-progress');
  });

  it('allows not-started -> blocked', () => {
    expect(USER_STORY_TRANSITIONS['not-started']).toContain('blocked');
  });

  it('allows in-progress -> complete', () => {
    expect(USER_STORY_TRANSITIONS['in-progress']).toContain('complete');
  });

  it('allows in-progress -> failed', () => {
    expect(USER_STORY_TRANSITIONS['in-progress']).toContain('failed');
  });

  it('allows blocked -> not-started', () => {
    expect(USER_STORY_TRANSITIONS['blocked']).toContain('not-started');
  });

  it('allows failed -> not-started', () => {
    expect(USER_STORY_TRANSITIONS['failed']).toContain('not-started');
  });

  it('allows failed -> blocked', () => {
    expect(USER_STORY_TRANSITIONS['failed']).toContain('blocked');
  });

  it('has "complete" as the only terminal state', () => {
    expect(terminalStates(USER_STORY_TRANSITIONS)).toEqual(['complete']);
  });

  it('does not allow complete -> any state', () => {
    expect(USER_STORY_TRANSITIONS['complete']).toEqual([]);
  });
});

// ===========================================================================
// Project Transitions
// ===========================================================================
describe('PROJECT_TRANSITIONS', () => {
  it('covers all ProjectStatus values', () => {
    const expected: ProjectStatus[] = ['draft', 'ready', 'in-progress', 'complete'];
    const actual = Object.keys(PROJECT_TRANSITIONS);
    expect(actual.sort()).toEqual(expected.sort());
  });

  it('allows draft -> ready', () => {
    expect(PROJECT_TRANSITIONS['draft']).toContain('ready');
  });

  it('allows ready -> draft (edit mode)', () => {
    expect(PROJECT_TRANSITIONS['ready']).toContain('draft');
  });

  it('allows ready -> in-progress', () => {
    expect(PROJECT_TRANSITIONS['ready']).toContain('in-progress');
  });

  it('allows in-progress -> complete', () => {
    expect(PROJECT_TRANSITIONS['in-progress']).toContain('complete');
  });

  it('has "complete" as the only terminal state', () => {
    expect(terminalStates(PROJECT_TRANSITIONS)).toEqual(['complete']);
  });

  it('does not allow complete -> any state', () => {
    expect(PROJECT_TRANSITIONS['complete']).toEqual([]);
  });
});

// ===========================================================================
// validateTransition
// ===========================================================================
describe('validateTransition', () => {
  describe('accepts valid transitions', () => {
    const taskPairs = allValidPairs(TASK_TRANSITIONS);
    it.each(taskPairs)('task: %s -> %s is valid', (from, to) => {
      const result = validateTransition(TASK_TRANSITIONS, from, to);
      expect(result.valid).toBe(true);
      expect(result.from).toBe(from);
      expect(result.to).toBe(to);
    });

    const storyPairs = allValidPairs(USER_STORY_TRANSITIONS);
    it.each(storyPairs)('user story: %s -> %s is valid', (from, to) => {
      const result = validateTransition(USER_STORY_TRANSITIONS, from, to);
      expect(result.valid).toBe(true);
      expect(result.from).toBe(from);
      expect(result.to).toBe(to);
    });

    const projectPairs = allValidPairs(PROJECT_TRANSITIONS);
    it.each(projectPairs)('project: %s -> %s is valid', (from, to) => {
      const result = validateTransition(PROJECT_TRANSITIONS, from, to);
      expect(result.valid).toBe(true);
      expect(result.from).toBe(from);
      expect(result.to).toBe(to);
    });
  });

  describe('rejects all invalid task transitions (exhaustive matrix)', () => {
    const invalidTaskPairs = allInvalidPairs(TASK_TRANSITIONS);
    it.each(invalidTaskPairs)('task: %s -> %s is invalid', (from, to) => {
      const result = validateTransition(TASK_TRANSITIONS, from, to);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.from).toBe(from);
        expect(result.to).toBe(to);
        expect(result.reason).toContain('not allowed');
      }
    });
  });

  describe('rejects all invalid user story transitions (exhaustive matrix)', () => {
    const invalidStoryPairs = allInvalidPairs(USER_STORY_TRANSITIONS);
    it.each(invalidStoryPairs)('user story: %s -> %s is invalid', (from, to) => {
      const result = validateTransition(USER_STORY_TRANSITIONS, from, to);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.from).toBe(from);
        expect(result.to).toBe(to);
        expect(result.reason).toContain('not allowed');
      }
    });
  });

  describe('rejects all invalid project transitions (exhaustive matrix)', () => {
    const invalidProjectPairs = allInvalidPairs(PROJECT_TRANSITIONS);
    it.each(invalidProjectPairs)('project: %s -> %s is invalid', (from, to) => {
      const result = validateTransition(PROJECT_TRANSITIONS, from, to);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.from).toBe(from);
        expect(result.to).toBe(to);
        expect(result.reason).toContain('not allowed');
      }
    });
  });

  describe('rejection reason messages are descriptive and actionable', () => {
    it('includes the from and to states for terminal state rejection', () => {
      const result = validateTransition(TASK_TRANSITIONS, 'complete', 'in-progress');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain('"complete"');
        expect(result.reason).toContain('"in-progress"');
        expect(result.reason).toContain('none (terminal state)');
      }
    });

    it('lists allowed targets in rejection for non-terminal states', () => {
      const result = validateTransition(TASK_TRANSITIONS, 'in-progress', 'not-started');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain('not allowed');
        expect(result.reason).toContain('complete');
      }
    });

    it('includes valid targets for story draft -> complete rejection', () => {
      const result = validateTransition(USER_STORY_TRANSITIONS, 'draft', 'complete');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain('not-started');
        expect(result.reason).toContain('blocked');
      }
    });

    it('includes terminal state indicator for story complete -> draft rejection', () => {
      const result = validateTransition(USER_STORY_TRANSITIONS, 'complete', 'draft');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain('none (terminal state)');
      }
    });

    it('includes valid targets for project draft -> in-progress rejection', () => {
      const result = validateTransition(PROJECT_TRANSITIONS, 'draft', 'in-progress');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain('ready');
      }
    });

    it('includes terminal state indicator for project complete rejection', () => {
      const result = validateTransition(PROJECT_TRANSITIONS, 'complete', 'in-progress');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain('none (terminal state)');
      }
    });
  });

  describe('reason messages', () => {
    it('includes the from and to states in the reason', () => {
      const result = validateTransition(TASK_TRANSITIONS, 'complete', 'in-progress');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain('"complete"');
        expect(result.reason).toContain('"in-progress"');
      }
    });

    it('lists allowed targets when transition is invalid', () => {
      const result = validateTransition(TASK_TRANSITIONS, 'not-started', 'complete');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain('in-progress');
        expect(result.reason).toContain('blocked');
      }
    });

    it('indicates terminal state when no transitions exist', () => {
      const result = validateTransition(TASK_TRANSITIONS, 'complete', 'not-started');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain('none (terminal state)');
      }
    });
  });

  describe('self-transitions', () => {
    it('rejects self-transition for task not-started -> not-started', () => {
      const result = validateTransition(TASK_TRANSITIONS, 'not-started', 'not-started');
      expect(result.valid).toBe(false);
    });

    it('rejects self-transition for story in-progress -> in-progress', () => {
      const result = validateTransition(USER_STORY_TRANSITIONS, 'in-progress', 'in-progress');
      expect(result.valid).toBe(false);
    });

    it('rejects self-transition for project draft -> draft', () => {
      const result = validateTransition(PROJECT_TRANSITIONS, 'draft', 'draft');
      expect(result.valid).toBe(false);
    });
  });
});

// ===========================================================================
// getAllowedTransitions
// ===========================================================================
describe('getAllowedTransitions', () => {
  it('returns allowed targets for task not-started', () => {
    const result = getAllowedTransitions(TASK_TRANSITIONS, 'not-started');
    expect(result).toEqual(['in-progress', 'blocked']);
  });

  it('returns empty array for task complete (terminal)', () => {
    const result = getAllowedTransitions(TASK_TRANSITIONS, 'complete');
    expect(result).toEqual([]);
  });

  it('returns allowed targets for story draft', () => {
    const result = getAllowedTransitions(USER_STORY_TRANSITIONS, 'draft');
    expect(result).toEqual(['not-started', 'blocked']);
  });

  it('returns allowed targets for story failed', () => {
    const result = getAllowedTransitions(USER_STORY_TRANSITIONS, 'failed');
    expect(result).toEqual(['not-started', 'blocked']);
  });

  it('returns empty array for story complete (terminal)', () => {
    const result = getAllowedTransitions(USER_STORY_TRANSITIONS, 'complete');
    expect(result).toEqual([]);
  });

  it('returns allowed targets for project ready', () => {
    const result = getAllowedTransitions(PROJECT_TRANSITIONS, 'ready');
    expect(result).toEqual(['draft', 'in-progress']);
  });

  it('returns empty array for project complete (terminal)', () => {
    const result = getAllowedTransitions(PROJECT_TRANSITIONS, 'complete');
    expect(result).toEqual([]);
  });

  it('returns the same array reference as the transition map entry', () => {
    const result = getAllowedTransitions(TASK_TRANSITIONS, 'not-started');
    expect(result).toBe(TASK_TRANSITIONS['not-started']);
  });
});

// ===========================================================================
// Structural integrity
// ===========================================================================
describe('Structural integrity', () => {
  it('all task transition targets are valid TaskStatus values', () => {
    const allStatuses = new Set(Object.keys(TASK_TRANSITIONS));
    for (const targets of Object.values(TASK_TRANSITIONS) as readonly (readonly TaskStatus[])[]) {
      for (const target of targets) {
        expect(allStatuses.has(target)).toBe(true);
      }
    }
  });

  it('all user story transition targets are valid UserStoryStatus values', () => {
    const allStatuses = new Set(Object.keys(USER_STORY_TRANSITIONS));
    for (const targets of Object.values(
      USER_STORY_TRANSITIONS,
    ) as readonly (readonly UserStoryStatus[])[]) {
      for (const target of targets) {
        expect(allStatuses.has(target)).toBe(true);
      }
    }
  });

  it('all project transition targets are valid ProjectStatus values', () => {
    const allStatuses = new Set(Object.keys(PROJECT_TRANSITIONS));
    for (const targets of Object.values(
      PROJECT_TRANSITIONS,
    ) as readonly (readonly ProjectStatus[])[]) {
      for (const target of targets) {
        expect(allStatuses.has(target)).toBe(true);
      }
    }
  });

  it('no transition map contains self-transitions', () => {
    const checkNoSelfTransitions = <S extends string>(map: TransitionMap<S>) => {
      for (const from of Object.keys(map) as S[]) {
        for (const to of map[from]) {
          expect(from).not.toBe(to);
        }
      }
    };

    checkNoSelfTransitions(TASK_TRANSITIONS);
    checkNoSelfTransitions(USER_STORY_TRANSITIONS);
    checkNoSelfTransitions(PROJECT_TRANSITIONS);
  });
});
