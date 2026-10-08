import { Page, Request, Route } from '@playwright/test';
import { Endpoints, Franchise, Menu, Order, Role, User } from '../src/service/pizzaService';
import { expect, factoryUrl, serviceUrl } from './testSetup';

// Credentials tests log in with. basicInit clones these, so tests can't leak state into each other.
export const testUsers: Record<'diner' | 'franchisee' | 'admin', User> = {
  diner: { id: '3', name: 'Kai Chen', email: 'd@jwt.com', password: 'a', roles: [{ role: Role.Diner }] },
  franchisee: {
    id: '4',
    name: 'Fran Chise',
    email: 'f@jwt.com',
    password: 'franchisee',
    roles: [{ role: Role.Diner }, { role: Role.Franchisee, objectId: '2' }],
  },
  admin: { id: '1', name: 'Mama Ricci', email: 'a@jwt.com', password: 'admin', roles: [{ role: Role.Admin }] },
};

export const testMenu: Menu = [
  // Order matters: tests destructure these as [veggie, pepperoni].
  { id: '1', title: 'Veggie', image: 'pizza1.png', price: 0.0038, description: 'A garden of delight' },
  { id: '2', title: 'Pepperoni', image: 'pizza2.png', price: 0.0042, description: 'Spicy treat' },
];

function seedFranchises(): Franchise[] {
  const { franchisee } = testUsers;
  return [
    {
      id: '2',
      name: 'LotaPizza',
      admins: [{ id: franchisee.id, name: franchisee.name, email: franchisee.email! }],
      stores: [
        { id: '4', name: 'Lehi', totalRevenue: 0.25 },
        { id: '5', name: 'Springville', totalRevenue: 0.1 },
      ],
    },
    { id: '3', name: 'PizzaCorp', admins: [], stores: [{ id: '7', name: 'Spanish Fork', totalRevenue: 0 }] },
    { id: '4', name: 'topSpot', admins: [], stores: [] },
    { id: '5', name: 'pizzaPocket', admins: [], stores: [] },
  ];
}

export const testDocs: Endpoints = {
  endpoints: [
    {
      requiresAuth: false,
      method: 'GET',
      path: '/api/order/menu',
      description: 'Get the pizza menu',
      example: 'curl localhost:3000/api/order/menu',
      response: testMenu,
    },
    {
      requiresAuth: true,
      method: 'POST',
      path: '/api/order',
      description: 'Create a order for the authenticated user',
      example: 'curl -X POST localhost:3000/api/order',
      response: { order: { id: 1 }, jwt: '1111111111' },
    },
  ],
};

export type MockBackend = Awaited<ReturnType<typeof basicInit>>;

