import { test, expect, factoryUrl } from './testSetup';
import { basicInit, testDocs } from './mocks';

test('home page', async ({ page }) => {
  await page.goto('/');
  expect(await page.title()).toBe('JWT Pizza');
});

test('footer links to about and history', async ({ page }) => {
  await page.goto('/');
  const footer = page.getByRole('contentinfo');

  await footer.getByRole('link', { name: 'About' }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByRole('heading', { name: 'The secret sauce' })).toBeVisible();

  await footer.getByRole('link', { name: 'History' }).click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByRole('heading', { name: 'Mama Rucci, my my' })).toBeVisible();
});

test('unknown routes show not found', async ({ page }) => {
  await page.goto('/no-such-page');
  await expect(page.getByRole('heading', { name: 'Oops' })).toBeVisible();
});

test('docs list the service endpoints', async ({ page }) => {
  await basicInit(page);
  await page.goto('/docs');
  for (const endpoint of testDocs.endpoints) {
    await expect(page.getByRole('heading', { name: `[${endpoint.method}] ${endpoint.path}` })).toBeVisible();
  }
});

test('factory docs come from the factory', async ({ page }) => {
  await basicInit(page);
  const factoryDocsRequest = page.waitForRequest(`${factoryUrl}/api/docs`);
  await page.goto('/docs/factory');
  await factoryDocsRequest;
  await expect(page.getByRole('heading', { name: `[${testDocs.endpoints[0].method}] ${testDocs.endpoints[0].path}` })).toBeVisible();
});
