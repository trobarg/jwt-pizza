import { Page } from '@playwright/test';
import { test, expect } from './testSetup';
import { basicInit, login, MockBackend, testUsers } from './mocks';
import { Role, User } from '../src/service/pizzaService';

// `seed` can add to the mock backend before the dashboard loads.
async function openAdminDashboard(page: Page, seed?: (backend: MockBackend) => void) {
  const backend = await basicInit(page);
  seed?.(backend);
  await login(page, testUsers.admin);
  await page.getByRole('navigation', { name: 'Global' }).getByRole('link', { name: 'Admin' }).click();
  await expect(page).toHaveURL(/\/admin-dashboard$/);
  return backend;
}

// The Franchises and Users tables both have Submit, « and » buttons, so scope lookups to one table.
const franchiseTable = (page: Page) => page.getByRole('table', { name: 'Franchises' });
const franchiseCell = (page: Page, name: string) => franchiseTable(page).getByRole('cell', { name, exact: true });

test('admin dashboard pages through franchises', async ({ page }) => {
  const backend = await openAdminDashboard(page);
  const pageSize = 3;
  const [firstPage, secondPage] = [backend.franchises.slice(0, pageSize), backend.franchises.slice(pageSize)];

  for (const f of firstPage) await expect(franchiseCell(page, f.name)).toBeVisible();
  for (const f of secondPage) await expect(franchiseCell(page, f.name)).toHaveCount(0);

  await franchiseTable(page).getByRole('button', { name: '»' }).click();
  for (const f of secondPage) await expect(franchiseCell(page, f.name)).toBeVisible();
  for (const f of firstPage) await expect(franchiseCell(page, f.name)).toHaveCount(0);

  await franchiseTable(page).getByRole('button', { name: '«' }).click();
  await expect(franchiseCell(page, firstPage[0].name)).toBeVisible();
});

test('admin filters franchises by name', async ({ page }) => {
  const backend = await openAdminDashboard(page);
  const term = 'pizza';
  const matches = backend.franchises.filter((f) => f.name.toLowerCase().includes(term));
  const others = backend.franchises.filter((f) => !matches.includes(f));

  await page.getByPlaceholder('Filter franchises').fill(term);
  await franchiseTable(page).getByRole('button', { name: 'Submit' }).click();

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

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

const usersTable = (page: Page) => page.getByRole('table', { name: 'Users' });
// Emails are unique, so they identify a user's row.
const userRow = (page: Page, user: User) => usersTable(page).getByRole('row', { name: user.email });

// Adds diners named "Extra 00", "Extra 01", ... with ids after the seeded users, so they sort last.
function addExtraUsers(backend: MockBackend, count: number) {
  const extras: User[] = Array.from({ length: count }, (_, i) => {
    const n = String(i).padStart(2, '0');
    return { id: String(200 + i), name: `Extra ${n}`, email: `extra${n}@jwt.com`, password: 'x', roles: [{ role: Role.Diner }] };
  });
  backend.users.push(...extras);
  return extras;
}

test('admin dashboard lists users with name, email, and role', async ({ page }) => {
  await openAdminDashboard(page);

  for (const user of Object.values(testUsers)) {
    const row = userRow(page, user);
    await expect(row).toContainText(user.name!);
    await expect(row).toContainText(user.roles!.map((r) => r.role).join(', '));
  }
});

test('admin pages through users', async ({ page }) => {
  let extras: User[] = [];
  await openAdminDashboard(page, (backend) => (extras = addExtraUsers(backend, 10)));
  // 13 users at 10 per page: the admin (id 1) is on page one, the last extra on page two.
  const [first, last] = [testUsers.admin, extras[extras.length - 1]];
  const [prev, next] = [usersTable(page).getByRole('button', { name: '«' }), usersTable(page).getByRole('button', { name: '»' })];

  await expect(userRow(page, first)).toBeVisible();
  await expect(userRow(page, last)).toHaveCount(0);
  await expect(prev).toBeDisabled();

  await next.click();
  await expect(userRow(page, last)).toBeVisible();
  await expect(userRow(page, first)).toHaveCount(0);
  await expect(next).toBeDisabled();

  await prev.click();
  await expect(userRow(page, first)).toBeVisible();
});

test('admin filters users by name', async ({ page }) => {
  await openAdminDashboard(page);
  const { diner, franchisee, admin } = testUsers;

  await page.getByPlaceholder('Filter users').fill('kai');
  await usersTable(page).getByRole('button', { name: 'Submit' }).click();

  await expect(userRow(page, diner)).toBeVisible();
  await expect(userRow(page, franchisee)).toHaveCount(0);
  await expect(userRow(page, admin)).toHaveCount(0);
});

test('paging keeps the user filter', async ({ page }) => {
  let extras: User[] = [];
  await openAdminDashboard(page, (backend) => (extras = addExtraUsers(backend, 12)));

  await page.getByPlaceholder('Filter users').fill('extra');
  await usersTable(page).getByRole('button', { name: 'Submit' }).click();
  await expect(userRow(page, testUsers.admin)).toHaveCount(0);

  // 12 matches: page two holds only the last two. Unfiltered, it would start at extras[7].
  await usersTable(page).getByRole('button', { name: '»' }).click();
  await expect(userRow(page, extras[10])).toBeVisible();
  await expect(userRow(page, extras[11])).toBeVisible();
  await expect(userRow(page, extras[7])).toHaveCount(0);
});

test('admin deletes a user', async ({ page }) => {
  const backend = await openAdminDashboard(page);
  const diner = testUsers.diner;

  await userRow(page, diner).getByRole('button', { name: 'Delete' }).click();

  await expect(userRow(page, diner)).toHaveCount(0);
  await expect(userRow(page, testUsers.franchisee)).toBeVisible();
  expect(backend.users).not.toContainEqual(expect.objectContaining({ id: diner.id }));
});

test('admin cannot delete themselves', async ({ page }) => {
  await openAdminDashboard(page);
  await expect(userRow(page, testUsers.admin).getByRole('button', { name: 'Delete' })).toBeDisabled();
  await expect(userRow(page, testUsers.diner).getByRole('button', { name: 'Delete' })).toBeEnabled();
});