// Mocks every endpoint in src/service/httpPizzaService.ts with an in-memory backend.
// Does not navigate; call page.goto() afterwards. Returns the backend state so tests
// can seed it before navigating or assert against it afterwards.
export async function basicInit(page: Page) {
  const state = {
    users: Object.values(structuredClone(testUsers)),
    franchises: seedFranchises(),
    orders: {
      [testUsers.diner.id!]: [
        { id: '1', franchiseId: '2', storeId: '4', date: '2024-06-05T05:14:40.000Z', items: [{ menuId: '1', description: 'Veggie', price: 0.0038 }] },
      ],
    } as Record<string, Order[]>,
    issuedJwts: [] as string[],
    loggedInUser: undefined as User | undefined,
    // Set to make POST /api/order fail the way the real service does when the factory rejects an order.
    factoryRejectsOrders: false,
  };
  const token = 'abcdef';
  let nextId = 100;
  const newId = () => String(nextId++);

  const withoutPassword = ({ password, ...user }: User): User => user;
  const isAdmin = (user: User) => Role.isRole(user, Role.Admin);

  // Mirrors the real service: a request is authenticated only if it carries the token
  // handed out at login/register and someone is still logged in.
  function authUser(request: Request): User | undefined {
    return request.headers()['authorization'] === `Bearer ${token}` ? state.loggedInUser : undefined;
  }
  const unauthorized = (route: Route) => route.fulfill({ status: 401, json: { message: 'unauthorized' } });
  const forbidden = (route: Route, message: string) => route.fulfill({ status: 403, json: { message } });

  function findFranchise(id: string) {
    return state.franchises.find((f) => f.id === id);
  }
  function canManage(user: User, franchise: Franchise) {
    return isAdmin(user) || !!franchise.admins?.some((a) => a.id === user.id);
  }

  await page.route(api(serviceUrl, '/api/auth'), async (route) => {
    const request = route.request();
    switch (request.method()) {
      case 'PUT': {
        const { email, password } = request.postDataJSON();
        const user = state.users.find((u) => u.email === email);
        if (!user || user.password !== password) return route.fulfill({ status: 404, json: { message: 'unknown user' } });
        state.loggedInUser = user;
        return route.fulfill({ json: { user: withoutPassword(user), token } });
      }
      case 'POST': {
        const { name, email, password } = request.postDataJSON();
        if (!name || !email || !password) return route.fulfill({ status: 400, json: { message: 'name, email, and password are required' } });
        const user: User = { id: newId(), name, email, password, roles: [{ role: Role.Diner }] };
        state.users.push(user);
        state.loggedInUser = user;
        return route.fulfill({ json: { user: withoutPassword(user), token } });
      }
      case 'DELETE': {
        if (!authUser(request)) return unauthorized(route);
        state.loggedInUser = undefined;
        return route.fulfill({ json: { message: 'logout successful' } });
      }
    }
    return route.fallback();
  });

  await page.route(api(serviceUrl, '/api/user/me'), async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const user = authUser(route.request());
    if (!user) return unauthorized(route);
    return route.fulfill({ json: withoutPassword(user) });
  });

  await page.route(api(serviceUrl, '/api/order/menu'), async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({ json: testMenu });
  });

  await page.route(api(serviceUrl, '/api/order'), async (route) => {
    const request = route.request();
    const user = authUser(request);
    switch (request.method()) {
      case 'GET': {
        if (!user) return unauthorized(route);
        return route.fulfill({ json: { dinerId: user.id, orders: state.orders[user.id!] ?? [], page: 1 } });
      }
      case 'POST': {
        if (!user) return unauthorized(route);
        if (state.factoryRejectsOrders) return route.fulfill({ status: 500, json: { message: 'Failed to fulfill order at factory' } });
        // The real service echoes the request plus an id; the date only shows up in order history.
        const order = { ...request.postDataJSON(), id: newId() };
        const jwt = `eyJpYXQ.mock-order.${order.id}`;
        (state.orders[user.id!] ??= []).push({ ...order, date: new Date().toISOString() });
        state.issuedJwts.push(jwt);
        return route.fulfill({ json: { order, jwt } });
      }
    }
    return route.fallback();
  });

  // List form: GET /api/franchise?page=&limit=&name=  and  POST /api/franchise
  await page.route(api(serviceUrl, '/api/franchise'), async (route) => {
    const request = route.request();
    switch (request.method()) {
      case 'GET': {
        const params = new URL(request.url()).searchParams;
        const pageNum = Number(params.get('page') ?? 0);
        const limit = Number(params.get('limit') ?? 10);
        const nameFilter = wildcardRegex(params.get('name') ?? '*');
        const matches = state.franchises.filter((f) => nameFilter.test(f.name));
        // Only admins get franchise admins and store revenue; everyone else gets ids and names.
        const user = authUser(request);
        const franchises = matches
          .slice(pageNum * limit, (pageNum + 1) * limit)
          .map((f) => (user && isAdmin(user) ? f : { id: f.id, name: f.name, stores: f.stores.map(({ id, name }) => ({ id, name })) }));
        return route.fulfill({ json: { franchises, more: matches.length > (pageNum + 1) * limit } });
      }
      case 'POST': {
        const user = authUser(request);
        if (!user) return unauthorized(route);
        if (!isAdmin(user)) return forbidden(route, 'unable to create a franchise');
        const { name, admins = [] }: Franchise = request.postDataJSON();
        const adminUsers = admins.map((a) => state.users.find((u) => u.email === a.email));
        const missing = admins.find((_, i) => !adminUsers[i]);
        if (missing) return route.fulfill({ status: 404, json: { message: `unknown user for franchise admin ${missing.email} provided` } });

        const franchise: Franchise = {
          id: newId(),
          name,
          admins: adminUsers.map((u) => ({ id: u!.id, name: u!.name, email: u!.email! })),
          stores: [],
        };
        adminUsers.forEach((u) => u!.roles!.push({ role: Role.Franchisee, objectId: franchise.id }));
        state.franchises.push(franchise);
        return route.fulfill({ json: franchise });
      }
    }
    return route.fallback();
  });

  // GET /api/franchise/:userId  and  DELETE /api/franchise/:franchiseId
  await page.route(api(serviceUrl, /^\/api\/franchise\/[^/]+$/), async (route) => {
    const request = route.request();
    const id = new URL(request.url()).pathname.split('/').pop()!;
    const user = authUser(request);
    switch (request.method()) {
      case 'GET': {
        if (!user) return unauthorized(route);
        if (user.id !== id && !isAdmin(user)) return route.fulfill({ json: [] });
        return route.fulfill({ json: state.franchises.filter((f) => f.admins?.some((a) => a.id === id)) });
      }
      case 'DELETE': {
        if (!user) return unauthorized(route);
        if (!isAdmin(user)) return forbidden(route, 'unable to delete a franchise');
        state.franchises = state.franchises.filter((f) => f.id !== id);
        state.users.forEach((u) => (u.roles = u.roles?.filter((r) => !(r.role === Role.Franchisee && r.objectId === id))));
        return route.fulfill({ json: { message: 'franchise deleted' } });
      }
    }
    return route.fallback();
  });

  // POST /api/franchise/:franchiseId/store
  await page.route(api(serviceUrl, /^\/api\/franchise\/[^/]+\/store$/), async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') return route.fallback();
    const user = authUser(request);
    if (!user) return unauthorized(route);
    const franchise = findFranchise(new URL(request.url()).pathname.split('/')[3]);
    if (!franchise || !canManage(user, franchise)) return forbidden(route, 'unable to create a store');
    const store = { id: newId(), name: request.postDataJSON().name };
    franchise.stores.push({ ...store, totalRevenue: 0 });
    return route.fulfill({ json: { ...store, franchiseId: franchise.id } });
  });

  // DELETE /api/franchise/:franchiseId/store/:storeId
  await page.route(api(serviceUrl, /^\/api\/franchise\/[^/]+\/store\/[^/]+$/), async (route) => {
    const request = route.request();
    if (request.method() !== 'DELETE') return route.fallback();
    const user = authUser(request);
    if (!user) return unauthorized(route);
    const [, , , franchiseId, , storeId] = new URL(request.url()).pathname.split('/');
    const franchise = findFranchise(franchiseId);
    if (!franchise || !canManage(user, franchise)) return forbidden(route, 'unable to delete a store');
    franchise.stores =franchise.stores.filter((s) => s.id !== storeId);
    return route.fulfill({ json: { message: 'store deleted' } });
  });

  for (const origin of [serviceUrl, factoryUrl]) {
    await page.route(api(origin, '/api/docs'), async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({ json: testDocs });
    });
  }

  await page.route(api(factoryUrl, '/api/order/verify'), async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const { jwt } = route.request().postDataJSON();
    if (!state.issuedJwts.includes(jwt)) return route.fulfill({ status: 400, json: { message: 'invalid' } });
    return route.fulfill({ json: { message: 'valid', payload: { vendor: { id: 'mock', name: 'Mock Vendor' }, jwt } } });
  });

  return state;
}

// Logs in through the UI and waits until the header reflects it.
export async function login(page: Page, user: User) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Email address' }).fill(user.email!);
  await page.getByRole('textbox', { name: 'Password' }).fill(user.password!);
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page.getByRole('navigation', { name: 'Global' }).getByRole('link', { name: 'Logout' })).toBeVisible();
}

function api(origin: string, path: string | RegExp) {
  return (url: URL) => url.origin === origin && (typeof path === 'string' ? url.pathname === path : path.test(url.pathname));
}

// The service's name filter uses '*' as a wildcard, e.g. '*pizza*'.
function wildcardRegex(pattern: string) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}
