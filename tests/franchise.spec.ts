import { Page } from '@playwright/test';
import { test, expect } from './testSetup';
import { basicInit, login, testUsers } from './mocks';

const franchisee = testUsers.franchisee;

async function openFranchiseDashboard(page: Page) {
  const backend = await basicInit(page);
  await login(page, franchisee);
  await page.getByRole('navigation', { name: 'Global' }).getByRole('link', { name: 'Franchise' }).click();
  await expect(page).toHaveURL(/\/franchise-dashboard$/);
  const franchise = backend.franchises.find((f) => f.admins?.some((a) => a.id === franchisee.id))!;
  return { backend, franchise };
}

test('franchisee sees their franchise and stores', async ({ page }) => {
  const { franchise } = await openFranchiseDashboard(page);
  await expect(page.getByRole('heading', { name: franchise.name })).toBeVisible();
  for (const store of franchise.stores) await expect(page.getByRole('row', { name: store.name })).toBeVisible();
});

test('franchisee creates a store', async ({ page }) => {
  const { franchise } = await openFranchiseDashboard(page);

  await page.getByRole('button', { name: 'Create store' }).click();
  await page.getByPlaceholder('store name').fill('Provo');
  await page.getByRole('button', { name: 'Create' }).click();

  await expect(page).toHaveURL(/\/franchise-dashboard$/);
  await expect(page.getByRole('row', { name: 'Provo' })).toBeVisible();
  expect(franchise.stores).toContainEqual(expect.objectContaining({ name: 'Provo' }));
});

test('franchisee closes a store', async ({ page }) => {
  const { franchise } = await openFranchiseDashboard(page);
  const store = franchise.stores[0];

  await page.getByRole('row', { name: store.name }).getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('main')).toContainText(store.name);
  await page.getByRole('button', { name: 'Close' }).click();

  await expect(page).toHaveURL(/\/franchise-dashboard$/);
  await expect(page.getByRole('row', { name: store.name })).toHaveCount(0);
});

test('logged-out visitors are pitched a franchise and can log in from it', async ({ page }) => {
  await basicInit(page);
  await page.goto('/franchise-dashboard');
  await expect(page.getByRole('heading', { name: 'So you want a piece of the pie?' })).toBeVisible();

  await page.getByRole('main').getByRole('link', { name: 'login' }).click();
  await expect(page).toHaveURL(/\/franchise-dashboard\/login$/);
  await page.getByRole('textbox', { name: 'Email address' }).fill(franchisee.email!);
  await page.getByRole('textbox', { name: 'Password' }).fill(franchisee.password!);
  await page.getByRole('button', { name: 'Login' }).click();

  await expect(page).toHaveURL(/\/franchise-dashboard$/);
  await expect(page.getByRole('button', { name: 'Create store' })).toBeVisible();
});
