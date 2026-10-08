import { test, expect } from './testSetup';
import { basicInit, login, testUsers } from './mocks';
import { User } from '../src/service/pizzaService';

// The header links to the dashboard with the user's initials, e.g. "Kai Chen" -> "KC".
function initials(user: User) {
  const names = user.name!.split(' ');
  return names[0][0] + (names.length > 1 ? names[names.length - 1][0] : '');
}

test('diner dashboard shows profile and order history', async ({ page }) => {
  const backend = await basicInit(page);
  const diner = testUsers.diner;
  await login(page, diner);

  await page.getByRole('link', { name: initials(diner) }).click();
  await expect(page).toHaveURL(/\/diner-dashboard$/);
  await expect(page.getByRole('main')).toContainText(diner.name!);
  await expect(page.getByRole('main')).toContainText(diner.email!);
  for (const order of backend.orders[diner.id!]) {
    await expect(page.getByRole('cell', { name: order.id, exact: true })).toBeVisible();
  }
});

test('franchisee role shows which franchise', async ({ page }) => {
  await basicInit(page);
  const franchisee = testUsers.franchisee;
  await login(page, franchisee);

  await page.getByRole('link', { name: initials(franchisee) }).click();
  const franchiseRole = franchisee.roles!.find((r) => r.objectId)!;
  await expect(page.getByRole('main')).toContainText(`Franchisee on ${franchiseRole.objectId}`);
});

test('a diner with no orders is pointed to the menu', async ({ page }) => {
  const backend = await basicInit(page);
  const diner = testUsers.diner;
  backend.orders[diner.id!] = [];
  await login(page, diner);

  await page.goto('/diner-dashboard');
  await page.getByRole('link', { name: 'Buy one' }).click();
  await expect(page).toHaveURL(/\/menu$/);
});
