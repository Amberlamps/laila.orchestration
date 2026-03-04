// Exhaustive tests for story eligibility evaluation.
// Verifies every eligibility rule individually, in combination,
// and the convenience function getEligibleStoryIds.

import { describe, it, expect } from 'vitest';

import { evaluateEligibility, getEligibleStoryIds } from '../../assignment/eligibility-rules';

import type {
  StoryEligibilityInfo,
  EpicInfo,
  ProjectInfo,
} from '../../assignment/eligibility-rules';
import type { UserStoryStatus } from '../../status/transition-definitions';

// ---------------------------------------------------------------------------
// Typed helper factories -- no `any`, no `as unknown as Type`.
// ---------------------------------------------------------------------------

const createTestProject = (overrides: Partial<ProjectInfo> = {}): ProjectInfo => ({
  id: 'project-1',
  status: 'ready',
  ...overrides,
});

const createTestEpic = (overrides: Partial<EpicInfo> = {}): EpicInfo => ({
  id: 'epic-1',
  status: 'not-started',
  ...overrides,
});

const createTestStory = (overrides: Partial<StoryEligibilityInfo> = {}): StoryEligibilityInfo => ({
  id: 'story-1',
  status: 'not-started',
  epicId: 'epic-1',
  crossStoryDepsSatisfied: true,
  ...overrides,
});

const defaultEpics = (): Map<string, EpicInfo> => new Map([['epic-1', createTestEpic()]]);

