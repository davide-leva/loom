import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test';

const adminUsername = process.env.E2E_ADMIN_USERNAME ?? 'e2e-admin';
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'e2e-admin-password-123';

test('new issues appear live for another connected user', async ({ browser, baseURL }) => {
  const api = await request.newContext({ baseURL });
  const adminToken = await ensureAdmin(api);
  const suffix = Date.now();
  const company = await post(api, '/api/companies', adminToken, { name: `E2E Customer ${suffix}` });
  const project = await post(api, '/api/projects', adminToken, { name: `E2E Project ${suffix}`, companyId: company.id });
  const customerUsername = `e2e-user-${suffix}`;
  const customerPassword = 'e2e-user-password-123';
  await post(api, '/api/users', adminToken, {
    username: customerUsername,
    email: `${customerUsername}@example.com`,
    password: customerPassword,
    role: 'USER',
    companyId: company.id
  });

  const adminContext = await browser.newContext();
  const customerContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const customerPage = await customerContext.newPage();

  try {
    await login(adminPage, adminUsername, adminPassword);
    await login(customerPage, customerUsername, customerPassword);
    await selectProject(adminPage, project.name);
    await selectProject(customerPage, project.name);

    await expect(customerPage.getByRole('status')).toContainText('Live');
    await adminPage.getByRole('button', { name: /Nuova segnalazione/i }).click();
    await adminPage.getByLabel('Titolo').fill(`Issue live ${suffix}`);
    await adminPage.getByLabel('Descrizione').fill('Creata da e2e per verificare il websocket.');
    await adminPage.getByRole('button', { name: /Crea segnalazione/i }).click();

    await expect(customerPage.getByText(`Issue live ${suffix}`)).toBeVisible();
  } finally {
    await adminContext.close();
    await customerContext.close();
    await api.dispose();
  }
});

async function ensureAdmin(api: APIRequestContext): Promise<string> {
  const setupStatus = await api.get('/api/setup/status');
  expect(setupStatus.ok()).toBeTruthy();
  const status = await setupStatus.json();
  if (status.required) {
    const setup = await api.post('/api/setup', {
      data: {
        teamCompanyName: 'E2E Team',
        username: adminUsername,
        email: `${adminUsername}@example.com`,
        password: adminPassword
      }
    });
    expect(setup.status(), await setup.text()).toBe(201);
  }
  const loginResponse = await api.post('/api/auth/login', {
    data: { username: adminUsername, password: adminPassword }
  });
  expect(loginResponse.status(), await loginResponse.text()).toBe(200);
  return (await loginResponse.json()).accessToken;
}

async function post(api: APIRequestContext, path: string, token: string, data: unknown): Promise<any> {
  const response = await api.post(path, {
    data,
    headers: { Authorization: `Bearer ${token}` }
  });
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}

async function login(page: Page, username: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /Accedi/i }).click();
  await expect(page).toHaveURL(/dashboard/);
}

async function selectProject(page: Page, projectName: string): Promise<void> {
  await page.getByLabel('Progetto').click();
  await page.getByRole('option', { name: projectName }).click();
  await expect(page.getByText(`Segnalazioni del progetto ${projectName}`)).toBeVisible();
}
