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
    await customerPage.getByRole('button', { name: 'Salta', exact: true }).click();
    await selectProject(adminPage, project.name);
    await selectProject(customerPage, project.name);

    await expect(customerPage.getByRole('status').filter({ hasText: 'Live' })).toBeVisible();
    await adminPage.getByRole('button', { name: /Nuova segnalazione/i }).click();
    await adminPage.getByPlaceholder('Titolo della segnalazione', { exact: true }).fill(`Issue live ${suffix}`);
    await adminPage.getByPlaceholder('Descrizione dettagliata della richiesta o anomalia.', { exact: true })
      .fill('Creata da e2e per verificare il websocket.');
    await adminPage.getByRole('dialog').getByRole('checkbox').uncheck();
    await adminPage.getByRole('button', { name: /Crea segnalazione/i }).click();

    await expect(customerPage.getByText(`Issue live ${suffix}`)).toBeVisible();
  } finally {
    await adminContext.close();
    await customerContext.close();
    await api.dispose();
  }
});

test('an admin can be assigned, filtered and unassigned as a developer', async ({ page, baseURL }) => {
  const api = await request.newContext({ baseURL });
  try {
    const token = await ensureAdmin(api);
    const suffix = Date.now();
    const project = await post(api, '/api/projects', token, { name: `Admin assignment ${suffix}` });
    const issue = await post(api, '/api/work/issues', token, {
      projectId: project.id, title: `Admin ticket ${suffix}`, description: 'Admin developer assignment'
    });
    const me = await api.get('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
    expect(me.ok()).toBeTruthy();
    const admin = await me.json();
    const categorized = await api.patch(`/api/work/issues/${issue.id}/planning`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { issueType: 'ANOMALY', devUserId: null }
    });
    expect(categorized.ok(), await categorized.text()).toBeTruthy();

    await login(page, adminUsername, adminPassword);
    await selectProject(page, project.name);
    await page.goto('/pianificazione');
    const ticket = page.locator('.planning-card-item').filter({ hasText: issue.title });
    await ticket.getByRole('combobox').click();
    await page.getByRole('option', { name: adminUsername, exact: true }).click();
    await expect(ticket.getByRole('combobox')).toContainText(adminUsername);
    await expect.poll(async () => {
      const detail = await api.get(`/api/work/issues/${issue.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return (await detail.json()).issue.devUserId;
    }).toBe(admin.id);

    await page.goto('/anomalie');
    await page.locator('label').filter({ has: page.locator('span', { hasText: /^Sviluppatore$/ }) })
      .getByRole('combobox').click();
    await page.getByRole('option', { name: adminUsername, exact: true }).click();
    await expect(page.getByText(issue.title, { exact: true })).toBeVisible();

    await page.goto('/pianificazione');
    await ticket.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Non assegnato', exact: true }).click();
    await expect.poll(async () => {
      const detail = await api.get(`/api/work/issues/${issue.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return (await detail.json()).issue.devUserId;
    }).toBeNull();
    const stillAdmin = await api.get('/api/users', { headers: { Authorization: `Bearer ${token}` } });
    expect(stillAdmin.ok()).toBeTruthy();
  } finally {
    await api.dispose();
  }
});

test('a USER can approve only their own released issues', async ({ page, baseURL }) => {
  const api = await request.newContext({ baseURL });
  try {
    const admin = await ensureAdmin(api);
    const suffix = Date.now();
    const company = await post(api, '/api/companies', admin, { name: `Approval customer ${suffix}` });
    const project = await post(api, '/api/projects', admin, { name: `Approvals ${suffix}`, companyId: company.id });
    const username = `approval-user-${suffix}`;
    const password = 'approval-user-password-123';
    const user = await post(api, '/api/users', admin, {
      username, password, email: `${username}@example.com`, role: 'USER', companyId: company.id
    });
    const loginResponse = await api.post('/api/auth/login', { data: { username, password } });
    expect(loginResponse.ok()).toBeTruthy();
    const token = (await loginResponse.json()).accessToken;
    const ownIssue = await post(api, '/api/work/issues', token, {
      projectId: project.id, title: `Own approval ${suffix}`, description: 'Reported by USER'
    });
    const otherIssue = await post(api, '/api/work/issues', admin, {
      projectId: project.id, title: `Other approval ${suffix}`, description: 'Reported by another user'
    });
    for (const issue of [ownIssue, otherIssue]) {
      const released = await api.patch(`/api/work/issues/${issue.id}/status`, {
        headers: { Authorization: `Bearer ${admin}` }, data: { status: 'RELEASED' }
      });
      expect(released.ok(), await released.text()).toBeTruthy();
    }
    await login(page, username, password);
    await page.getByRole('button', { name: 'Salta', exact: true }).click();
    await selectProject(page, project.name);
    await page.getByText(otherIssue.title, { exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('heading', { name: otherIssue.title })).toBeVisible();
    await expect(page.getByRole('button', { name: /Approva$/ })).toHaveCount(0);
    const denied = await api.patch(`/api/work/issues/${otherIssue.id}/approval`, {
      headers: { Authorization: `Bearer ${token}` }, data: {}
    });
    expect(denied.status()).toBe(403);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByText(ownIssue.title, { exact: true }).click();
    await page.getByRole('button', { name: /Approva$/ }).click();
    await expect(page.getByRole('button', { name: /Approva$/ })).toHaveCount(0);
    await expect.poll(async () => {
      const response = await api.get(`/api/work/issues/${ownIssue.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const issue = (await response.json()).issue;
      return { status: issue.status, approver: issue.approveUserId };
    }).toEqual({ status: 'APPROVED', approver: user.id });
  } finally {
    await api.dispose();
  }
});

test('a USER can drag only their own released issue to Approved and persist it', async ({ page, baseURL }) => {
  const api = await request.newContext({ baseURL });
  try {
    const admin = await ensureAdmin(api);
    const suffix = Date.now();
    const company = await post(api, '/api/companies', admin, { name: `Approval customer ${suffix}` });
    const project = await post(api, '/api/projects', admin, { name: `Approvals ${suffix}`, companyId: company.id });
    const username = `approval-user-${suffix}`;
    const password = 'approval-user-password-123';
    const user = await post(api, '/api/users', admin, {
      username, password, email: `${username}@example.com`, role: 'USER', companyId: company.id
    });
    const loginResponse = await api.post('/api/auth/login', { data: { username, password } });
    expect(loginResponse.ok()).toBeTruthy();
    const token = (await loginResponse.json()).accessToken;
    const ownIssue = await post(api, '/api/work/issues', token, {
      projectId: project.id, title: `Own approval ${suffix}`, description: 'Reported by USER'
    });
    const otherIssue = await post(api, '/api/work/issues', admin, {
      projectId: project.id, title: `Other approval ${suffix}`, description: 'Reported by another user'
    });
    for (const issue of [ownIssue, otherIssue]) {
      const categorized = await api.patch(`/api/work/issues/${issue.id}/planning`, {
        headers: { Authorization: `Bearer ${admin}` }, data: { issueType: 'ANOMALY', devUserId: null }
      });
      expect(categorized.ok(), await categorized.text()).toBeTruthy();
      const released = await api.patch(`/api/work/issues/${issue.id}/status`, {
        headers: { Authorization: `Bearer ${admin}` }, data: { status: 'RELEASED' }
      });
      expect(released.ok(), await released.text()).toBeTruthy();
    }
    await login(page, username, password);
    await page.getByRole('button', { name: 'Salta', exact: true }).click();
    await selectProject(page, project.name);
    await page.goto('/anomalie');
    const approvedColumn = page.locator('[data-onboarding="board-approved-column"]');
    const ownCard = page.locator('.card-segnalazione').filter({ hasText: ownIssue.title });
    const otherCard = page.locator('.card-segnalazione').filter({ hasText: otherIssue.title });
    await otherCard.dragTo(approvedColumn);
    await expect(page.getByText('Solo l’autore USER, un SUPERUSER o un ADMIN per segnalazioni interne può spostare in Approvato.')).toBeVisible();
    await expect(approvedColumn.getByText(otherIssue.title, { exact: true })).toHaveCount(0);
    const unchanged = await api.get(`/api/work/issues/${otherIssue.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect((await unchanged.json()).issue.status).toBe('RELEASED');
    await ownCard.dragTo(approvedColumn);
    await expect(approvedColumn.getByText(ownIssue.title, { exact: true })).toBeVisible();
    await expect.poll(async () => {
      const response = await api.get(`/api/work/issues/${ownIssue.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const issue = (await response.json()).issue;
      return { status: issue.status, approver: issue.approveUserId };
    }).toEqual({ status: 'APPROVED', approver: user.id });
    await page.reload();
    await expect(approvedColumn.getByText(ownIssue.title, { exact: true })).toBeVisible();
    await expect(approvedColumn.getByText(otherIssue.title, { exact: true })).toHaveCount(0);

  } finally {
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
  await page.getByRole('banner').getByRole('combobox').click();
  await page.getByRole('option', { name: projectName }).click();
  await expect(page.getByText(`Segnalazioni del progetto ${projectName}`)).toBeVisible();
}
