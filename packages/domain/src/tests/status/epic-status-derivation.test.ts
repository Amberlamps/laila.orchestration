// Unit tests for epic status derivation functions.
// Verifies that deriveEpicStatus correctly computes epic status
// from child user story statuses, and that batchDeriveEpicStatuses
// correctly derives statuses for multiple epics.

import { describe, it, expect } from 'vitest';

import { deriveEpicStatus, batchDeriveEpicStatuses } from '../../status/epic-status-derivation';

import type { EpicStoryInfo } from '../../status/epic-status-derivation';

// ===========================================================================
// deriveEpicStatus
// ===========================================================================
describe('deriveEpicStatus', () => {
  // -------------------------------------------------------------------------
  // Empty epics
  // -------------------------------------------------------------------------
  describe('empty epics', () => {
    it('returns not-started when epic has no stories', () => {
      const result = deriveEpicStatus([]);

      expect(result.derivedStatus).toBe('not-started');
      expect(result.reason).toContain('no user stories');
      expect(result.storySummary.total).toBe(0);
    });

    it('returns zeroed summary for empty epic', () => {
      const result = deriveEpicStatus([]);

      expect(result.storySummary).toEqual({
        total: 0,
        complete: 0,
        inProgress: 0,
        failed: 0,
        blocked: 0,
        notStarted: 0,
        draft: 0,
      });
    });
  });

  // -------------------------------------------------------------------------
  // Complete — all stories complete
  // -------------------------------------------------------------------------
  describe('complete status', () => {
    it('returns complete when all stories are complete', () => {
      const stories: EpicStoryInfo[] = [
        { id: 'story-1', status: 'complete' },
        { id: 'story-2', status: 'complete' },
        { id: 'story-3', status: 'complete' },
      ];

      const result = deriveEpicStatus(stories);

      expect(result.derivedStatus).toBe('complete');
      expect(result.reason).toContain('complete');
      expect(result.storySummary.complete).toBe(3);
      expect(result.storySummary.total).toBe(3);
    });

    it('returns complete when a single story is complete', () => {
      const stories: EpicStoryInfo[] = [{ id: 'story-1', status: 'complete' }];

      const result = deriveEpicStatus(stories);

      expect(result.derivedStatus).toBe('complete');
    });
  });

  // -------------------------------------------------------------------------
  // Failed — any story failed AND none in-progress
  // -------------------------------------------------------------------------
  describe('failed status', () => {
    it('returns failed when any story is failed and none are in-progress', () => {
      const stories: EpicStoryInfo[] = [
        { id: 'story-1', status: 'complete' },
        { id: 'story-2', status: 'failed' },
        { id: 'story-3', status: 'not-started' },
      ];

      const result = deriveEpicStatus(stories);

      expect(result.derivedStatus).toBe('failed');
      expect(result.reason).toContain('failed');
      expect(result.reason).toContain('no stories in progress');
    });

    it('returns failed when all stories are failed', () => {
      const stories: EpicStoryInfo[] = [
        { id: 'story-1', status: 'failed' },
        { id: 'story-2', status: 'failed' },
      ];

      const result = deriveEpicStatus(stories);

      expect(result.derivedStatus).toBe('failed');
      expect(result.storySummary.failed).toBe(2);
    });

    it('returns failed when one story is failed and others are complete', () => {
      const stories: EpicStoryInfo[] = [
        { id: 'story-1', status: 'complete' },
        { id: 'story-2', status: 'failed' },
      ];

      const result = deriveEpicStatus(stories);

      expect(result.derivedStatus).toBe('failed');
    });

    it("uses singular 'story' in reason for single failure", () => {
      const stories: EpicStoryInfo[] = [{ id: 'story-1', status: 'failed' }];

      const result = deriveEpicStatus(stories);

      expect(result.reason).toContain('1 story failed');
    });

    it("uses plural 'stories' in reason for multiple failures", () => {
      const stories: EpicStoryInfo[] = [
        { id: 'story-1', status: 'failed' },
        { id: 'story-2', status: 'failed' },
      ];

      const result = deriveEpicStatus(stories);

      expect(result.reason).toContain('2 stories failed');
    });
  });

  // -------------------------------------------------------------------------
  // In-progress — any story in-progress (overrides failed)
  // -------------------------------------------------------------------------
  describe('in-progress status', () => {
    it('returns in-progress when any story is in-progress', () => {
      const stories: EpicStoryInfo[] = [
        { id: 'story-1', status: 'not-started' },
        { id: 'story-2', status: 'in-progress' },
        { id: 'story-3', status: 'not-started' },
      ];

      const result = deriveEpicStatus(stories);

      expect(result.derivedStatus).toBe('in-progress');
      expect(result.reason).toContain('in progress');
    });

    it('returns in-progress even when some stories are failed', () => {
      const stories: EpicStoryInfo[] = [
        { id: 'story-1', status: 'failed' },
        { id: 'story-2', status: 'in-progress' },
      ];

      const result = deriveEpicStatus(stories);

      expect(result.derivedStatus).toBe('in-progress');
    });

    it('returns in-progress with mixed statuses including failed and blocked', () => {
      const stories: EpicStoryInfo[] = [
        { id: 'story-1', status: 'complete' },
        { id: 'story-2', status: 'failed' },
        { id: 'story-3', status: 'in-progress' },
        { id: 'story-4', status: 'blocked' },
        { id: 'story-5', status: 'not-started' },
      ];

      const result = deriveEpicStatus(stories);

      expect(result.derivedStatus).toBe('in-progress');
    });

    it("uses singular 'story' in reason for single in-progress", () => {
      const stories: EpicStoryInfo[] = [{ id: 'story-1', status: 'in-progress' }];

      const result = deriveEpicStatus(stories);

      expect(result.reason).toContain('1 story in progress');
    });

    it("uses plural 'stories' in reason for multiple in-progress", () => {
      const stories: EpicStoryInfo[] = [
        { id: 'story-1', status: 'in-progress' },
        { id: 'story-2', status: 'in-progress' },
      ];

      const result = deriveEpicStatus(stories);

      expect(result.reason).toContain('2 stories in progress');
    });
  });

  // -------------------------------------------------------------------------
  // Blocked — all non-complete stories are blocked
  // -------------------------------------------------------------------------
  describe('blocked status', () => {
    it('returns blocked when all non-complete stories are blocked', () => {
      const stories: EpicStoryInfo[] = [
        { id: 'story-1', status: 'complete' },
        { id: 'story-2', status: 'blocked' },
        { id: 'story-3', status: 'blocked' },
      ];

      const result = deriveEpicStatus(stories);

      expect(result.derivedStatus).toBe('blocked');
      expect(result.reason).toContain('blocked');
    });

    it('returns blocked when all stories are blocked', () => {
      const stories: EpicStoryInfo[] = [
        { id: 'story-1', status: 'blocked' },
        { id: 'story-2', status: 'blocked' },
      ];

      const result = deriveEpicStatus(stories);

      expect(result.derivedStatus).toBe('blocked');
    });

    it('returns blocked when single non-complete story is blocked', () => {
      const stories: EpicStoryInfo[] = [
        { id: 'story-1', status: 'complete' },
        { id: 'story-2', status: 'blocked' },
      ];

      const result = deriveEpicStatus(stories);

      expect(result.derivedStatus).toBe('blocked');
    });

    it('does not return blocked when some non-complete stories are not blocked', () => {
      const stories: EpicStoryInfo[] = [
        { id: 'story-1', status: 'blocked' },
        { id: 'story-2', status: 'not-started' },
      ];

      const result = deriveEpicStatus(stories);

      expect(result.derivedStatus).not.toBe('blocked');
    });
  });

  // -------------------------------------------------------------------------
  // Not-started — default state
  // -------------------------------------------------------------------------
  describe('not-started status', () => {
    it('returns not-started when all stories are not-started', () => {
      const stories: EpicStoryInfo[] = [
        { id: 'story-1', status: 'not-started' },
        { id: 'story-2', status: 'not-started' },
      ];

      const result = deriveEpicStatus(stories);

      expect(result.derivedStatus).toBe('not-started');
    });

    it('returns not-started when all stories are draft', () => {
      const stories: EpicStoryInfo[] = [
        { id: 'story-1', status: 'draft' },
        { id: 'story-2', status: 'draft' },
      ];

      const result = deriveEpicStatus(stories);

      expect(result.derivedStatus).toBe('not-started');
    });

    it('returns not-started with a mix of draft and not-started stories', () => {
      const stories: EpicStoryInfo[] = [
        { id: 'story-1', status: 'draft' },
        { id: 'story-2', status: 'not-started' },
      ];

      const result = deriveEpicStatus(stories);

      expect(result.derivedStatus).toBe('not-started');
    });
  });

  // -------------------------------------------------------------------------
  // Draft stories
  // -------------------------------------------------------------------------
  describe('draft story handling', () => {
    it('counts draft stories in the summary', () => {
      const stories: EpicStoryInfo[] = [
        { id: 'story-1', status: 'draft' },
        { id: 'story-2', status: 'draft' },
        { id: 'story-3', status: 'not-started' },
      ];

      const result = deriveEpicStatus(stories);

      expect(result.storySummary.draft).toBe(2);
      expect(result.storySummary.notStarted).toBe(1);
      expect(result.storySummary.total).toBe(3);
    });

    it('draft stories do not trigger any specific epic status', () => {
      const stories: EpicStoryInfo[] = [
        { id: 'story-1', status: 'draft' },
        { id: 'story-2', status: 'in-progress' },
      ];

      const result = deriveEpicStatus(stories);

      // In-progress takes effect, draft does not override.
      expect(result.derivedStatus).toBe('in-progress');
    });

    it('draft stories do not count as blocked for the blocked rule', () => {
      // If one is blocked and one is draft, not all non-complete are blocked.
      const stories: EpicStoryInfo[] = [
        { id: 'story-1', status: 'blocked' },
        { id: 'story-2', status: 'draft' },
      ];

      const result = deriveEpicStatus(stories);

      // Draft is non-complete but not blocked, so blocked rule does not apply.
      expect(result.derivedStatus).not.toBe('blocked');
      expect(result.derivedStatus).toBe('not-started');
    });
  });

  // -------------------------------------------------------------------------
  // Story summary accuracy
  // -------------------------------------------------------------------------
  describe('story summary', () => {
    it('accurately counts stories in each status', () => {
      const stories: EpicStoryInfo[] = [
        { id: 'story-1', status: 'complete' },
        { id: 'story-2', status: 'in-progress' },
        { id: 'story-3', status: 'failed' },
        { id: 'story-4', status: 'blocked' },
        { id: 'story-5', status: 'not-started' },
        { id: 'story-6', status: 'draft' },
      ];

      const result = deriveEpicStatus(stories);

      expect(result.storySummary).toEqual({
        total: 6,
        complete: 1,
        inProgress: 1,
        failed: 1,
        blocked: 1,
        notStarted: 1,
        draft: 1,
      });
    });

    it('accurately counts multiple stories of the same status', () => {
      const stories: EpicStoryInfo[] = [
        { id: 'story-1', status: 'complete' },
        { id: 'story-2', status: 'complete' },
        { id: 'story-3', status: 'in-progress' },
        { id: 'story-4', status: 'in-progress' },
        { id: 'story-5', status: 'in-progress' },
      ];

      const result = deriveEpicStatus(stories);

      expect(result.storySummary.total).toBe(5);
      expect(result.storySummary.complete).toBe(2);
      expect(result.storySummary.inProgress).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // Derivation priority order
  // -------------------------------------------------------------------------
  describe('derivation priority', () => {
    it('in-progress takes precedence over failed (active work supersedes failure state)', () => {
      const stories: EpicStoryInfo[] = [
        { id: 'story-1', status: 'failed' },
        { id: 'story-2', status: 'in-progress' },
      ];

      const result = deriveEpicStatus(stories);

      // Rule 3 (in-progress) evaluated before Rule 2 (failed) would match,
      // but Rule 2 requires no in-progress stories.
      expect(result.derivedStatus).toBe('in-progress');
    });

    it('failed requires no in-progress stories to trigger', () => {
      const stories: EpicStoryInfo[] = [
        { id: 'story-1', status: 'failed' },
        { id: 'story-2', status: 'in-progress' },
        { id: 'story-3', status: 'not-started' },
      ];

      const result = deriveEpicStatus(stories);

      expect(result.derivedStatus).toBe('in-progress');
    });

    it('complete takes precedence over all other rules', () => {
      // All stories complete means no failed, no in-progress, no blocked.
      const stories: EpicStoryInfo[] = [
        { id: 'story-1', status: 'complete' },
        { id: 'story-2', status: 'complete' },
      ];

      const result = deriveEpicStatus(stories);

      expect(result.derivedStatus).toBe('complete');
    });

    it('blocked requires ALL non-complete stories to be blocked', () => {
      const stories: EpicStoryInfo[] = [
        { id: 'story-1', status: 'complete' },
        { id: 'story-2', status: 'blocked' },
        { id: 'story-3', status: 'not-started' },
      ];

      const result = deriveEpicStatus(stories);

      // story-3 is non-complete but not blocked, so blocked rule doesn't apply.
      expect(result.derivedStatus).toBe('not-started');
    });
  });

  // -------------------------------------------------------------------------
  // Human-readable reasons
  // -------------------------------------------------------------------------
  describe('human-readable reasons', () => {
    it('all derivation results include a non-empty reason string', () => {
      const scenarios: EpicStoryInfo[][] = [
        // Empty epic
        [],
        // All complete
        [
          { id: 's1', status: 'complete' },
          { id: 's2', status: 'complete' },
        ],
        // Failed
        [{ id: 's1', status: 'failed' }],
        // In-progress
        [{ id: 's1', status: 'in-progress' }],
        // Blocked
        [{ id: 's1', status: 'blocked' }],
        // Not-started
        [{ id: 's1', status: 'not-started' }],
        // Draft only
        [{ id: 's1', status: 'draft' }],
        // Mixed
        [
          { id: 's1', status: 'failed' },
          { id: 's2', status: 'in-progress' },
        ],
      ];

      for (const stories of scenarios) {
        const result = deriveEpicStatus(stories);

        expect(result.reason).toBeTruthy();
        expect(typeof result.reason).toBe('string');
        expect(result.reason.length).toBeGreaterThan(0);
      }
    });
  });
});

// ===========================================================================
// batchDeriveEpicStatuses
// ===========================================================================
describe('batchDeriveEpicStatuses', () => {
  it('correctly derives statuses for multiple epics', () => {
    const epicStories = new Map<string, EpicStoryInfo[]>([
      [
        'epic-1',
        [
          { id: 'story-1', status: 'complete' },
          { id: 'story-2', status: 'complete' },
        ],
      ],
      [
        'epic-2',
        [
          { id: 'story-3', status: 'in-progress' },
          { id: 'story-4', status: 'not-started' },
        ],
      ],
      ['epic-3', [{ id: 'story-5', status: 'failed' }]],
    ]);

    const results = batchDeriveEpicStatuses(epicStories);

    expect(results.size).toBe(3);
    expect(results.get('epic-1')?.derivedStatus).toBe('complete');
    expect(results.get('epic-2')?.derivedStatus).toBe('in-progress');
    expect(results.get('epic-3')?.derivedStatus).toBe('failed');
  });

  it('handles empty map', () => {
    const epicStories = new Map<string, EpicStoryInfo[]>();

    const results = batchDeriveEpicStatuses(epicStories);

    expect(results.size).toBe(0);
  });

  it('handles epics with no stories', () => {
    const epicStories = new Map<string, EpicStoryInfo[]>([['epic-1', []]]);

    const results = batchDeriveEpicStatuses(epicStories);

    expect(results.get('epic-1')?.derivedStatus).toBe('not-started');
  });

  it('each epic result includes a story summary', () => {
    const epicStories = new Map<string, EpicStoryInfo[]>([
      [
        'epic-1',
        [
          { id: 'story-1', status: 'complete' },
          { id: 'story-2', status: 'in-progress' },
        ],
      ],
    ]);

    const results = batchDeriveEpicStatuses(epicStories);

    const result = results.get('epic-1');
    expect(result?.storySummary.total).toBe(2);
    expect(result?.storySummary.complete).toBe(1);
    expect(result?.storySummary.inProgress).toBe(1);
  });

  it('returns a new Map instance', () => {
    const epicStories = new Map<string, EpicStoryInfo[]>([
      ['epic-1', [{ id: 'story-1', status: 'complete' }]],
    ]);

    const result1 = batchDeriveEpicStatuses(epicStories);
    const result2 = batchDeriveEpicStatuses(epicStories);

    expect(result1).not.toBe(result2);
  });
});

// ===========================================================================
// Edge Cases (cross-cutting scenarios)
// ===========================================================================
describe('Edge Cases', () => {
  it('handles single-story epics (in-progress)', () => {
    const stories: EpicStoryInfo[] = [{ id: 'story-1', status: 'in-progress' }];

    const result = deriveEpicStatus(stories);

    expect(result.derivedStatus).toBe('in-progress');
    expect(result.storySummary.total).toBe(1);
  });

  it('handles single-story epics (failed)', () => {
    const stories: EpicStoryInfo[] = [{ id: 'story-1', status: 'failed' }];

    const result = deriveEpicStatus(stories);

    expect(result.derivedStatus).toBe('failed');
  });

  it('handles single-story epics (blocked)', () => {
    const stories: EpicStoryInfo[] = [{ id: 'story-1', status: 'blocked' }];

    const result = deriveEpicStatus(stories);

    expect(result.derivedStatus).toBe('blocked');
  });

  it('handles single-story epics (draft)', () => {
    const stories: EpicStoryInfo[] = [{ id: 'story-1', status: 'draft' }];

    const result = deriveEpicStatus(stories);

    expect(result.derivedStatus).toBe('not-started');
    expect(result.storySummary.draft).toBe(1);
  });

  it('simulates long chain of dependent stories (sequentially blocked -> in-progress -> complete)', () => {
    // Story-1 is complete, story-2 is in-progress, story-3 through story-5 are blocked.
    // This simulates the state of an epic with a chain: story-1 -> story-2 -> story-3 -> story-4 -> story-5
    const stories: EpicStoryInfo[] = [
      { id: 'story-1', status: 'complete' },
      { id: 'story-2', status: 'in-progress' },
      { id: 'story-3', status: 'blocked' },
      { id: 'story-4', status: 'blocked' },
      { id: 'story-5', status: 'blocked' },
    ];

    const result = deriveEpicStatus(stories);

    // In-progress takes precedence over blocked.
    expect(result.derivedStatus).toBe('in-progress');
    expect(result.storySummary.complete).toBe(1);
    expect(result.storySummary.inProgress).toBe(1);
    expect(result.storySummary.blocked).toBe(3);
  });

  it('simulates long chain where all stories are complete', () => {
    const stories: EpicStoryInfo[] = [
      { id: 'story-1', status: 'complete' },
      { id: 'story-2', status: 'complete' },
      { id: 'story-3', status: 'complete' },
      { id: 'story-4', status: 'complete' },
      { id: 'story-5', status: 'complete' },
    ];

    const result = deriveEpicStatus(stories);

    expect(result.derivedStatus).toBe('complete');
    expect(result.storySummary.complete).toBe(5);
  });

  it('simulates long chain where all non-complete stories are blocked', () => {
    const stories: EpicStoryInfo[] = [
      { id: 'story-1', status: 'complete' },
      { id: 'story-2', status: 'blocked' },
      { id: 'story-3', status: 'blocked' },
      { id: 'story-4', status: 'blocked' },
    ];

    const result = deriveEpicStatus(stories);

    expect(result.derivedStatus).toBe('blocked');
  });

  it('handles diamond dependency pattern (two stories feed into one)', () => {
    // Diamond: story-A and story-B both complete, story-C (depends on both) in-progress
    const stories: EpicStoryInfo[] = [
      { id: 'story-A', status: 'complete' },
      { id: 'story-B', status: 'complete' },
      { id: 'story-C', status: 'in-progress' },
    ];

    const result = deriveEpicStatus(stories);

    expect(result.derivedStatus).toBe('in-progress');
    expect(result.storySummary.complete).toBe(2);
    expect(result.storySummary.inProgress).toBe(1);
  });

  it('handles diamond pattern where join story is blocked', () => {
    // Diamond: story-A complete, story-B blocked, story-C (depends on both) blocked
    const stories: EpicStoryInfo[] = [
      { id: 'story-A', status: 'complete' },
      { id: 'story-B', status: 'blocked' },
      { id: 'story-C', status: 'blocked' },
    ];

    const result = deriveEpicStatus(stories);

    expect(result.derivedStatus).toBe('blocked');
  });

  it('handles mixed draft and non-draft stories correctly', () => {
    const stories: EpicStoryInfo[] = [
      { id: 'story-1', status: 'draft' },
      { id: 'story-2', status: 'not-started' },
      { id: 'story-3', status: 'complete' },
    ];

    const result = deriveEpicStatus(stories);

    // No in-progress, no failed. Not all complete. Not all non-complete blocked.
    // Default: not-started.
    expect(result.derivedStatus).toBe('not-started');
    expect(result.storySummary.draft).toBe(1);
    expect(result.storySummary.notStarted).toBe(1);
    expect(result.storySummary.complete).toBe(1);
  });

  it('handles mixed states: failed + blocked + draft', () => {
    const stories: EpicStoryInfo[] = [
      { id: 'story-1', status: 'failed' },
      { id: 'story-2', status: 'blocked' },
      { id: 'story-3', status: 'draft' },
    ];

    const result = deriveEpicStatus(stories);

    // Failed with no in-progress -> failed.
    expect(result.derivedStatus).toBe('failed');
  });

  it('handles mixed states: in-progress + failed + blocked + complete + draft', () => {
    const stories: EpicStoryInfo[] = [
      { id: 'story-1', status: 'in-progress' },
      { id: 'story-2', status: 'failed' },
      { id: 'story-3', status: 'blocked' },
      { id: 'story-4', status: 'complete' },
      { id: 'story-5', status: 'draft' },
      { id: 'story-6', status: 'not-started' },
    ];

    const result = deriveEpicStatus(stories);

    // In-progress supersedes failed.
    expect(result.derivedStatus).toBe('in-progress');
    expect(result.storySummary.total).toBe(6);
  });

  it('handles large number of stories efficiently', () => {
    const stories: EpicStoryInfo[] = Array.from({ length: 100 }, (_, i) => ({
      id: `story-${String(i)}`,
      status: i < 99 ? ('complete' as const) : ('in-progress' as const),
    }));

    const result = deriveEpicStatus(stories);

    expect(result.derivedStatus).toBe('in-progress');
    expect(result.storySummary.complete).toBe(99);
    expect(result.storySummary.inProgress).toBe(1);
  });
});

// ===========================================================================
// Pure function guarantees
// ===========================================================================
describe('pure function guarantees', () => {
  it('deriveEpicStatus does not mutate the input stories array', () => {
    const stories: EpicStoryInfo[] = [
      { id: 'story-1', status: 'in-progress' },
      { id: 'story-2', status: 'not-started' },
    ];
    const storiesSnapshot = stories.map((s) => ({ ...s }));

    deriveEpicStatus(stories);

    expect(stories).toEqual(storiesSnapshot);
  });

  it('deriveEpicStatus does not mutate individual story objects', () => {
    const stories: EpicStoryInfo[] = [
      { id: 'story-1', status: 'failed' },
      { id: 'story-2', status: 'complete' },
    ];
    const storyRefs = stories.map((s) => ({ ...s }));

    deriveEpicStatus(stories);

    for (let i = 0; i < stories.length; i++) {
      expect(stories[i]).toEqual(storyRefs[i]);
    }
  });

  it('batchDeriveEpicStatuses does not mutate the input map', () => {
    const epicStories = new Map<string, EpicStoryInfo[]>([
      ['epic-1', [{ id: 'story-1', status: 'complete' }]],
      ['epic-2', [{ id: 'story-2', status: 'in-progress' }]],
    ]);
    const keysSnapshot = [...epicStories.keys()];

    batchDeriveEpicStatuses(epicStories);

    expect([...epicStories.keys()]).toEqual(keysSnapshot);
    expect(epicStories.size).toBe(2);
  });

  it('deriveEpicStatus returns consistent results for identical inputs', () => {
    const stories: EpicStoryInfo[] = [
      { id: 'story-1', status: 'in-progress' },
      { id: 'story-2', status: 'failed' },
    ];

    const result1 = deriveEpicStatus(stories);
    const result2 = deriveEpicStatus(stories);

    expect(result1).toEqual(result2);
  });
});