// ===========================================================================
// evaluateEligibility
// ===========================================================================
describe('evaluateEligibility', () => {
  // -----------------------------------------------------------------------
  // Happy path
  // -----------------------------------------------------------------------
  describe('happy path', () => {
    it('should mark story as eligible when all criteria are met', () => {
      const stories = [createTestStory()];
      const epics = defaultEpics();
      const project = createTestProject();

      const results = evaluateEligibility(stories, epics, project);

      expect(results).toHaveLength(1);
      expect(results[0]!.eligible).toBe(true);
      expect(results[0]!.disqualificationReasons).toHaveLength(0);
      expect(results[0]!.storyId).toBe('story-1');
    });

    it('should mark story as eligible when project is in-progress', () => {
      const project = createTestProject({ status: 'in-progress' });
      const results = evaluateEligibility([createTestStory()], defaultEpics(), project);

      expect(results[0]!.eligible).toBe(true);
      expect(results[0]!.disqualificationReasons).toHaveLength(0);
    });

    it('should mark story as eligible when parent epic is in-progress', () => {
      const epics = new Map([['epic-1', createTestEpic({ status: 'in-progress' })]]);
      const results = evaluateEligibility([createTestStory()], epics, createTestProject());

      expect(results[0]!.eligible).toBe(true);
      expect(results[0]!.disqualificationReasons).toHaveLength(0);
    });

    it('should mark multiple stories as eligible independently', () => {
      const stories = [createTestStory({ id: 'story-1' }), createTestStory({ id: 'story-2' })];
      const results = evaluateEligibility(stories, defaultEpics(), createTestProject());

      expect(results).toHaveLength(2);
      expect(results[0]!.eligible).toBe(true);
      expect(results[1]!.eligible).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Project state restrictions
  // -----------------------------------------------------------------------
  describe('project state restrictions', () => {
    it('should disqualify when project is in draft state', () => {
      const project = createTestProject({ status: 'draft' });
      const results = evaluateEligibility([createTestStory()], defaultEpics(), project);

      expect(results[0]!.eligible).toBe(false);
      expect(results[0]!.disqualificationReasons).toHaveLength(1);
      expect(results[0]!.disqualificationReasons[0]).toContain('draft');
    });

    it('should disqualify when project is complete', () => {
      const project = createTestProject({ status: 'complete' });
      const results = evaluateEligibility([createTestStory()], defaultEpics(), project);

      expect(results[0]!.eligible).toBe(false);
      expect(results[0]!.disqualificationReasons).toHaveLength(1);
      expect(results[0]!.disqualificationReasons[0]).toContain('complete');
    });

    it('should allow when project is ready', () => {
      const project = createTestProject({ status: 'ready' });
      const results = evaluateEligibility([createTestStory()], defaultEpics(), project);

      expect(results[0]!.eligible).toBe(true);
    });

    it('should allow when project is in-progress', () => {
      const project = createTestProject({ status: 'in-progress' });
      const results = evaluateEligibility([createTestStory()], defaultEpics(), project);

      expect(results[0]!.eligible).toBe(true);
    });

    it('should disqualify all stories when project state is invalid', () => {
      const project = createTestProject({ status: 'draft' });
      const stories = [createTestStory({ id: 'story-1' }), createTestStory({ id: 'story-2' })];
      const results = evaluateEligibility(stories, defaultEpics(), project);

      expect(results.every((r) => !r.eligible)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Story status restrictions
  // -----------------------------------------------------------------------
  describe('story status restrictions', () => {
    const ineligibleStatuses: UserStoryStatus[] = [
      'draft',
      'in-progress',
      'complete',
      'failed',
      'blocked',
    ];

    it.each(ineligibleStatuses)('should disqualify stories in "%s" status', (status) => {
      const story = createTestStory({ status });
      const results = evaluateEligibility([story], defaultEpics(), createTestProject());

      expect(results[0]!.eligible).toBe(false);
      expect(results[0]!.disqualificationReasons).toHaveLength(1);
      expect(results[0]!.disqualificationReasons[0]).toContain(status);
    });

    it('should allow stories in "not-started" status', () => {
      const story = createTestStory({ status: 'not-started' });
      const results = evaluateEligibility([story], defaultEpics(), createTestProject());

      expect(results[0]!.eligible).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Epic status restrictions
  // -----------------------------------------------------------------------
  describe('epic status restrictions', () => {
    it('should disqualify when parent epic is blocked', () => {
      const epics = new Map([['epic-1', createTestEpic({ status: 'blocked' })]]);
      const results = evaluateEligibility([createTestStory()], epics, createTestProject());

      expect(results[0]!.eligible).toBe(false);
      expect(results[0]!.disqualificationReasons).toHaveLength(1);
      expect(results[0]!.disqualificationReasons[0]).toContain('blocked');
    });

    it('should disqualify when parent epic is failed', () => {
      const epics = new Map([['epic-1', createTestEpic({ status: 'failed' })]]);
      const results = evaluateEligibility([createTestStory()], epics, createTestProject());

      expect(results[0]!.eligible).toBe(false);
      expect(results[0]!.disqualificationReasons[0]).toContain('failed');
    });

    it('should disqualify when parent epic is complete', () => {
      const epics = new Map([['epic-1', createTestEpic({ status: 'complete' })]]);
      const results = evaluateEligibility([createTestStory()], epics, createTestProject());

      expect(results[0]!.eligible).toBe(false);
      expect(results[0]!.disqualificationReasons[0]).toContain('complete');
    });

    it('should allow when parent epic is not-started', () => {
      const epics = new Map([['epic-1', createTestEpic({ status: 'not-started' })]]);
      const results = evaluateEligibility([createTestStory()], epics, createTestProject());

      expect(results[0]!.eligible).toBe(true);
    });

    it('should allow when parent epic is in-progress', () => {
      const epics = new Map([['epic-1', createTestEpic({ status: 'in-progress' })]]);
      const results = evaluateEligibility([createTestStory()], epics, createTestProject());

      expect(results[0]!.eligible).toBe(true);
    });

    it('should disqualify when parent epic is missing', () => {
      const epics = new Map<string, EpicInfo>();
      const results = evaluateEligibility([createTestStory()], epics, createTestProject());

      expect(results[0]!.eligible).toBe(false);
      expect(results[0]!.disqualificationReasons[0]).toContain('not found');
    });

    it('should evaluate stories with different parent epics independently', () => {
      const epics = new Map<string, EpicInfo>([
        ['epic-1', createTestEpic({ id: 'epic-1', status: 'in-progress' })],
        ['epic-2', createTestEpic({ id: 'epic-2', status: 'blocked' })],
      ]);
      const stories = [
        createTestStory({ id: 'story-1', epicId: 'epic-1' }),
        createTestStory({ id: 'story-2', epicId: 'epic-2' }),
      ];

      const results = evaluateEligibility(stories, epics, createTestProject());

      expect(results[0]!.eligible).toBe(true);
      expect(results[1]!.eligible).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Cross-story dependencies
  // -----------------------------------------------------------------------
  describe('cross-story dependencies', () => {
    it('should disqualify when cross-story deps are not satisfied', () => {
      const story = createTestStory({ crossStoryDepsSatisfied: false });
      const results = evaluateEligibility([story], defaultEpics(), createTestProject());

      expect(results[0]!.eligible).toBe(false);
      expect(results[0]!.disqualificationReasons).toHaveLength(1);
      expect(results[0]!.disqualificationReasons[0]).toContain('dependencies');
    });

    it('should allow when cross-story deps are satisfied', () => {
      const story = createTestStory({ crossStoryDepsSatisfied: true });
      const results = evaluateEligibility([story], defaultEpics(), createTestProject());

      expect(results[0]!.eligible).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Multiple disqualification reasons
  // -----------------------------------------------------------------------
  describe('multiple disqualification reasons', () => {
    it('should collect all reasons when multiple criteria fail', () => {
      const project = createTestProject({ status: 'draft' });
      const epics = new Map([['epic-1', createTestEpic({ status: 'blocked' })]]);
      const story = createTestStory({
        status: 'in-progress',
        crossStoryDepsSatisfied: false,
      });

      const results = evaluateEligibility([story], epics, project);

      expect(results[0]!.eligible).toBe(false);
      // All four criteria should fail:
      // 1. Project in draft state
      // 2. Story in in-progress status
      // 3. Epic is blocked
      // 4. Cross-story deps not satisfied
      expect(results[0]!.disqualificationReasons).toHaveLength(4);
    });

    it('should collect exactly two reasons when two criteria fail', () => {
      const project = createTestProject({ status: 'draft' });
      const story = createTestStory({ crossStoryDepsSatisfied: false });

      const results = evaluateEligibility([story], defaultEpics(), project);

      expect(results[0]!.eligible).toBe(false);
      expect(results[0]!.disqualificationReasons).toHaveLength(2);
    });

    it('should collect three reasons when project, story, and deps fail', () => {
      const project = createTestProject({ status: 'complete' });
      const story = createTestStory({
        status: 'blocked',
        crossStoryDepsSatisfied: false,
      });

      const results = evaluateEligibility([story], defaultEpics(), project);

      expect(results[0]!.eligible).toBe(false);
      expect(results[0]!.disqualificationReasons).toHaveLength(3);
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------
  describe('edge cases', () => {
    it('should return empty array for empty stories input', () => {
      const results = evaluateEligibility([], defaultEpics(), createTestProject());
      expect(results).toEqual([]);
    });

    it('should handle single story correctly', () => {
      const results = evaluateEligibility([createTestStory()], defaultEpics(), createTestProject());
      expect(results).toHaveLength(1);
    });

    it('should evaluate each story independently in mixed eligibility', () => {
      const stories = [
        createTestStory({ id: 'story-1', status: 'not-started' }),
        createTestStory({ id: 'story-2', status: 'in-progress' }),
        createTestStory({ id: 'story-3', status: 'not-started', crossStoryDepsSatisfied: false }),
      ];

      const results = evaluateEligibility(stories, defaultEpics(), createTestProject());

      expect(results[0]!.eligible).toBe(true);
      expect(results[1]!.eligible).toBe(false);
      expect(results[2]!.eligible).toBe(false);
    });
  });
});

// ===========================================================================
// getEligibleStoryIds
// ===========================================================================
describe('getEligibleStoryIds', () => {
  it('should return only eligible story IDs', () => {
    const stories = [
      createTestStory({ id: 'story-1', status: 'not-started' }),
      createTestStory({ id: 'story-2', status: 'in-progress' }),
      createTestStory({ id: 'story-3', status: 'not-started' }),
    ];

    const ids = getEligibleStoryIds(stories, defaultEpics(), createTestProject());

    expect(ids).toEqual(['story-1', 'story-3']);
  });

  it('should return empty array when no stories are eligible', () => {
    const project = createTestProject({ status: 'draft' });
    const stories = [createTestStory()];

    const ids = getEligibleStoryIds(stories, defaultEpics(), project);

    expect(ids).toEqual([]);
  });

  it('should return all story IDs when all are eligible', () => {
    const stories = [
      createTestStory({ id: 'story-1' }),
      createTestStory({ id: 'story-2' }),
      createTestStory({ id: 'story-3' }),
    ];

    const ids = getEligibleStoryIds(stories, defaultEpics(), createTestProject());

    expect(ids).toEqual(['story-1', 'story-2', 'story-3']);
  });

  it('should return empty array for empty input', () => {
    const ids = getEligibleStoryIds([], defaultEpics(), createTestProject());
    expect(ids).toEqual([]);
  });
});

// ===========================================================================
// Pure function guarantees
// ===========================================================================
describe('pure function guarantees', () => {
  it('evaluateEligibility does not mutate input arguments', () => {
    const stories = [createTestStory()];
    const epics = defaultEpics();
    const project = createTestProject();

    const storiesCopy = [...stories];
    const epicsSizeBefore = epics.size;

    evaluateEligibility(stories, epics, project);

    expect(stories).toEqual(storiesCopy);
    expect(epics.size).toBe(epicsSizeBefore);
  });

  it('calling evaluateEligibility twice produces identical results', () => {
    const stories = [createTestStory()];
    const epics = defaultEpics();
    const project = createTestProject();

    const result1 = evaluateEligibility(stories, epics, project);
    const result2 = evaluateEligibility(stories, epics, project);

    expect(result1).toEqual(result2);
  });
});
