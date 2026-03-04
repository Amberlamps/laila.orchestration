// Navigation helpers for common multi-step flows across E2E tests.
// These helpers abstract away the navigation details so tests can
// focus on the behavior being tested.
import { type Page } from '@playwright/test';

import {
  ProjectListPage,
  ProjectDetailPage,
  EpicDetailPage,
  StoryDetailPage,
  DashboardPage,
} from '../page-objects';

/**
 * Navigate from the dashboard to a specific project's detail page.
 * Handles the navigation chain: Dashboard → Projects → Project Detail.
 */
export const navigateToProject = async (
  page: Page,
  projectName: string,
): Promise<ProjectDetailPage> => {
  const dashboard = new DashboardPage(page);
  await dashboard.navigateTo('Projects');
  const projectList = new ProjectListPage(page);
  await projectList.openProject(projectName);
  return new ProjectDetailPage(page);
};

/**
 * Navigate from a project detail page to a specific epic's detail page.
 * Assumes the user is already on the project detail page.
 */
export const navigateToEpic = async (page: Page, epicTitle: string): Promise<EpicDetailPage> => {
  const projectDetail = new ProjectDetailPage(page);
  await projectDetail.openEpic(epicTitle);
  return new EpicDetailPage(page);
};

/**
 * Navigate from an epic detail page to a specific story's detail page.
 * Assumes the user is already on the epic detail page.
 */
export const navigateToStory = async (page: Page, storyTitle: string): Promise<StoryDetailPage> => {
  const epicDetail = new EpicDetailPage(page);
  await epicDetail.openStory(storyTitle);
  return new StoryDetailPage(page);
};

/**
 * Navigate through the complete entity hierarchy:
 * Dashboard → Project → Epic → Story.
 * Returns the StoryDetailPage for further interaction.
 */
export const navigateToStoryFromDashboard = async (
  page: Page,
  projectName: string,
  epicTitle: string,
  storyTitle: string,
): Promise<StoryDetailPage> => {
  await navigateToProject(page, projectName);
  await navigateToEpic(page, epicTitle);
  return navigateToStory(page, storyTitle);
};
