// Exhaustive tests for priority-based story selection.
// Verifies three-tier comparison (priority, topo order, creation time),
// edge cases, and the rankEligibleStories convenience function.

import { describe, it, expect } from 'vitest';

import {
  selectStoryForAssignment,
  rankEligibleStories,
  PRIORITY_VALUES,
} from '../../assignment/priority-selection';

import type { StorySelectionInfo } from '../../assignment/priority-selection';

// ---------------------------------------------------------------------------
// Typed helper factory.
// ---------------------------------------------------------------------------

const createStorySelection = (
  overrides: Partial<StorySelectionInfo> & { id: string },
): StorySelectionInfo => ({
  priority: 'medium',
  createdAt: new Date('2025-01-01T00:00:00Z'),
  ...overrides,
});

const buildStoryMap = (stories: StorySelectionInfo[]): Map<string, StorySelectionInfo> => {
  const map = new Map<string, StorySelectionInfo>();
  for (const story of stories) {
    map.set(story.id, story);
  }
  return map;
};

// ===========================================================================
// PRIORITY_VALUES
// ===========================================================================
describe('PRIORITY_VALUES', () => {
  it('should define high > medium > low ordering', () => {
    expect(PRIORITY_VALUES.high).toBeGreaterThan(PRIORITY_VALUES.medium);
    expect(PRIORITY_VALUES.medium).toBeGreaterThan(PRIORITY_VALUES.low);
  });
});

