import { Page } from '@playwright/test';
import { test, expect } from './testSetup';
import { basicInit, login, testMenu, testUsers } from './mocks';
import { Pizza } from '../src/service/pizzaService';

async function pickOrder(page: Page, storeName: string, pizzas: Pizza[]) {
  await page.goto('/menu');
  await page.getByRole('combobox').selectOption({ label: storeName });
  for (const pizza of pizzas) await page.getByRole('link', { name: pizza.title }).click();
  await page.getByRole('button', { name: 'Checkout' }).click();
}

test('purchase with login', async ({ page }) => {
  const backend = await basicInit(page);
  const diner = testUsers.diner;
  const [veggie, pepperoni] = testMenu;
  const franchise = backend.franchises[0];
  const store = franchise.stores[0];

  // Pick a store and two pizzas
  await page.goto('/');
  await page.getByRole('button', { name: 'Order now' }).click();
  await page.getByRole('combobox').selectOption({ label: store.name });
  await page.getByRole('link', { name: veggie.title }).click();
  await page.getByRole('link', { name: pepperoni.title }).click();
  await page.getByRole('button', { name: 'Checkout' }).click();

  // Paying requires a user, so a logged-out diner is sent to log in first
  await expect(page).toHaveURL(/\/payment\/login$/);
  await page.getByRole('textbox', { name: 'Email address' }).fill(diner.email!);
  await page.getByRole('textbox', { name: 'Password' }).fill(diner.password!);
  await page.getByRole('button', { name: 'Login' }).click();

  // Back on payment with the order intact
  await expect(page).toHaveURL(/\/payment$/);
  await expect(page.getByRole('row', { name: veggie.title })).toBeVisible();
  await expect(page.getByRole('row', { name: pepperoni.title })).toBeVisible();
  await page.getByRole('button', { name: 'Pay now' }).click();

  // The backend received exactly what was picked
  await expect(page).toHaveURL(/\/delivery$/);
  const orders = backend.orders[diner.id!];
  expect(orders[orders.length - 1]).toMatchObject({
    franchiseId: franchise.id,
    storeId: store.id,
    items: [veggie, pepperoni].map((pizza) => ({ menuId: pizza.id, description: pizza.title, price: pizza.price })),
  });

  // The JWT the backend issued verifies with the factory
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByText('valid', { exact: true })).toBeVisible();
});

test('checkout needs a store and at least one pizza', async ({ page }) => {
  const backend = await basicInit(page);
  await page.goto('/menu');
  const checkout = page.getByRole('button', { name: 'Checkout' });

  await expect(checkout).toBeDisabled();
  await page.getByRole('combobox').selectOption({ label: backend.franchises[0].stores[0].name });
  await expect(checkout).toBeDisabled();
  await page.getByRole('link', { name: testMenu[0].title }).click();
  await expect(checkout).toBeEnabled();
});

test('cancelling payment returns to the menu with the order kept', async ({ page }) => {
  const backend = await basicInit(page);
  await login(page, testUsers.diner);
  await pickOrder(page, backend.franchises[0].stores[0].name, testMenu);

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page).toHaveURL(/\/menu$/);
  await page.getByRole('button', { name: 'Checkout' }).click();
  for (const pizza of testMenu) await expect(page.getByRole('row', { name: pizza.title })).toBeVisible();
});

test('a failed payment shows the error and places no order', async ({ page }) => {
  const backend = await basicInit(page);
  const diner = testUsers.diner;
  backend.factoryRejectsOrders = true;
  const ordersBefore = backend.orders[diner.id!].length;
  await login(page, diner);
  await pickOrder(page, backend.franchises[0].stores[0].name, [testMenu[0]]);

  await page.getByRole('button', { name: 'Pay now' }).click();
  await expect(page.getByRole('main')).toContainText('Failed to fulfill order at factory');
  await expect(page).toHaveURL(/\/payment$/);
  expect(backend.orders[diner.id!]).toHaveLength(ordersBefore);
});

test('a JWT the factory rejects is reported invalid', async ({ page }) => {
  await basicInit(page);
  await page.goto('/delivery');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByRole('heading', { name: /invalid/ })).toBeVisible();
});

test('order more goes back to the menu', async ({ page }) => {
  await basicInit(page);
  await page.goto('/delivery');
  await page.getByRole('button', { name: 'Order more' }).click();
  await expect(page).toHaveURL(/\/menu$/);
});
