// Page object for the DAG Graph visualization page using ReactFlow.
// Provides interaction methods for zoom, pan, node clicks, and
// view level toggling.
import { type Page, type Locator, expect } from '@playwright/test';

import { BasePage } from './base.page';

export class GraphPage extends BasePage {
  /** The ReactFlow canvas container. */
  readonly canvas: Locator;

  /** The minimap component in the graph. */
  readonly minimap: Locator;

  /** Zoom in button in the graph controls. */
  readonly zoomInButton: Locator;

  /** Zoom out button in the graph controls. */
  readonly zoomOutButton: Locator;

  /** Fit-to-view button in the graph controls. */
  readonly fitViewButton: Locator;

  /** View level toggle (Task / Story / Epic). */
  readonly viewLevelToggle: Locator;

  /** Status filter chips container. */
  readonly statusFilters: Locator;

  constructor(page: Page) {
    super(page);
    this.canvas = page.locator('.react-flow');
    this.minimap = page.locator('.react-flow__minimap');
    this.zoomInButton = page.getByRole('button', { name: /zoom in/i });
    this.zoomOutButton = page.getByRole('button', { name: /zoom out/i });
    this.fitViewButton = page.getByRole('button', { name: /fit view/i });
    this.viewLevelToggle = page.getByRole('group', { name: /graph view level/i });
    this.statusFilters = page.getByText('Filter by status:').locator('..');
  }

  async goto(projectId?: string): Promise<this> {
    if (projectId) {
      await this.page.goto(`/projects/${projectId}?tab=graph`);
    }
    await this.waitForPageLoad();
    return this;
  }

  /** Get all graph nodes. */
  getNodes(): Locator {
    return this.canvas.locator('.react-flow__node');
  }

  /** Click a specific graph node by its label text. */
  async clickNode(label: string): Promise<this> {
    const node = this.canvas.locator('.react-flow__node').filter({
      hasText: label,
    });
    await node.click();
    return this;
  }

  /** Assert a node with the given label has the expected status border color class. */
  async expectNodeStatus(label: string, borderColorClass: string): Promise<void> {
    const node = this.canvas.locator('.react-flow__node').filter({
      hasText: label,
    });
    await expect(node).toBeVisible();
    // The status border color is on the inner div with border-l-[3px]
    const nodeBody = node.locator('div.border-l-\\[3px\\]');
    await expect(nodeBody).toHaveClass(new RegExp(borderColorClass));
  }

  /** Zoom in using the control button. */
  async zoomIn(clicks: number = 1): Promise<this> {
    for (let i = 0; i < clicks; i++) {
      await this.zoomInButton.click();
    }
    return this;
  }

  /** Zoom out using the control button. */
  async zoomOut(clicks: number = 1): Promise<this> {
    for (let i = 0; i < clicks; i++) {
      await this.zoomOutButton.click();
    }
    return this;
  }

  /** Fit the graph to the viewport. */
  async fitView(): Promise<this> {
    await this.fitViewButton.click();
    return this;
  }

  /** Pan the graph canvas by dragging. */
  async pan(deltaX: number, deltaY: number): Promise<this> {
    const box = await this.canvas.boundingBox();
    if (!box) throw new Error('Graph canvas not found');
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    await this.page.mouse.move(startX + deltaX, startY + deltaY, { steps: 10 });
    await this.page.mouse.up();
    return this;
  }

  /** Toggle the view level (Tasks, Stories, Epics). */
  async setViewLevel(level: 'tasks' | 'stories' | 'epics'): Promise<this> {
    await this.viewLevelToggle.getByRole('radio', { name: new RegExp(level, 'i') }).click();
    return this;
  }

  /** Toggle a status filter chip on or off. */
  async toggleStatusFilter(status: string): Promise<this> {
    // Status filter chips are <button> elements with aria-pressed and
    // aria-label like "Filter by Blocked: 2 nodes"
    await this.page.getByRole('button', { name: new RegExp(`filter by ${status}`, 'i') }).click();
    return this;
  }
}
