import { expect, type Page } from '@playwright/test';

export async function continueSavedSessionFromTitle(page: Page) {
  const continueButton = page.getByRole('button', { name: '继续游戏', exact: true });
  await expect(continueButton).toBeVisible();
  await continueButton.click();
  await expect(page.locator('.v1-title-screen')).toHaveCount(0);
  await expect(page.locator('main')).toBeVisible();
}
