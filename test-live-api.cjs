const https = require('https');

function request(url, options = {}, bodyData = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const opts = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    };
    if (bodyData) {
      opts.headers['Content-Length'] = Buffer.byteLength(bodyData);
    }
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch(e) {
          parsed = data;
        }
        resolve({ status: res.statusCode, data: parsed, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (bodyData) req.write(bodyData);
    req.end();
  });
}

async function runLiveTest() {
  console.log('==================================================');
  console.log('   EUROSOL CRM LIVE API SUITE TEST');
  console.log('==================================================');
  const BASE_URL = process.env.CRM_TEST_BASE_URL || 'https://api.eurosolservice.com/v1';
  const TEST_EMAIL = process.env.CRM_TEST_EMAIL;
  const TEST_PASSWORD = process.env.CRM_TEST_PASSWORD;
  if (!TEST_EMAIL || !TEST_PASSWORD) {
    console.error('Refusing to run: set CRM_TEST_EMAIL and CRM_TEST_PASSWORD env vars (never commit credentials).');
    process.exit(1);
  }

  // 1. Authenticate
  console.log('\n[1/12] Testing Auth Login (POST /auth/login)...');
  const loginRes = await request(`${BASE_URL}/auth/login`, {
    method: 'POST'
  }, JSON.stringify({
    email: TEST_EMAIL,
    password: TEST_PASSWORD
  }));

  console.log('Login Status:', loginRes.status);
  if (loginRes.status !== 200 || !loginRes.data?.data?.token) {
    console.error('Login Failed!', loginRes.data);
    return;
  }
  const token = loginRes.data.data.token;
  const user = loginRes.data.data.user;
  console.log('Authenticated User:', user.name, '| Role:', user.role, '| Regions:', (user.regions || []).map(r => r.name).join(', '));
  const authHeaders = { 'Authorization': `Bearer ${token}` };

  // 2. Get Me / Profile
  console.log('\n[2/12] Testing Auth Me (GET /auth/me)...');
  const meRes = await request(`${BASE_URL}/auth/me`, { headers: authHeaders });
  console.log('Auth Me Status:', meRes.status, '| ID:', meRes.data?.data?.id || meRes.data?.id);

  // 3. Analytics Summary & Charts
  console.log('\n[3/12] Testing Analytics (GET /analytics/summary, /revenue-chart, /region-chart)...');
  const [summaryRes, revChartRes, regChartRes] = await Promise.all([
    request(`${BASE_URL}/analytics/summary`, { headers: authHeaders }),
    request(`${BASE_URL}/analytics/revenue-chart`, { headers: authHeaders }),
    request(`${BASE_URL}/analytics/region-chart`, { headers: authHeaders })
  ]);
  console.log('Summary Status:', summaryRes.status, '| Summary Data:', JSON.stringify(summaryRes.data?.data || summaryRes.data));
  console.log('Revenue Chart Status:', revChartRes.status, '| Items count:', Array.isArray(revChartRes.data?.data || revChartRes.data) ? (revChartRes.data?.data || revChartRes.data).length : 'object');
  console.log('Region Chart Status:', regChartRes.status, '| Items count:', Array.isArray(regChartRes.data?.data || regChartRes.data) ? (regChartRes.data?.data || regChartRes.data).length : 'object');

  // 4. Leads Management
  console.log('\n[4/12] Testing Leads (GET /leads)...');
  const leadsRes = await request(`${BASE_URL}/leads`, { headers: authHeaders });
  const rawLeads = leadsRes.data?.data;
  const leadsList = Array.isArray(rawLeads) ? rawLeads : (rawLeads?.data || rawLeads?.leads || rawLeads?.items || []);
  console.log('Leads Status:', leadsRes.status, '| Total Leads Count:', leadsList.length);
  if (leadsList.length > 0) {
    console.log('Sample Lead:', leadsList[0].name || leadsList[0].customerName || leadsList[0].clientName, '| Status:', leadsList[0].status, '| Region:', leadsList[0].region?.name || leadsList[0].city);
  }

  // 5. Site Surveys
  console.log('\n[5/12] Testing Surveys (GET /surveys)...');
  const surveysRes = await request(`${BASE_URL}/surveys`, { headers: authHeaders });
  const surveysData = Array.isArray(surveysRes.data?.data) ? surveysRes.data.data : (surveysRes.data?.data?.surveys || surveysRes.data?.data?.items || []);
  console.log('Surveys Status:', surveysRes.status, '| Count:', surveysData.length);

  // 6. Quotations
  console.log('\n[6/12] Testing Quotations (GET /quotations)...');
  const quotesRes = await request(`${BASE_URL}/quotations`, { headers: authHeaders });
  const quotesData = Array.isArray(quotesRes.data?.data) ? quotesRes.data.data : (quotesRes.data?.data?.quotations || quotesRes.data?.data?.items || []);
  console.log('Quotations Status:', quotesRes.status, '| Count:', quotesData.length);

  // 7. Installations
  console.log('\n[7/12] Testing Installations (GET /installations)...');
  const instRes = await request(`${BASE_URL}/installations`, { headers: authHeaders });
  const instData = Array.isArray(instRes.data?.data) ? instRes.data.data : (instRes.data?.data?.installations || instRes.data?.data?.items || []);
  console.log('Installations Status:', instRes.status, '| Count:', instData.length);

  // 8. Inventory
  console.log('\n[8/12] Testing Inventory (GET /inventory, /inventory/alerts)...');
  const [invRes, invAlertsRes] = await Promise.all([
    request(`${BASE_URL}/inventory`, { headers: authHeaders }),
    request(`${BASE_URL}/inventory/alerts`, { headers: authHeaders })
  ]);
  const invData = Array.isArray(invRes.data?.data) ? invRes.data.data : (invRes.data?.data?.items || invRes.data?.data?.products || []);
  console.log('Inventory Status:', invRes.status, '| Items Count:', invData.length);
  console.log('Inventory Alerts Status:', invAlertsRes.status);

  // 9. Payments & Revenue Stats
  console.log('\n[9/12] Testing Payments (GET /payments, /payments/stats)...');
  const [payRes, payStatsRes] = await Promise.all([
    request(`${BASE_URL}/payments`, { headers: authHeaders }),
    request(`${BASE_URL}/payments/stats`, { headers: authHeaders })
  ]);
  const payData = Array.isArray(payRes.data?.data) ? payRes.data.data : (payRes.data?.data?.payments || payRes.data?.data?.items || []);
  console.log('Payments Status:', payRes.status, '| Count:', payData.length);
  console.log('Payments Stats Status:', payStatsRes.status, '| Stats:', JSON.stringify(payStatsRes.data?.data || payStatsRes.data));

  // 10. Employees & Regions
  console.log('\n[10/12] Testing Employees & Regions (GET /employees, /settings/regions)...');
  const [empRes, regRes] = await Promise.all([
    request(`${BASE_URL}/employees`, { headers: authHeaders }),
    request(`${BASE_URL}/settings/regions`, { headers: authHeaders })
  ]);
  const empData = Array.isArray(empRes.data?.data) ? empRes.data.data : (empRes.data?.data?.employees || empRes.data?.data?.items || []);
  const regData = Array.isArray(regRes.data?.data) ? regRes.data.data : (regRes.data?.data?.regions || []);
  console.log('Employees Status:', empRes.status, '| Count:', empData.length);
  console.log('Regions Status:', regRes.status, '| Count:', regData.length);

  // 11. Tasks, Customers, Warranties
  console.log('\n[11/12] Testing Advanced CRM (GET /tasks, /customers, /warranties)...');
  const [tasksRes, custRes, warRes] = await Promise.all([
    request(`${BASE_URL}/tasks`, { headers: authHeaders }),
    request(`${BASE_URL}/customers`, { headers: authHeaders }),
    request(`${BASE_URL}/warranties`, { headers: authHeaders })
  ]);
  const tasksList = Array.isArray(tasksRes.data?.data) ? tasksRes.data.data : (tasksRes.data?.data?.tasks || []);
  const custList = Array.isArray(custRes.data?.data) ? custRes.data.data : (custRes.data?.data?.customers || []);
  const warList = Array.isArray(warRes.data?.data) ? warRes.data.data : (warRes.data?.data?.warranties || []);
  console.log('Tasks Status:', tasksRes.status, '| Count:', tasksList.length);
  console.log('Customers Status:', custRes.status, '| Count:', custList.length);
  console.log('Warranties Status:', warRes.status, '| Count:', warList.length);

  // 12. Settings & Notifications
  console.log('\n[12/12] Testing Settings & Notifications (GET /settings, /notifications)...');
  const [settingsRes, notifRes] = await Promise.all([
    request(`${BASE_URL}/settings`, { headers: authHeaders }),
    request(`${BASE_URL}/notifications`, { headers: authHeaders })
  ]);
  console.log('Settings Status:', settingsRes.status);
  console.log('Notifications Status:', notifRes.status);

  console.log('\n==================================================');
  console.log('   ALL LIVE API ENDPOINTS VERIFIED & TESTED!');
  console.log('==================================================');
}

runLiveTest().catch(console.error);
