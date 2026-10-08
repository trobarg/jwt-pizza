import { test, expect } from './testSetup';
import { basicInit, testMenu, testUsers } from './mocks';

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
