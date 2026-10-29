import { test as coverageTest, expect } from 'playwright-test-coverage';
import { loadEnv } from 'vite';

// Origins the frontend talks to in development mode, read from the same .env.development the dev server uses
const env = loadEnv('development', process.cwd(), 'VITE_');
export const serviceUrl = new URL(env.VITE_PIZZA_SERVICE_URL).origin;
export const factoryUrl = new URL(env.VITE_PIZZA_FACTORY_URL).origin;

const backendOrigins = [serviceUrl, factoryUrl];

// Any backend request that a page-level mock doesn't fulfill should fall through to this
// context-level route, get aborted, and fail. Page route should take precedence
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