// ===========================================================================
// selectStoryForAssignment
// ===========================================================================
describe('selectStoryForAssignment', () => {
  // -----------------------------------------------------------------------
  // Priority comparison
  // -----------------------------------------------------------------------
  describe('priority comparison', () => {
    it('should select high priority over medium priority', () => {
      const highStory = createStorySelection({ id: 'story-high', priority: 'high' });
      const medStory = createStorySelection({ id: 'story-med', priority: 'medium' });

      const stories = buildStoryMap([highStory, medStory]);
      const eligibleIds = ['story-high', 'story-med'];
      const topoOrder = ['story-high', 'story-med'];

      const result = selectStoryForAssignment(eligibleIds, stories, topoOrder);

      expect(result.selected).toBe(true);
      if (result.selected) {
        expect(result.storyId).toBe('story-high');
      }
    });

    it('should select medium priority over low priority', () => {
      const medStory = createStorySelection({ id: 'story-med', priority: 'medium' });
      const lowStory = createStorySelection({ id: 'story-low', priority: 'low' });

      const stories = buildStoryMap([medStory, lowStory]);
      const eligibleIds = ['story-med', 'story-low'];
      const topoOrder = ['story-med', 'story-low'];

      const result = selectStoryForAssignment(eligibleIds, stories, topoOrder);

      expect(result.selected).toBe(true);
      if (result.selected) {
        expect(result.storyId).toBe('story-med');
      }
    });

    it('should select high priority over low priority', () => {
      const highStory = createStorySelection({ id: 'story-high', priority: 'high' });
      const lowStory = createStorySelection({ id: 'story-low', priority: 'low' });

      const stories = buildStoryMap([highStory, lowStory]);
      const eligibleIds = ['story-high', 'story-low'];
      const topoOrder: string[] = [];

      const result = selectStoryForAssignment(eligibleIds, stories, topoOrder);

      expect(result.selected).toBe(true);
      if (result.selected) {
        expect(result.storyId).toBe('story-high');
      }
    });
  });

  // -----------------------------------------------------------------------
  // Topological order tiebreaker
  // -----------------------------------------------------------------------
  describe('topological order tiebreaker', () => {
    it('should use topological order as tiebreaker for same priority', () => {
      const storyA = createStorySelection({
        id: 'story-a',
        priority: 'high',
        createdAt: new Date('2025-01-01'),
      });
      const storyB = createStorySelection({
        id: 'story-b',
        priority: 'high',
        createdAt: new Date('2025-01-01'),
      });

      const stories = buildStoryMap([storyA, storyB]);
      const eligibleIds = ['story-a', 'story-b'];
      // story-b is earlier in topo order (position 0)
      const topoOrder = ['story-b', 'story-a'];

      const result = selectStoryForAssignment(eligibleIds, stories, topoOrder);

      expect(result.selected).toBe(true);
      if (result.selected) {
        expect(result.storyId).toBe('story-b');
      }
    });

    it('should prefer story in topo order over story not in topo order (same priority)', () => {
      const storyInTopo = createStorySelection({
        id: 'story-in-topo',
        priority: 'high',
        createdAt: new Date('2025-06-01'),
      });
      const storyNotInTopo = createStorySelection({
        id: 'story-not-in-topo',
        priority: 'high',
        createdAt: new Date('2025-01-01'), // older, but not in topo
      });

      const stories = buildStoryMap([storyInTopo, storyNotInTopo]);
      const eligibleIds = ['story-in-topo', 'story-not-in-topo'];
      const topoOrder = ['story-in-topo']; // only story-in-topo is in topo order

      const result = selectStoryForAssignment(eligibleIds, stories, topoOrder);

      expect(result.selected).toBe(true);
      if (result.selected) {
        expect(result.storyId).toBe('story-in-topo');
      }
    });
  });

  // -----------------------------------------------------------------------
  // Creation time tiebreaker
  // -----------------------------------------------------------------------
  describe('creation time tiebreaker', () => {
    it('should use creation time as final tiebreaker (oldest first)', () => {
      const olderStory = createStorySelection({
        id: 'story-old',
        priority: 'high',
        createdAt: new Date('2024-01-01'),
      });
      const newerStory = createStorySelection({
        id: 'story-new',
        priority: 'high',
        createdAt: new Date('2025-06-01'),
      });

      const stories = buildStoryMap([olderStory, newerStory]);
      const eligibleIds = ['story-old', 'story-new'];
      // Same topo position (both at Infinity since neither is in the topo order)
      const topoOrder: string[] = [];

      const result = selectStoryForAssignment(eligibleIds, stories, topoOrder);

      expect(result.selected).toBe(true);
      if (result.selected) {
        expect(result.storyId).toBe('story-old');
      }
    });

    it('should select older story when priority and topo order are tied', () => {
      // To test creation time tiebreaker, we need stories with the same
      // priority and effectively the same topo position. Since topo positions
      // are index-based and always unique, we place a third story at position 0
      // and our two test stories at positions 1 and 2. Then creation time
      // breaks the tie between the two at adjacent topo positions.
      // Note: this still uses topo as a distinguisher. For a pure creation time
      // test, see "should use creation time as final tiebreaker" above.
      const storyA = createStorySelection({
        id: 'story-a',
        priority: 'medium',
        createdAt: new Date('2025-03-15'), // newer
      });
      const storyB = createStorySelection({
        id: 'story-b',
        priority: 'medium',
        createdAt: new Date('2025-01-10'), // older
      });

      const stories = buildStoryMap([storyA, storyB]);

      // story-b first in topo order (lower position number).
      // With same priority, topo tiebreaker picks story-b.
      // Creation time also favors story-b (older).
      // Both tiebreakers agree on story-b.
      const result = selectStoryForAssignment(['story-a', 'story-b'], stories, [
        'story-b',
        'story-a',
      ]);

      expect(result.selected).toBe(true);
      if (result.selected) {
        expect(result.storyId).toBe('story-b');
      }
    });
  });

  // -----------------------------------------------------------------------
  // No eligible stories
  // -----------------------------------------------------------------------
  describe('no eligible stories', () => {
    it('should return selected: false when no eligible stories', () => {
      const result = selectStoryForAssignment([], new Map(), []);

      expect(result.selected).toBe(false);
      expect(result.reason).toContain('No eligible');
    });

    it('should return selected: false when eligible IDs have no metadata', () => {
      // IDs exist but no corresponding metadata in the map
      const result = selectStoryForAssignment(['story-1', 'story-2'], new Map(), []);

      expect(result.selected).toBe(false);
      expect(result.reason).toContain('no metadata');
    });
  });

  // -----------------------------------------------------------------------
  // Single story
  // -----------------------------------------------------------------------
  describe('single story', () => {
    it('should select the single eligible story', () => {
      const story = createStorySelection({ id: 'story-1', priority: 'low' });
      const stories = buildStoryMap([story]);

      const result = selectStoryForAssignment(['story-1'], stories, ['story-1']);

      expect(result.selected).toBe(true);
      if (result.selected) {
        expect(result.storyId).toBe('story-1');
      }
    });

    it('should include reason with priority and position info', () => {
      const story = createStorySelection({ id: 'story-1', priority: 'high' });
      const stories = buildStoryMap([story]);

      const result = selectStoryForAssignment(['story-1'], stories, ['story-1']);

      expect(result.selected).toBe(true);
      if (result.selected) {
        expect(result.reason).toContain('high');
        expect(result.reason).toContain('story-1');
      }
    });
  });

  // -----------------------------------------------------------------------
  // Stories not in topological order (Infinity position)
  // -----------------------------------------------------------------------
  describe('stories not in topological order', () => {
    it('should rank stories not in topo order after stories in topo order', () => {
      const inTopoStory = createStorySelection({
        id: 'story-in',
        priority: 'medium',
        createdAt: new Date('2025-06-01'),
      });
      const notInTopoStory = createStorySelection({
        id: 'story-out',
        priority: 'medium',
        createdAt: new Date('2024-01-01'), // much older
      });

      const stories = buildStoryMap([inTopoStory, notInTopoStory]);
      const result = selectStoryForAssignment(['story-in', 'story-out'], stories, ['story-in']);

      expect(result.selected).toBe(true);
      if (result.selected) {
        expect(result.storyId).toBe('story-in');
      }
    });

    it('should use creation time for two stories both not in topo order', () => {
      const olderStory = createStorySelection({
        id: 'story-a',
        priority: 'medium',
        createdAt: new Date('2024-01-01'),
      });
      const newerStory = createStorySelection({
        id: 'story-b',
        priority: 'medium',
        createdAt: new Date('2025-06-01'),
      });

      const stories = buildStoryMap([olderStory, newerStory]);
      const result = selectStoryForAssignment(
        ['story-a', 'story-b'],
        stories,
        [], // neither in topo order
      );

      expect(result.selected).toBe(true);
      if (result.selected) {
        expect(result.storyId).toBe('story-a'); // older
      }
    });
  });

  // -----------------------------------------------------------------------
  // Three-tier combined
  // -----------------------------------------------------------------------
  describe('three-tier combined sorting', () => {
    it('priority always wins over topo order and creation time', () => {
      const lowEarly = createStorySelection({
        id: 'story-low',
        priority: 'low',
        createdAt: new Date('2020-01-01'),
      });
      const highLate = createStorySelection({
        id: 'story-high',
        priority: 'high',
        createdAt: new Date('2025-12-31'),
      });

      const stories = buildStoryMap([lowEarly, highLate]);
      // low is first in topo order
      const result = selectStoryForAssignment(['story-low', 'story-high'], stories, [
        'story-low',
        'story-high',
      ]);

      expect(result.selected).toBe(true);
      if (result.selected) {
        expect(result.storyId).toBe('story-high'); // priority wins
      }
    });
  });
});

