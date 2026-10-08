import { test as coverageTest, expect } from 'playwright-test-coverage';

// Origins the frontend talks to in development mode
export const serviceUrl = 'http://localhost:3000';
export const factoryUrl = 'https://pizza-factory.cs329.click';

const backendOrigins = [serviceUrl, factoryUrl];

// Any backend request that a page-level mock doesn't fulfill should fall through to this
// context-level route, get aborted, and fails. Page route should take precedence
// over context routes, so that mocks registered with page.route() win.
export const test = coverageTest.extend({
  context: async ({ context }, use) => {
    const unmocked: string[] = [];
    await context.route(
      (url) => backendOrigins.includes(url.origin),
      async (route) => {
        unmocked.push(`${route.request().method()} ${route.request().url()}`);
        await route.abort();
      }
    );

    await use(context);

    expect(unmocked, 'Backend requests escaped the mocks').toEqual([]);
  },
});

export { expect };
