import { test, expect } from './testSetup';
import { basicInit, login, testUsers } from './mocks';

test('updateUser', async ({ page }) => {
    await basicInit(page);

    // Register a new diner and open their dashboard ("pd" = pizza diner's initials).
    const email = `user${Math.floor(Math.random() * 10000)}@jwt.com`;
    await page.goto('/');
    await page.getByRole('link', { name: 'Register' }).click();
    await page.getByRole('textbox', { name: 'Full name' }).fill('pizza diner');
    await page.getByRole('textbox', { name: 'Email address' }).fill(email);
    await page.getByRole('textbox', { name: 'Password' }).fill('diner');
    await page.getByRole('button', { name: 'Register' }).click();

    await page.getByRole('link', { name: 'pd' }).click();

    await expect(page.getByRole('main')).toContainText('pizza diner');

    // Open the edit dialog and submit it unchanged; the name should stay the same.
    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(page.locator('h3')).toContainText('Edit user');
    await page.getByRole('button', { name: 'Update' }).click();

    await page.waitForSelector('[role="dialog"].hidden', { state: 'attached' });

    await expect(page.getByRole('main')).toContainText('pizza diner');

    // Change the name (the first textbox in the dialog); the dashboard should show it right away.
    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(page.locator('h3')).toContainText('Edit user');
    await page.getByRole('textbox').first().fill('pizza dinerx');
    await page.getByRole('button', { name: 'Update' }).click();

    await page.waitForSelector('[role="dialog"].hidden', { state: 'attached' });

    await expect(page.getByRole('main')).toContainText('pizza dinerx');

    // Log out and back in to prove the change was saved on the backend, not just in React state.
    await page.getByRole('link', { name: 'Logout' }).click();
    await page.getByRole('link', { name: 'Login' }).click();

    await page.getByRole('textbox', { name: 'Email address' }).fill(email);
    await page.getByRole('textbox', { name: 'Password' }).fill('diner');
    await page.getByRole('button', { name: 'Login' }).click();

    await page.getByRole('link', { name: 'pd' }).click();

    await expect(page.getByRole('main')).toContainText('pizza dinerx');
});

test('updateUser email and password', async ({ page }) => {
    await basicInit(page);
    const diner = testUsers.diner;
    const newEmail = 'kai@jwt.com';
    const newPassword = 'newpass';

    // Log in as the seeded diner and open their dashboard ("KC" = Kai Chen).
    await login(page, diner);
    await page.getByRole('link', { name: 'KC' }).click();

    // Change the email and password (the dialog's second and third textboxes).
    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(page.locator('h3')).toContainText('Edit user');
    const fields = page.getByRole('dialog').getByRole('textbox');
    await fields.nth(1).fill(newEmail);
    await fields.nth(2).fill(newPassword);
    await page.getByRole('button', { name: 'Update' }).click();

    await page.waitForSelector('[role="dialog"].hidden', { state: 'attached' });

    await expect(page.getByRole('main')).toContainText(newEmail);

    // The old credentials should no longer work...
    await page.getByRole('link', { name: 'Logout' }).click();
    await page.getByRole('link', { name: 'Login' }).click();

    await page.getByRole('textbox', { name: 'Email address' }).fill(diner.email!);
    await page.getByRole('textbox', { name: 'Password' }).fill(diner.password!);
    await page.getByRole('button', { name: 'Login' }).click();

    await expect(page.getByRole('main')).toContainText('unknown user');

    // ...but the new ones should.
    await login(page, { ...diner, email: newEmail, password: newPassword });
    await page.getByRole('link', { name: 'KC' }).click();

    await expect(page.getByRole('main')).toContainText(newEmail);
});

// Franchisees and admins use the same dashboard, so they should be able to edit their own name too.
for (const [role, initials] of [['franchisee', 'FC'], ['admin', 'MR']] as const) {
    test(`updateUser as ${role}`, async ({ page }) => {
        await basicInit(page);
        const user = testUsers[role];
        const newName = `${user.name}x`; // keeps the same initials

        await login(page, user);
        await page.getByRole('link', { name: initials }).click();

        await page.getByRole('button', { name: 'Edit' }).click();
        await expect(page.locator('h3')).toContainText('Edit user');
        await page.getByRole('textbox').first().fill(newName);
        await page.getByRole('button', { name: 'Update' }).click();

        await page.waitForSelector('[role="dialog"].hidden', { state: 'attached' });

        await expect(page.getByRole('main')).toContainText(newName);

        // Log out and back in with the unchanged password to prove the name was saved.
        await page.getByRole('link', { name: 'Logout' }).click();
        await login(page, user);
        await page.getByRole('link', { name: initials }).click();

        await expect(page.getByRole('main')).toContainText(newName);
    });
}