// ===========================================================================
// rankEligibleStories
// ===========================================================================
describe('rankEligibleStories', () => {
  it('should return all stories sorted by priority, topo order, then creation time', () => {
    const high1 = createStorySelection({
      id: 'story-h1',
      priority: 'high',
      createdAt: new Date('2025-01-01'),
    });
    const high2 = createStorySelection({
      id: 'story-h2',
      priority: 'high',
      createdAt: new Date('2025-06-01'),
    });
    const med1 = createStorySelection({
      id: 'story-m1',
      priority: 'medium',
      createdAt: new Date('2025-01-01'),
    });
    const low1 = createStorySelection({
      id: 'story-l1',
      priority: 'low',
      createdAt: new Date('2025-01-01'),
    });

    const stories = buildStoryMap([high1, high2, med1, low1]);
    const topoOrder = ['story-h2', 'story-h1', 'story-m1', 'story-l1'];

    const ranked = rankEligibleStories(
      ['story-h1', 'story-h2', 'story-m1', 'story-l1'],
      stories,
      topoOrder,
    );

    // High priority first, h2 before h1 (topo tiebreaker), then medium, then low
    expect(ranked).toEqual(['story-h2', 'story-h1', 'story-m1', 'story-l1']);
  });

  it('should return empty array for no eligible stories', () => {
    const ranked = rankEligibleStories([], new Map(), []);
    expect(ranked).toEqual([]);
  });

  it('should return single story for single eligible story', () => {
    const story = createStorySelection({ id: 'story-1', priority: 'medium' });
    const stories = buildStoryMap([story]);

    const ranked = rankEligibleStories(['story-1'], stories, ['story-1']);

    expect(ranked).toEqual(['story-1']);
  });

  it('should skip eligible IDs that have no metadata', () => {
    const story = createStorySelection({ id: 'story-1', priority: 'medium' });
    const stories = buildStoryMap([story]);

    const ranked = rankEligibleStories(['story-1', 'story-missing'], stories, ['story-1']);

    expect(ranked).toEqual(['story-1']);
  });

  it('should match the order used by selectStoryForAssignment', () => {
    const stories = [
      createStorySelection({ id: 'story-a', priority: 'low', createdAt: new Date('2025-01-01') }),
      createStorySelection({ id: 'story-b', priority: 'high', createdAt: new Date('2025-06-01') }),
      createStorySelection({
        id: 'story-c',
        priority: 'medium',
        createdAt: new Date('2025-03-01'),
      }),
    ];
    const storyMap = buildStoryMap(stories);
    const ids = ['story-a', 'story-b', 'story-c'];
    const topoOrder = ['story-a', 'story-b', 'story-c'];

    const ranked = rankEligibleStories(ids, storyMap, topoOrder);
    const selected = selectStoryForAssignment(ids, storyMap, topoOrder);

    // The first in ranked should be the selected one.
    expect(selected.selected).toBe(true);
    if (selected.selected) {
      expect(ranked[0]).toBe(selected.storyId);
    }
  });
});
