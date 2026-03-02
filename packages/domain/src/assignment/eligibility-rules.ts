// Determines which user stories are eligible for assignment.
// A story is eligible when its lifecycle, dependencies, parent epic,
// and project state all permit assignment.
// Pure function: no database calls, no side effects.
import type { UserStoryStatus, EpicStatus, ProjectStatus } from '../status/transition-definitions';

/**
 * Minimal project information needed for eligibility checking.
 */
export interface ProjectInfo {
  id: string;
  status: ProjectStatus;
}

/**
 * Minimal epic information needed for eligibility checking.
 */
export interface EpicInfo {
  id: string;
  status: EpicStatus;
}

/**
 * User story information needed for eligibility checking.
 */
export interface StoryEligibilityInfo {
  id: string;
  status: UserStoryStatus;
  epicId: string;
  /** Whether all cross-story task dependencies are satisfied */
  crossStoryDepsSatisfied: boolean;
}

/**
 * Result of an eligibility check for a single story.
 */
export interface EligibilityResult {
  storyId: string;
  eligible: boolean;
  /** If not eligible, the specific reason(s) why */
  disqualificationReasons: string[];
}

/**
 * Determine which user stories are eligible for assignment.
 *
 * Evaluates each story against all eligibility criteria and returns
 * the full list with eligibility status and disqualification reasons.
 * The caller can filter to only eligible stories.
 *
 * @param stories - All user stories in the project
 * @param epics - All epics in the project (for parent epic status check)
 * @param project - The project (for project state check)
 * @returns Eligibility result for each story
 */
export const evaluateEligibility = (
  stories: StoryEligibilityInfo[],
  epics: Map<string, EpicInfo>,
  project: ProjectInfo,
): EligibilityResult[] => {
  return stories.map((story) => {
    const reasons: string[] = [];

    // Rule 1: Project must be in ready or in-progress state.
    if (project.status !== 'ready' && project.status !== 'in-progress') {
      reasons.push(`Project is in "${project.status}" state — must be "ready" or "in-progress"`);
    }

    // Rule 2: Story must be in not-started status.
    if (story.status !== 'not-started') {
      reasons.push(`Story is in "${story.status}" status — must be "not-started"`);
    }

    // Rule 3: Parent epic must be in not-started or in-progress status.
    const parentEpic = epics.get(story.epicId);
    if (!parentEpic) {
      reasons.push(`Parent epic "${story.epicId}" not found`);
    } else if (parentEpic.status !== 'not-started' && parentEpic.status !== 'in-progress') {
      reasons.push(
        `Parent epic is "${parentEpic.status}" — must be "not-started" or "in-progress"`,
      );
    }

    // Rule 4: Cross-story dependencies must be satisfied.
    if (!story.crossStoryDepsSatisfied) {
      reasons.push('Cross-story task dependencies are not yet satisfied');
    }

    return {
      storyId: story.id,
      eligible: reasons.length === 0,
      disqualificationReasons: reasons,
    };
  });
};

/**
 * Convenience function that returns only the eligible stories.
 *
 * @param stories - All user stories in the project
 * @param epics - All epics in the project
 * @param project - The project info
 * @returns Only the eligible story IDs
 */
export const getEligibleStoryIds = (
  stories: StoryEligibilityInfo[],
  epics: Map<string, EpicInfo>,
  project: ProjectInfo,
): string[] => {
  return evaluateEligibility(stories, epics, project)
    .filter((result) => result.eligible)
    .map((result) => result.storyId);
};
