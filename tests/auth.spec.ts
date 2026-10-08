import { test, expect } from './testSetup';
import { basicInit, login, testUsers } from './mocks';
import { Role } from '../src/service/pizzaService';

test('login survives a page reload', async ({ page }) => {
  await basicInit(page);
  await login(page, testUsers.diner);
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Global' }).getByRole('link', { name: 'Logout' })).toBeVisible();
});

test('login with a wrong password shows the error', async ({ page }) => {
  const backend = await basicInit(page);
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email address' }).fill(testUsers.diner.email!);
  await page.getByRole('textbox', { name: 'Password' }).fill('wrong');
  await page.getByRole('button', { name: 'Login' }).click();

  await expect(page.getByRole('main')).toContainText('unknown user');
  await expect(page).toHaveURL(/\/login$/);
  expect(backend.loggedInUser).toBeUndefined();
});

test('register a new diner', async ({ page }) => {
  const backend = await basicInit(page);
  const newUser = { name: 'Pat Doe', email: 'pat@jwt.com', password: 'secret' };

  await page.goto('/login');
  await page.getByRole('main').getByText('Register', { exact: true }).click();
  await expect(page).toHaveURL(/\/register$/);
  await page.getByPlaceholder('Full name').fill(newUser.name);
  await page.getByPlaceholder('Email address').fill(newUser.email);
  await page.getByPlaceholder('Password').fill(newUser.password);
  await page.getByRole('button', { name: 'Register' }).click();

  await expect(page.getByRole('navigation', { name: 'Global' }).getByRole('link', { name: 'Logout' })).toBeVisible();
  expect(backend.users.find((u) => u.email === newUser.email)).toMatchObject({ ...newUser, roles: [{ role: Role.Diner }] });
});

test('logout ends the session', async ({ page }) => {
  const backend = await basicInit(page);
  await login(page, testUsers.diner);
  const nav = page.getByRole('navigation', { name: 'Global' });

  await nav.getByRole('link', { name: 'Logout' }).click();
  await expect(nav.getByRole('link', { name: 'Login' })).toBeVisible();
  await expect.poll(() => backend.loggedInUser).toBeUndefined();

  await page.reload();
  await expect(nav.getByRole('link', { name: 'Login' })).toBeVisible();
});
