import { Page } from '@playwright/test';
import { test, expect } from './testSetup';
import { basicInit, login, testUsers } from './mocks';

async function openAdminDashboard(page: Page) {
  const backend = await basicInit(page);
  await login(page, testUsers.admin);
  await page.getByRole('navigation', { name: 'Global' }).getByRole('link', { name: 'Admin' }).click();
  await expect(page).toHaveURL(/\/admin-dashboard$/);
  return backend;
}

const franchiseCell = (page: Page, name: string) => page.getByRole('cell', { name, exact: true });

test('admin dashboard pages through franchises', async ({ page }) => {
  const backend = await openAdminDashboard(page);
  const pageSize = 3;
  const [firstPage, secondPage] = [backend.franchises.slice(0, pageSize), backend.franchises.slice(pageSize)];

  for (const f of firstPage) await expect(franchiseCell(page, f.name)).toBeVisible();
  for (const f of secondPage) await expect(franchiseCell(page, f.name)).toHaveCount(0);

  await page.getByRole('button', { name: '»' }).click();
  for (const f of secondPage) await expect(franchiseCell(page, f.name)).toBeVisible();
  for (const f of firstPage) await expect(franchiseCell(page, f.name)).toHaveCount(0);

  await page.getByRole('button', { name: '«' }).click();
  await expect(franchiseCell(page, firstPage[0].name)).toBeVisible();
});

test('admin filters franchises by name', async ({ page }) => {
  const backend = await openAdminDashboard(page);
  const term = 'pizza';
  const matches = backend.franchises.filter((f) => f.name.toLowerCase().includes(term));
  const others = backend.franchises.filter((f) => !matches.includes(f));

  await page.getByPlaceholder('Filter franchises').fill(term);
  await page.getByRole('button', { name: 'Submit' }).click();

  for (const f of matches) await expect(franchiseCell(page, f.name)).toBeVisible();
  for (const f of others) await expect(franchiseCell(page, f.name)).toHaveCount(0);
});

test('admin creates a franchise', async ({ page }) => {
  const backend = await openAdminDashboard(page);
  const owner = testUsers.diner;

  await page.getByRole('button', { name: 'Add Franchise' }).click();
  await page.getByPlaceholder('franchise name').fill('Pizza Palace');
  await page.getByPlaceholder('franchisee admin email').fill(owner.email!);
  await page.getByRole('button', { name: 'Create' }).click();

  await expect(page).toHaveURL(/\/admin-dashboard$/);
  expect(backend.franchises.find((f) => f.name === 'Pizza Palace')).toMatchObject({ admins: [{ id: owner.id, email: owner.email }] });
});

test('admin closes a franchise after confirming', async ({ page }) => {
  const backend = await openAdminDashboard(page);
  const franchise = backend.franchises[0];
  const closeButton = page.getByRole('row', { name: franchise.name }).getByRole('button', { name: 'Close' });

  // Cancelling leaves it alone
  await closeButton.click();
  await expect(page.getByRole('main')).toContainText(franchise.name);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(franchiseCell(page, franchise.name)).toBeVisible();

  await closeButton.click();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page).toHaveURL(/\/admin-dashboard$/);
  await expect(franchiseCell(page, franchise.name)).toHaveCount(0);
  expect(backend.franchises).not.toContainEqual(expect.objectContaining({ id: franchise.id }));
});

test('admin closes a store', async ({ page }) => {
  const backend = await openAdminDashboard(page);
  const franchise = backend.franchises[0];
  const store = franchise.stores[0];

  await page.getByRole('row', { name: store.name }).getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('main')).toContainText(store.name);
  await page.getByRole('button', { name: 'Close' }).click();

  await expect(page).toHaveURL(/\/admin-dashboard$/);
  await expect(page.getByRole('row', { name: store.name })).toHaveCount(0);
  expect(backend.franchises[0].stores).not.toContainEqual(expect.objectContaining({ id: store.id }));
});

test('non-admins cannot see the admin dashboard', async ({ page }) => {
  await basicInit(page);
  await login(page, testUsers.diner);
  await expect(page.getByRole('navigation', { name: 'Global' }).getByRole('link', { name: 'Admin' })).toHaveCount(0);

  await page.goto('/admin-dashboard');
  await expect(page.getByRole('heading', { name: 'Oops' })).toBeVisible();
});
