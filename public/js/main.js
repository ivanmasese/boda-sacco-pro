
// ===== MOBILE SIDEBAR TOGGLE =====
function toggleSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const overlay  = document.getElementById('sidebarOverlay');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('show');
}
function closeSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const overlay  = document.getElementById('sidebarOverlay');
  sidebar.classList.remove('open');
  overlay.classList.remove('show');
}
// Close sidebar when a nav item is clicked on mobile
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.sbn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (window.innerWidth <= 900) closeSidebar();
    });
  });
});

// ============================================================
// BodaSACCO Chairman Panel — Complete JavaScript v4.0
// ============================================================

let TOKEN      = null;
let ADMIN      = null;
let SACCO      = null;
let SEL_LOAN   = null;
let SEL_MM_NET = 'mtn';
let SEL_PAY_NET = 'mtn';
let SEL_PAY_CAT = 'other';
let ALL_RIDERS  = [];
let ALL_LOANS   = [];
let ALL_SAVINGS = [];
let ALL_EXPENSES = [];
let LOAN_FILTER = 'pending';
let CHART_DATA  = {};

// ============================================================
// API
// ============================================================
async function api(url, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json', 'x-session-token': TOKEN || '' } };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

function ugx(n)      { return 'UGX ' + Number(n || 0).toLocaleString(); }
function pct(n)      { return Number(n || 0).toFixed(1) + '%'; }
function dt(iso)     { return new Date(iso).toLocaleDateString('en-UG', { day:'2-digit', month:'short', year:'numeric' }); }
function dtFull(iso) { return new Date(iso).toLocaleString('en-UG', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }); }

function showMsg(id, text, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className   = 'amsg ' + type;
}

function badge(status) {
  const map = { pending:'b-pending', approved:'b-approved', active:'b-active', overdue:'b-overdue', paid:'b-paid', rejected:'b-rejected', suspended:'b-suspended', cash:'b-cash', mtn:'b-mtn', airtel:'b-airtel', cash_request:'b-cash' };
  return `<span class="badge ${map[status]||'b-pending'}">${status}</span>`;
}

// ============================================================
// LOGIN
// ============================================================
async function doLogin() {
  const username = document.getElementById('l-user').value.trim();
  const password = document.getElementById('l-pass').value.trim();
  if (!username || !password) return showMsg('login-msg', 'Enter username and password.', 'error');
  try {
    showMsg('login-msg', '⏳ Signing in...', 'info');
    const data = await fetch('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    }).then(r => r.json());
    if (data.error) return showMsg('login-msg', '❌ ' + data.error, 'error');
    TOKEN = data.token;
    ADMIN = data.admin;
    SACCO = { name: data.admin.saccoName, plan: data.admin.plan, status: data.admin.status, dueDate: data.admin.subscriptionDueDate };

    // Update UI
    document.getElementById('sb-sacco-name').textContent  = ADMIN.saccoName;
    document.getElementById('sb-admin-name').textContent  = ADMIN.name;
    document.getElementById('sb-admin-role').textContent  = ADMIN.role;
    document.getElementById('sb-avatar').textContent      = ADMIN.name.charAt(0).toUpperCase();
    document.getElementById('tb-date').textContent        = new Date().toLocaleDateString('en-UG', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    document.getElementById('tb-plan').textContent        = (ADMIN.plan || 'starter').toUpperCase();
    document.getElementById('tb-sacco-status').textContent = ADMIN.status || 'Active';

    // Subscription warning
    if (ADMIN.dueDate) {
      const daysLeft = Math.ceil((new Date(ADMIN.dueDate) - new Date()) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 7 && daysLeft > 0) {
        document.getElementById('sub-warning').style.display = 'block';
        document.getElementById('sub-warning-text').textContent = `⚠️ Your subscription expires in ${daysLeft} days. Contact BodaSACCO to renew and avoid service interruption.`;
      }
    }

    document.getElementById('login-page').classList.remove('active');
    document.getElementById('app').classList.add('active');
    await loadAllData();
    goTo('home');
  } catch(err) { showMsg('login-msg', '❌ ' + err.message, 'error'); }
}

document.addEventListener('DOMContentLoaded', () => {
  ['l-user','l-pass'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  });
});

async function doLogout() {
  try { await api('/api/logout', 'POST'); } catch(e) {}
  TOKEN = null; ADMIN = null;
  stopAutoRefresh();
  document.getElementById('app').classList.remove('active');
  document.getElementById('login-page').classList.add('active');
  document.getElementById('l-pass').value = '';
}

// ============================================================
// LOAD ALL DATA AT ONCE
// ============================================================
async function loadAllData() {
  try {
    [ALL_RIDERS, ALL_SAVINGS, ALL_LOANS, ALL_EXPENSES] = await Promise.all([
      api('/api/riders'),
      api('/api/savings'),
      api('/api/loans'),
      api('/api/expenses')
    ]);
    updateAlertCount();
  } catch(err) { console.error('Data load error:', err); }
}

// ============================================================
// NAVIGATION
// ============================================================
function goTo(page) {
  document.querySelectorAll('.pg').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sbn').forEach(b => b.classList.remove('active'));
  document.getElementById('pg-' + page).classList.add('active');
  document.querySelectorAll('.sbn').forEach(btn => {
    if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes("'" + page + "'")) btn.classList.add('active');
  });
  const titles = { home:'Dashboard', alerts:'Urgent Actions', savings:'Savings', loans:'Loans', collections:'Collections', wallet:'SACCO Wallet', riders:'Riders', expenses:'Expenses', payments:'Payments', messages:'Messages', reports:'Reports', settings:'Settings', profile:'My Profile' };
  document.getElementById('tb-title').textContent = titles[page] || page;

  const loaders = { home:loadDashboard, alerts:loadAlerts, savings:loadSavings, loans:loadLoans, collections:loadCollections, wallet:loadWallet, riders:loadRiders, expenses:loadExpenses, payments:loadPayments, messages:loadMessages, reports:loadReports, settings:loadSettings, profile:loadProfile };
  if (loaders[page]) loaders[page]();
}

// ============================================================
// MODALS
// ============================================================
function openModal(id) {
  document.getElementById(id).classList.add('open');
  if (id === 'modal-deposit' || id === 'modal-mm-deposit' || id === 'modal-loan-create') populateRiderDropdowns();
}
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.addEventListener('click', e => { if (e.target.classList.contains('overlay')) e.target.classList.remove('open'); });

function populateRiderDropdowns() {
  const approved = ALL_RIDERS.filter(r => r.status === 'approved');
  ['dep-rider','mm-dep-rider','loan-rider'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Select Rider --</option>';
    approved.forEach(r => sel.innerHTML += `<option value="${r.id}">${r.name} — ${r.phone}</option>`);
  });
}

// ============================================================
// DASHBOARD
// ============================================================
async function loadDashboard() {
  try {
    // Always fetch fresh data from server first
    const [riders, savings, loans, expenses] = await Promise.all([
      api('/api/riders'),
      api('/api/savings'),
      api('/api/loans'),
      api('/api/expenses')
    ]);
    ALL_RIDERS   = riders;
    ALL_SAVINGS  = savings;
    ALL_LOANS    = loans;
    ALL_EXPENSES = expenses;

    const d = await api('/api/dashboard');
    CHART_DATA = d;

    // Calculate totals
    const totalSavings   = ALL_SAVINGS.filter(s => !s.reversed).reduce((sum, s) => sum + s.amount, 0);
    const activeRiders   = ALL_RIDERS.filter(r => r.status === 'approved').length;
    const activeLoans    = ALL_LOANS.filter(l => l.status === 'active').length;
    const overdueLoans   = ALL_LOANS.filter(l => l.status === 'overdue').length;
    const pendingLoans   = ALL_LOANS.filter(l => l.status === 'pending').length;
    const totalLoaned       = ALL_LOANS.reduce((sum, l) => sum + l.amount, 0);
    const totalRepaid       = ALL_LOANS.filter(l => l.status === 'paid').reduce((sum, l) => sum + l.totalRepayable, 0);
    const outstanding       = ALL_LOANS.filter(l => ['active','overdue'].includes(l.status)).reduce((sum, l) => sum + l.amount, 0);
    const totalExp          = ALL_EXPENSES.reduce((sum, e) => sum + e.amount, 0);
    const today             = new Date().toDateString();
    const todayDeps         = ALL_SAVINGS.filter(s => !s.reversed && new Date(s.date).toDateString() === today).reduce((sum, s) => sum + s.amount, 0);
    const thisMonth         = new Date(); thisMonth.setDate(1); thisMonth.setHours(0,0,0,0);
    const monthlyDeps       = ALL_SAVINGS.filter(s => !s.reversed && new Date(s.date) >= thisMonth).reduce((sum, s) => sum + s.amount, 0);
    // Correct wallet formula:
    // Total savings collected
    // MINUS loans given out (outstanding only — paid loans money came back)
    // MINUS total expenses spent
    const walletBalance     = Math.max(0, totalSavings - outstanding - totalExp);

    document.getElementById('dash-cards').innerHTML = [
      { label:'Total Savings',       val: ugx(totalSavings),  icon:'💰', color:'c-green',  sub:'All rider deposits',      click:"goTo('savings')" },
      { label:'Active Riders',       val: activeRiders,        icon:'👥', color:'c-blue',   sub:`${ALL_RIDERS.length} total registered`, click:"goTo('riders')" },
      { label:'Outstanding Loans',   val: ugx(outstanding),    icon:'🏦', color:'c-red',    sub:`${activeLoans} active loans`, click:"goTo('loans')" },
      { label:'Collected Today',     val: ugx(todayDeps),      icon:'📅', color:'c-teal',   sub:'Deposits today',          click:"goTo('collections')" },
      { label:'Monthly Collections', val: ugx(monthlyDeps),    icon:'📊', color:'c-purple', sub:'This month total',        click:"goTo('reports')" },
      { label:'Total Expenses',      val: ugx(totalExp),       icon:'💸', color:'c-gold',   sub:'All SACCO expenses',      click:"goTo('expenses')" },
      { label:'Wallet Balance',      val: ugx(walletBalance),  icon:'👛', color:'c-green',  sub:'Available cash',          click:"goTo('wallet')" },
      { label:'Loan Defaulters',     val: overdueLoans,        icon:'⚠️', color:'c-red',    sub:'Overdue loans',           click:"goTo('alerts')" },
      { label:'Pending Loans',       val: pendingLoans,        icon:'⏳', color:'c-gold',   sub:'Awaiting approval',       click:"goTo('loans')" },
    ].map(s => `
      <div class="stat-card ${s.color}" onclick="${s.click}">
        <div class="sc-top"><div class="sc-label">${s.label}</div><div class="sc-icon">${s.icon}</div></div>
        <div class="sc-val">${s.val}</div>
        <div class="sc-sub">${s.sub}</div>
      </div>`).join('');

    // Health indicators
    const repayRate   = totalLoaned > 0 ? Math.round((totalRepaid / totalLoaned) * 100) : 100;
    const savingsRate = ALL_RIDERS.length > 0 ? Math.round((activeRiders / ALL_RIDERS.length) * 100) : 0;
    const defaultRate = ALL_LOANS.length > 0 ? Math.round((overdueLoans / ALL_LOANS.length) * 100) : 0;

    document.getElementById('health-bars').innerHTML = [
      { label:'Loan Repayment Rate', val:repayRate, color:'#1a6b3c' },
      { label:'Active Member Rate',  val:savingsRate, color:'#1a4fa0' },
      { label:'Default Rate (lower is better)', val:Math.min(defaultRate,100), color:defaultRate > 20 ? '#c0392b' : '#c47f17' },
    ].map(h => `
      <div class="hb-item">
        <div class="hb-label"><span>${h.label}</span><span style="font-weight:700;color:${h.color}">${h.val}%</span></div>
        <div class="hb-bar"><div class="hb-fill" style="width:${h.val}%;background:${h.color}"></div></div>
      </div>`).join('');

    // Charts
    drawBarChart('savingsChart', d.savingsTrend || [], '#1a6b3c');
    drawLoanChart();
    updateAlertCount();

  } catch(err) { console.error('Dashboard error:', err); }
}

// ============================================================
// CHARTS
// ============================================================
function drawBarChart(canvasId, trend, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w   = canvas.offsetWidth || 400;
  const h   = 190;
  canvas.width  = w; canvas.height = h;
  if (!trend.length) return;
  const max = Math.max(...trend.map(t => t.total), 1);
  const bw  = (w - 48) / trend.length;
  ctx.clearRect(0, 0, w, h);
  trend.forEach((t, i) => {
    const barH = t.total > 0 ? Math.max((t.total / max) * (h - 44), 4) : 4;
    const x    = 24 + i * bw + bw * 0.15;
    const y    = h - 28 - barH;
    const bww  = bw * 0.7;
    const grad = ctx.createLinearGradient(0, y, 0, y + barH);
    grad.addColorStop(0, t.total > 0 ? color : '#e2e8e2');
    grad.addColorStop(1, t.total > 0 ? color + 'aa' : '#f0f2ee');
    ctx.fillStyle = grad;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, bww, barH, [4,4,0,0]);
    else ctx.rect(x, y, bww, barH);
    ctx.fill();
    ctx.fillStyle = '#6b7a6a'; ctx.font = '11px Outfit,sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(t.label, x + bww/2, h - 10);
    if (t.total > 0) { ctx.fillStyle = color; ctx.font = 'bold 10px Outfit,sans-serif'; ctx.fillText(Number(t.total).toLocaleString(), x + bww/2, y - 4); }
  });
}

function drawLoanChart() {
  const active  = ALL_LOANS.filter(l => l.status === 'active').length;
  const overdue = ALL_LOANS.filter(l => l.status === 'overdue').length;
  const paid    = ALL_LOANS.filter(l => l.status === 'paid').length;
  const pending = ALL_LOANS.filter(l => l.status === 'pending').length;
  const canvas  = document.getElementById('loanChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w   = canvas.offsetWidth || 400; const h = 190;
  canvas.width = w; canvas.height = h;
  const data   = [{ label:'Active', val:active, color:'#1a4fa0' }, { label:'Overdue', val:overdue, color:'#c0392b' }, { label:'Paid', val:paid, color:'#1a6b3c' }, { label:'Pending', val:pending, color:'#c47f17' }];
  const max    = Math.max(...data.map(d => d.val), 1);
  const bw     = (w - 48) / data.length;
  ctx.clearRect(0, 0, w, h);
  data.forEach((d, i) => {
    const barH = d.val > 0 ? Math.max((d.val / max) * (h - 44), 4) : 4;
    const x    = 24 + i * bw + bw * 0.15; const y = h - 28 - barH; const bww = bw * 0.7;
    ctx.fillStyle = d.val > 0 ? d.color : '#e2e8e2';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, bww, barH, [4,4,0,0]);
    else ctx.rect(x, y, bww, barH);
    ctx.fill();
    ctx.fillStyle = '#6b7a6a'; ctx.font = '11px Outfit,sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(d.label, x + bww/2, h - 10);
    if (d.val > 0) { ctx.fillStyle = d.color; ctx.font = 'bold 11px Outfit,sans-serif'; ctx.fillText(d.val, x + bww/2, y - 4); }
  });
}

function switchChartTab(type, period, btn) {
  document.querySelectorAll('.ctab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  // Rebuild trend based on period
  const n = new Date();
  let trend = [];
  if (period === 'daily') {
    for (let i = 6; i >= 0; i--) {
      const d = new Date(n); d.setDate(d.getDate() - i);
      const total = ALL_SAVINGS.filter(s => !s.reversed && new Date(s.date).toDateString() === d.toDateString()).reduce((sum, s) => sum + s.amount, 0);
      trend.push({ label: d.toLocaleDateString('en-UG', { weekday:'short' }), total });
    }
  } else if (period === 'weekly') {
    for (let i = 3; i >= 0; i--) {
      const start = new Date(n); start.setDate(start.getDate() - (i+1)*7);
      const end   = new Date(n); end.setDate(end.getDate() - i*7);
      const total = ALL_SAVINGS.filter(s => !s.reversed && new Date(s.date) >= start && new Date(s.date) < end).reduce((sum, s) => sum + s.amount, 0);
      trend.push({ label: 'W-' + (i+1), total });
    }
  } else {
    for (let i = 5; i >= 0; i--) {
      const d = new Date(n); d.setMonth(d.getMonth() - i);
      const total = ALL_SAVINGS.filter(s => { const sd = new Date(s.date); return !s.reversed && sd.getMonth() === d.getMonth() && sd.getFullYear() === d.getFullYear(); }).reduce((sum, s) => sum + s.amount, 0);
      trend.push({ label: d.toLocaleDateString('en-UG', { month:'short' }), total });
    }
  }
  drawBarChart('savingsChart', trend, '#1a6b3c');
}

// ============================================================
// ALERTS
// ============================================================
function updateAlertCount() {
  const overdue  = ALL_LOANS.filter(l => l.status === 'overdue').length;
  const pending  = ALL_LOANS.filter(l => l.status === 'pending').length;
  const pendingDeps = 0; // from server
  const total    = overdue + pending;
  const badge    = document.getElementById('alert-count');
  if (badge) { badge.textContent = total; badge.style.display = total > 0 ? 'inline' : 'none'; }
}

async function loadAlerts() {
  const el = document.getElementById('alerts-list');
  el.innerHTML = '<p class="empty-state">⏳ Loading alerts...</p>';

  try {
    // Always fetch fresh data from server
    const [riders, loans] = await Promise.all([
      api('/api/riders'),
      api('/api/loans')
    ]);

    // Update global variables too
    ALL_RIDERS = riders;
    ALL_LOANS  = loans;

    const alerts = [];

    // Overdue loans
    loans.filter(l => l.status === 'overdue').forEach(l => {
      const rider = riders.find(r => r.id === l.riderId);
      alerts.push({ type:'urgent', icon:'🚨',
        title: `Loan overdue — ${rider?.name || 'Unknown'}`,
        sub:   `UGX ${Number(l.amount).toLocaleString()} overdue. Penalty has been added.`,
        actions: `
          <button class="btn-sm btn-view" onclick="viewRiderProfile('${l.riderId}')">👤 View Rider</button>
          <button class="btn-sm btn-warn" onclick="sendReminderSMS('${rider?.phone || ''}','${rider?.name || ''}')">📱 Send Reminder</button>
          <button class="btn-sm btn-approve" onclick="openRepayModal('${l.id}',${l.remaining||0})">✅ Record Payment</button>`
      });
    });

    // Pending loan approvals
    loans.filter(l => l.status === 'pending').forEach(l => {
      const rider = riders.find(r => r.id === l.riderId);
      alerts.push({ type:'warning', icon:'⏳',
        title: `Loan request pending — ${rider?.name || 'Unknown'}`,
        sub:   `UGX ${Number(l.amount).toLocaleString()} is waiting for your approval.`,
        actions: `
          <button class="btn-sm btn-approve" onclick="approveLoan('${l.id}')">✅ Approve</button>
          <button class="btn-sm btn-reject" onclick="rejectLoan('${l.id}')">❌ Reject</button>
          <button class="btn-sm btn-view" onclick="viewRiderProfile('${l.riderId}')">👤 View Rider</button>`
      });
    });

    // Pending rider approvals — fetched fresh
    riders.filter(r => r.status === 'pending').forEach(r => {
      alerts.push({ type:'info', icon:'👤',
        title: `New rider registration — ${r.name}`,
        sub:   `Phone: ${r.phone} · Stage: ${r.stage || '—'} · Waiting for your approval`,
        actions: `
          <button class="btn-sm btn-approve" onclick="setRiderStatus('${r.id}','approved');loadAlerts()">✅ Approve</button>
          <button class="btn-sm btn-reject" onclick="setRiderStatus('${r.id}','rejected');loadAlerts()">❌ Reject</button>
          <button class="btn-sm btn-view" onclick="viewRiderProfile('${r.id}')">👤 View Profile</button>`
      });
    });

    // Update alert badge count
    const badge = document.getElementById('alert-count');
    if (badge) {
      badge.textContent  = alerts.length;
      badge.style.display = alerts.length > 0 ? 'inline' : 'none';
    }

    if (!alerts.length) {
      el.innerHTML = `
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);padding:40px;text-align:center;box-shadow:var(--shadow)">
          <div style="font-size:2rem;margin-bottom:10px">✅</div>
          <div style="font-weight:700;margin-bottom:4px">All clear!</div>
          <div style="color:var(--muted);font-size:0.88rem">No urgent actions at the moment. Everything is running smoothly.</div>
        </div>`;
      return;
    }

    el.innerHTML = alerts.map(a => `
      <div class="alert-item ${a.type}">
        <div class="ai-icon">${a.icon}</div>
        <div class="ai-content">
          <div class="ai-title">${a.title}</div>
          <div class="ai-sub">${a.sub}</div>
          <div class="ai-actions">${a.actions}</div>
        </div>
      </div>`).join('');

  } catch(err) {
    el.innerHTML = `<p class="empty-state" style="color:var(--red)">❌ Failed to load alerts. Please refresh.</p>`;
    console.error('loadAlerts error:', err);
  }
}

// ============================================================
// SAVINGS
// ============================================================
async function loadSavings() {
  try {
    const search = document.getElementById('sav-search')?.value?.toLowerCase() || '';
    const from   = document.getElementById('sav-from')?.value || '';
    const to     = document.getElementById('sav-to')?.value || '';
    const method = document.getElementById('sav-method')?.value || '';

    let url = '/api/savings?';
    if (from) url += `from=${from}&`;
    if (to)   url += `to=${to}&`;
    ALL_SAVINGS = await api(url);

    let filtered = ALL_SAVINGS;
    if (search) filtered = filtered.filter(s => (s.riderName||'').toLowerCase().includes(search) || (s.riderPhone||'').includes(search));
    if (method) filtered = filtered.filter(s => s.method === method);

    const total = filtered.filter(s => !s.reversed).reduce((sum, s) => sum + s.amount, 0);
    const today = new Date().toDateString();
    const todayTotal = filtered.filter(s => !s.reversed && new Date(s.date).toDateString() === today).reduce((sum, s) => sum + s.amount, 0);
    const thisMonth = new Date(); thisMonth.setDate(1); thisMonth.setHours(0,0,0,0);
    const monthTotal = filtered.filter(s => !s.reversed && new Date(s.date) >= thisMonth).reduce((sum, s) => sum + s.amount, 0);

    document.getElementById('savings-summary').innerHTML = `
      <div class="ss-item"><div class="ss-val">${ugx(total)}</div><div class="ss-lbl">Total Savings</div></div>
      <div class="ss-item"><div class="ss-val">${ugx(todayTotal)}</div><div class="ss-lbl">Today</div></div>
      <div class="ss-item"><div class="ss-val">${ugx(monthTotal)}</div><div class="ss-lbl">This Month</div></div>
      <div class="ss-item"><div class="ss-val">${filtered.filter(s=>!s.reversed).length}</div><div class="ss-lbl">Deposits</div></div>`;

    const el = document.getElementById('savings-table');
    el.innerHTML = filtered.length === 0 ? '<p class="empty-state">No deposits found.</p>' :
      `<table class="dtable"><thead><tr><th>Date</th><th>Rider</th><th>Phone</th><th>Amount</th><th>Method</th><th>Reference</th><th>Status</th><th>Action</th></tr></thead>
      <tbody>${filtered.map(s => `<tr style="${s.reversed?'opacity:0.5':''}">
        <td>${dt(s.date)}</td>
        <td><strong>${s.riderName||'—'}</strong></td>
        <td>${s.riderPhone||'—'}</td>
        <td style="color:var(--green);font-weight:700">${ugx(s.amount)}</td>
        <td>${badge(s.method||'cash')}</td>
        <td style="font-size:0.75rem;color:var(--muted)">${s.reference||'—'}</td>
        <td>${s.reversed?'<span style="color:var(--red)">Reversed</span>':'<span style="color:var(--green)">✓ OK</span>'}</td>
        <td>${!s.reversed && ADMIN?.role==='superadmin' ? `<button class="btn-sm btn-reject" onclick="reverseDeposit('${s.id}')">↩ Reverse</button>` : '—'}</td>
      </tr>`).join('')}</tbody></table>`;

    // Pending cash requests
    loadDepositRequests();
  } catch(err) { console.error(err); }
}

async function loadDepositRequests() {
  try {
    const requests = await api('/api/deposit-requests');
    const el = document.getElementById('deposit-requests-panel');
    const pending = requests.filter(r => r.status === 'pending');
    el.innerHTML = pending.length === 0 ? '<p class="empty-state">No pending cash deposit requests.</p>' :
      `<table class="dtable"><thead><tr><th>Date</th><th>Rider</th><th>Amount</th><th>Action</th></tr></thead>
      <tbody>${pending.map(r => `<tr>
        <td>${dt(r.createdAt)}</td>
        <td><strong>${r.riderName}</strong> · ${r.riderPhone}</td>
        <td style="color:var(--green);font-weight:700">${ugx(r.amount)}</td>
        <td style="display:flex;gap:6px">
          <button class="btn-sm btn-approve" onclick="confirmDeposit('${r.id}')">✅ Confirm Cash Received</button>
          <button class="btn-sm btn-reject" onclick="rejectDeposit('${r.id}')">❌ Reject</button>
        </td>
      </tr>`).join('')}</tbody></table>`;
  } catch(err) { console.error(err); }
}

async function recordDeposit() {
  const riderId = document.getElementById('dep-rider').value;
  const amount  = document.getElementById('dep-amount').value;
  const ref     = document.getElementById('dep-ref').value;
  if (!riderId || !amount) return showMsg('dep-msg', 'Select rider and enter amount.', 'error');
  try {
    showMsg('dep-msg', '⏳ Recording...', 'info');
    await api('/api/savings', 'POST', { riderId, amount, method:'cash', reference: ref });
    showMsg('dep-msg', '✅ Deposit recorded!', 'success');
    document.getElementById('dep-amount').value = '';
    await loadAllData(); loadSavings();
    setTimeout(() => closeModal('modal-deposit'), 1500);
  } catch(err) { showMsg('dep-msg', '❌ ' + err.message, 'error'); }
}

function selMMNet(net) {
  SEL_MM_NET = net;
  document.querySelectorAll('.mm-net').forEach(el => el.classList.remove('active'));
  document.getElementById('mmt-' + net).classList.add('active');
}

async function mmDepositAdmin() {
  const riderId = document.getElementById('mm-dep-rider').value;
  const phone   = document.getElementById('mm-dep-phone').value;
  const amount  = document.getElementById('mm-dep-amount').value;
  if (!riderId || !phone || !amount) return showMsg('mm-dep-msg', 'Fill all fields.', 'error');
  try {
    showMsg('mm-dep-msg', '⏳ Sending payment request...', 'info');
    await api('/api/savings/mobilemoney', 'POST', { riderId, amount, phone, network: SEL_MM_NET });
    showMsg('mm-dep-msg', '✅ Payment request sent!', 'success');
    await loadAllData(); loadSavings();
    setTimeout(() => closeModal('modal-mm-deposit'), 1500);
  } catch(err) { showMsg('mm-dep-msg', '❌ ' + err.message, 'error'); }
}

async function confirmDeposit(id) {
  try { await api(`/api/deposit-requests/${id}/confirm`, 'PUT'); await loadAllData(); loadSavings(); } catch(err) { alert(err.message); }
}
async function rejectDeposit(id) {
  try { await api(`/api/deposit-requests/${id}/reject`, 'PUT'); loadSavings(); } catch(err) { alert(err.message); }
}
async function reverseDeposit(id) {
  if (!confirm('Reverse this deposit? This cannot be undone.')) return;
  try { await api(`/api/savings/${id}/reverse`, 'PUT'); await loadAllData(); loadSavings(); } catch(err) { alert(err.message); }
}

// ============================================================
// LOANS
// ============================================================
async function loadLoans() {
  try {
    const url = LOAN_FILTER === 'all' ? '/api/loans' : `/api/loans?status=${LOAN_FILTER}`;
    ALL_LOANS = await api(url);

    const totalActive  = ALL_LOANS.filter(l => l.status==='active').length;
    const totalOverdue = ALL_LOANS.filter(l => l.status==='overdue').length;
    const totalAmt     = ALL_LOANS.reduce((sum, l) => sum + l.amount, 0);
    const outstanding  = ALL_LOANS.filter(l => ['active','overdue'].includes(l.status)).reduce((sum, l) => sum + (l.remaining||l.amount), 0);

    document.getElementById('loan-summary').innerHTML = `
      <div class="ss-item"><div class="ss-val">${ALL_LOANS.length}</div><div class="ss-lbl">Total Loans</div></div>
      <div class="ss-item"><div class="ss-val">${ugx(totalAmt)}</div><div class="ss-lbl">Total Issued</div></div>
      <div class="ss-item"><div class="ss-val">${ugx(outstanding)}</div><div class="ss-lbl">Outstanding</div></div>
      <div class="ss-item"><div class="ss-val" style="color:var(--red)">${totalOverdue}</div><div class="ss-lbl">Overdue</div></div>`;

    const el = document.getElementById('loans-table');
    el.innerHTML = ALL_LOANS.length === 0 ? '<p class="empty-state">No loans found.</p>' :
      `<table class="dtable"><thead><tr><th>Date</th><th>Rider</th><th>Amount</th><th>Interest</th><th>Total</th><th>Paid</th><th>Remaining</th><th>Due</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${ALL_LOANS.map(l => `<tr>
        <td>${dt(l.createdAt)}</td>
        <td><strong>${l.riderName||'—'}</strong><br/><span style="font-size:0.75rem;color:var(--muted)">${l.riderPhone||''}</span></td>
        <td>${ugx(l.amount)}</td>
        <td>${l.interestRate}%</td>
        <td>${ugx(l.totalRepayable)}</td>
        <td style="color:var(--green);font-weight:600">${ugx(l.totalPaid||0)}</td>
        <td style="color:${(l.remaining||0)>0?'var(--red)':'var(--green)'};font-weight:600">${ugx(l.remaining||0)}</td>
        <td style="font-size:0.78rem;color:${new Date(l.dueDate)<new Date()?'var(--red)':'var(--muted)'}">${dt(l.dueDate)}</td>
        <td>${badge(l.status)}</td>
        <td style="display:flex;gap:4px;flex-wrap:wrap">
          ${l.status==='pending' ? `<button class="btn-sm btn-approve" onclick="approveLoan('${l.id}')">✅</button><button class="btn-sm btn-reject" onclick="rejectLoan('${l.id}')">❌</button>` : ''}
          ${['active','overdue'].includes(l.status) ? `<button class="btn-sm btn-view" onclick="openRepayModal('${l.id}',${l.remaining||0})">💳 Repay</button>` : ''}
          <button class="btn-sm btn-warn" onclick="viewRiderProfile('${l.riderId}')">👤</button>
        </td>
      </tr>`).join('')}</tbody></table>`;
  } catch(err) { console.error(err); }
}

function switchLoanTab(status, btn) {
  LOAN_FILTER = status;
  document.querySelectorAll('.tstab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadLoans();
}

function previewLoan() {
  const amount   = parseFloat(document.getElementById('loan-amount').value || 0);
  const rate     = parseFloat(document.getElementById('loan-interest').value || 10);
  const months   = parseInt(document.getElementById('loan-months').value || 3);
  const interest = amount * rate / 100;
  const total    = amount + interest;
  const monthly  = total / months;
  const prev     = document.getElementById('loan-preview-box');
  if (amount <= 0) { prev.style.display = 'none'; return; }
  prev.style.display = 'block';
  prev.innerHTML = `<strong>Loan Amount:</strong> ${ugx(amount)}<br/><strong>Interest (${rate}%):</strong> ${ugx(interest)}<br/><strong>Total Repayable:</strong> ${ugx(total)}<br/><strong>Monthly Payment:</strong> ${ugx(Math.ceil(monthly))} × ${months} months`;
}

async function createLoan() {
  const riderId  = document.getElementById('loan-rider').value;
  const amount   = document.getElementById('loan-amount').value;
  const interest = document.getElementById('loan-interest').value;
  const months   = document.getElementById('loan-months').value;
  if (!riderId || !amount) return showMsg('loan-create-msg', 'Select rider and enter amount.', 'error');
  try {
    showMsg('loan-create-msg', '⏳ Creating loan...', 'info');
    await api('/api/loans', 'POST', { riderId, amount, interestRate: interest, repaymentMonths: months });
    showMsg('loan-create-msg', '✅ Loan request created!', 'success');
    await loadAllData(); loadLoans();
    setTimeout(() => closeModal('modal-loan-create'), 1500);
  } catch(err) { showMsg('loan-create-msg', '❌ ' + err.message, 'error'); }
}

async function approveLoan(id) {
  try { await api(`/api/loans/${id}/approve`, 'PUT'); await loadAllData(); loadLoans(); loadAlerts(); } catch(err) { alert(err.message); }
}
async function rejectLoan(id) {
  if (!confirm('Reject this loan?')) return;
  try { await api(`/api/loans/${id}/reject`, 'PUT'); await loadAllData(); loadLoans(); loadAlerts(); } catch(err) { alert(err.message); }
}

function openRepayModal(loanId, remaining) {
  SEL_LOAN = loanId;
  document.getElementById('repay-info').innerHTML = `<strong>Remaining Balance:</strong> ${ugx(remaining)}`;
  document.getElementById('repay-amount').value = '';
  openModal('modal-repay');
}

async function submitRepayment() {
  const amount = document.getElementById('repay-amount').value;
  if (!amount) return showMsg('repay-msg', 'Enter amount.', 'error');
  try {
    showMsg('repay-msg', '⏳ Recording...', 'info');
    const data = await api(`/api/loans/${SEL_LOAN}/repay`, 'POST', { amount });
    showMsg('repay-msg', `✅ Repayment recorded! Remaining: ${ugx(data.remaining)}`, 'success');
    await loadAllData(); loadLoans();
    setTimeout(() => closeModal('modal-repay'), 1500);
  } catch(err) { showMsg('repay-msg', '❌ ' + err.message, 'error'); }
}

// ============================================================
// COLLECTIONS
// ============================================================
async function loadCollections() {
  // Always fetch fresh data
  try {
    [ALL_SAVINGS, ALL_RIDERS] = await Promise.all([
      api('/api/savings'),
      api('/api/riders')
    ]);
  } catch(e) { console.error(e); }

  const today    = new Date().toDateString();
  const weekAgo  = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(); monthAgo.setDate(1); monthAgo.setHours(0,0,0,0);

  const todayDeps   = ALL_SAVINGS.filter(s => !s.reversed && new Date(s.date).toDateString() === today);
  const weekDeps    = ALL_SAVINGS.filter(s => !s.reversed && new Date(s.date) >= weekAgo);
  const monthDeps   = ALL_SAVINGS.filter(s => !s.reversed && new Date(s.date) >= monthAgo);
  const approvedRiders = ALL_RIDERS.filter(r => r.status === 'approved');
  const paidTodayIds   = new Set(todayDeps.map(s => s.riderId));
  const missingRiders  = approvedRiders.filter(r => !paidTodayIds.has(r.id));

  document.getElementById('coll-paid-num').textContent   = todayDeps.length;
  document.getElementById('coll-paid-amt').textContent   = ugx(todayDeps.reduce((s,d)=>s+d.amount,0));
  document.getElementById('coll-missing-num').textContent = missingRiders.length;
  document.getElementById('coll-missing-amt').textContent = `${missingRiders.length} riders not paid`;
  document.getElementById('coll-week-num').textContent   = ugx(weekDeps.reduce((s,d)=>s+d.amount,0));
  document.getElementById('coll-month-num').textContent  = ugx(monthDeps.reduce((s,d)=>s+d.amount,0));

  const el = document.getElementById('collections-table');
  el.innerHTML = `<table class="dtable"><thead><tr><th>Rider</th><th>Phone</th><th>Status</th><th>Amount Today</th><th>Action</th></tr></thead>
    <tbody>${approvedRiders.map(r => {
      const paid    = todayDeps.filter(d => d.riderId === r.id).reduce((s,d)=>s+d.amount,0);
      const hasPaid = paidTodayIds.has(r.id);
      return `<tr>
        <td><strong>${r.name}</strong></td>
        <td>${r.phone}</td>
        <td>${hasPaid ? '<span style="color:var(--green);font-weight:700">✅ Paid</span>' : '<span style="color:var(--red);font-weight:700">❌ Not Paid</span>'}</td>
        <td>${hasPaid ? `<span style="color:var(--green);font-weight:700">${ugx(paid)}</span>` : '—'}</td>
        <td>${!hasPaid ? `<button class="btn-sm btn-warn" onclick="sendReminderSMS('${r.phone}','${r.name}')">📱 Remind</button>` : ''}</td>
      </tr>`;
    }).join('')}</tbody></table>`;
}

// ============================================================
// WALLET
// ============================================================
async function loadWallet() {
  // Fetch ALL fresh data from server
  try {
    [ALL_SAVINGS, ALL_LOANS, ALL_EXPENSES] = await Promise.all([
      api('/api/savings'),
      api('/api/loans'),
      api('/api/expenses')
    ]);
  } catch(e) { console.error(e); }

  const totalSavings  = ALL_SAVINGS.filter(s => !s.reversed).reduce((sum, s) => sum + s.amount, 0);
  const totalLoaned   = ALL_LOANS.filter(l => ['active','overdue'].includes(l.status)).reduce((sum, l) => sum + l.amount, 0);
  const totalRepaid   = ALL_LOANS.reduce((sum, l) => {
    // Add up all repayments from the repayments table
    return sum;
  }, 0);
  const totalExp      = ALL_EXPENSES.reduce((sum, e) => sum + e.amount, 0);
  // Correct balance: savings minus active loans minus expenses
  const balance       = Math.max(0, totalSavings - totalLoaned - totalExp);

  document.getElementById('wallet-balance').textContent = ugx(Math.max(balance, 0));
  document.getElementById('wallet-in').textContent      = ugx(totalSavings);
  document.getElementById('wallet-out').textContent     = ugx(totalLoaned + totalExp);
  document.getElementById('wallet-exp').textContent     = ugx(totalExp);
  document.getElementById('wallet-rep').textContent     = ugx(totalRepaid);

  // Transaction history
  const history = [
    ...ALL_SAVINGS.filter(s => !s.reversed).map(s => ({ date:s.date, type:'deposit', desc:`Deposit — ${s.riderName||'—'}`, amount:s.amount, in:true })),
    ...ALL_EXPENSES.map(e => ({ date:e.date, type:'expense', desc:`${e.category} — ${e.paidTo||''}`, amount:e.amount, in:false }))
  ].sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 50);

  const el = document.getElementById('wallet-history');
  el.innerHTML = history.length === 0 ? '<p class="empty-state">No transactions yet.</p>' :
    `<table class="dtable"><thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Amount</th></tr></thead>
    <tbody>${history.map(t => `<tr>
      <td>${dt(t.date)}</td>
      <td>${t.in ? '<span style="color:var(--green)">📥 IN</span>' : '<span style="color:var(--red)">📤 OUT</span>'}</td>
      <td>${t.desc}</td>
      <td style="font-weight:700;color:${t.in?'var(--green)':'var(--red)'}">${t.in?'+':'−'}${ugx(t.amount)}</td>
    </tr>`).join('')}</tbody></table>`;
}

// ============================================================
// RIDERS
// ============================================================
async function loadRiders() {
  try {
    const search = document.getElementById('rider-search')?.value || '';
    const status = document.getElementById('rider-status')?.value || '';
    let url = '/api/riders?';
    if (search) url += `search=${encodeURIComponent(search)}&`;
    if (status) url += `status=${status}&`;
    ALL_RIDERS = await api(url);

    // Show pending riders at the top as urgent notice
    const pending = ALL_RIDERS.filter(r => r.status === 'pending');
    const el = document.getElementById('riders-table');

    let pendingHtml = '';
    if (pending.length > 0) {
      pendingHtml = `
        <div style="background:#fef3cd;border:1px solid #f0d080;border-radius:var(--rl);padding:14px 18px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
          <div>
            <div style="font-weight:700;color:#7a4f0f">⏳ ${pending.length} Rider${pending.length>1?'s':''} Waiting for Approval</div>
            <div style="font-size:0.82rem;color:#7a4f0f;margin-top:3px">These riders have registered and are waiting for you to approve them</div>
          </div>
          <button class="btn-primary" onclick="document.getElementById('rider-status').value='pending';loadRiders()">View Pending →</button>
        </div>`;
    }

    el.innerHTML = pendingHtml + (ALL_RIDERS.length === 0 ? '<p class="empty-state">No riders found. Add riders using the ➕ Add Rider button above.</p>' :
      `<table class="dtable"><thead><tr><th>#</th><th>Name</th><th>Phone</th><th>Stage</th><th>Savings</th><th>Loan</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${ALL_RIDERS.map((r,i) => `<tr style="${r.status==='pending'?'background:#fffbeb':''}">
        <td>${i+1}</td>
        <td><strong>${r.name}</strong></td>
        <td>${r.phone}</td>
        <td>${r.stage||'—'}</td>
        <td style="color:var(--green);font-weight:600">${ugx(r.totalSavings||0)}</td>
        <td>${r.activeLoan ? `<span style="color:var(--gold);font-weight:600">${ugx(r.activeLoan.amount)}</span>` : '—'}</td>
        <td>${badge(r.status)}</td>
        <td style="display:flex;gap:4px;flex-wrap:wrap">
          <button class="btn-sm btn-view" onclick="viewRiderProfile('${r.id}')">👤 View</button>
          ${r.status==='pending'?`<button class="btn-sm btn-approve" onclick="setRiderStatus('${r.id}','approved')">✅ Approve</button><button class="btn-sm btn-reject" onclick="setRiderStatus('${r.id}','rejected')">❌ Reject</button>`:''}
          ${r.status==='approved'?`<button class="btn-sm btn-reject" onclick="setRiderStatus('${r.id}','suspended')">⏸ Suspend</button>`:''}
          ${r.status==='suspended'?`<button class="btn-sm btn-approve" onclick="setRiderStatus('${r.id}','approved')">▶ Restore</button>`:''}
        </td>
      </tr>`).join('')}</tbody></table>`);
  } catch(err) { console.error(err); }
}

async function addRider() {
  const name = document.getElementById('r-name').value.trim();
  const phone = document.getElementById('r-phone').value.trim();
  const stage = document.getElementById('r-stage').value.trim();
  const nid   = document.getElementById('r-nid').value.trim();
  const pin   = document.getElementById('r-pin').value.trim();
  if (!name || !phone) return showMsg('rider-msg', 'Name and phone required.', 'error');
  try {
    showMsg('rider-msg', '⏳ Registering...', 'info');
    await api('/api/riders', 'POST', { name, phone, stage, nationalId: nid, pin: pin || '1234' });
    showMsg('rider-msg', '✅ Rider registered!', 'success');
    ['r-name','r-phone','r-stage','r-nid','r-pin'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
    await loadAllData(); loadRiders();
    setTimeout(() => closeModal('modal-add-rider'), 1500);
  } catch(err) { showMsg('rider-msg', '❌ ' + err.message, 'error'); }
}

async function setRiderStatus(id, status) {
  try { await api(`/api/riders/${id}/status`, 'PUT', { status }); await loadAllData(); loadRiders(); loadAlerts(); } catch(err) { alert(err.message); }
}

async function viewRiderProfile(id) {
  try {
    const r = await api(`/api/riders/${id}`);
    document.getElementById('rider-profile-body').innerHTML = `
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px;padding-bottom:16px;border-bottom:1px solid var(--border)">
        <div style="width:52px;height:52px;background:linear-gradient(135deg,var(--green),var(--green2));border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.3rem;font-weight:800;color:#fff">${r.name.charAt(0)}</div>
        <div><div style="font-weight:800;font-size:1.1rem">${r.name}</div><div style="color:var(--muted);font-size:0.85rem">${r.phone} · ${r.stage||'—'}</div><div style="margin-top:4px">${badge(r.status)}</div></div>
      </div>
      <div class="profile-row">
        <div class="prof-stat"><div class="prof-val">${ugx(r.totalSavings||0)}</div><div class="prof-lbl">Total Savings</div></div>
        <div class="prof-stat"><div class="prof-val">${r.loans?.length||0}</div><div class="prof-lbl">Total Loans</div></div>
        <div class="prof-stat"><div class="prof-val">${r.savings?.length||0}</div><div class="prof-lbl">Deposits</div></div>
      </div>
      ${r.insights?.length ? '<div style="margin-bottom:12px">' + r.insights.map(ins=>`<div style="padding:9px 12px;border-radius:8px;margin-bottom:6px;font-size:0.85rem;background:${ins.type==='positive'?'#d4edda':ins.type==='warning'?'#fef3cd':'#fde8e6'};color:${ins.type==='positive'?'var(--green)':ins.type==='warning'?'var(--gold)':'var(--red)'}">💡 ${ins.text}</div>`).join('') + '</div>' : ''}
      <div style="font-weight:700;font-size:0.88rem;margin-bottom:8px">Last 5 Deposits</div>
      ${!r.savings?.length ? '<p class="empty-state">No deposits yet.</p>' : `<table class="dtable"><thead><tr><th>Date</th><th>Amount</th><th>Method</th></tr></thead><tbody>${[...r.savings].reverse().slice(0,5).map(s=>`<tr><td>${dt(s.date)}</td><td style="color:var(--green);font-weight:600">${ugx(s.amount)}</td><td>${badge(s.method||'cash')}</td></tr>`).join('')}</tbody></table>`}
      <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
        ${r.status==='pending'?`<button class="btn-primary" onclick="setRiderStatus('${r.id}','approved');closeModal('modal-rider-profile')">✅ Approve</button>`:''}
        <button class="btn-outline" onclick="sendReminderSMS('${r.phone}','${r.name}')">📱 Send Reminder</button>
        <button class="btn-outline" onclick="closeModal('modal-rider-profile')">Close</button>
      </div>`;
    openModal('modal-rider-profile');
  } catch(err) { console.error(err); }
}

// ============================================================
// EXPENSES
// ============================================================
function loadExpenses() {
  const catIcons = { rent:'🏠', fuel:'⛽', salary:'👷', internet:'🌐', electricity:'💡', water:'💧', repair:'🔧', emergency:'🚨', stage:'🏍️', other:'📦' };
  const catTotals = {};
  ALL_EXPENSES.forEach(e => { catTotals[e.category] = (catTotals[e.category]||0) + e.amount; });

  document.getElementById('expense-summary').innerHTML = `
    <div class="ss-item"><div class="ss-val" style="color:var(--red)">${ugx(ALL_EXPENSES.reduce((s,e)=>s+e.amount,0))}</div><div class="ss-lbl">Total Expenses</div></div>
    <div class="ss-item"><div class="ss-val">${ALL_EXPENSES.length}</div><div class="ss-lbl">Transactions</div></div>
    <div class="ss-item"><div class="ss-val">${ugx(ALL_EXPENSES.filter(e=>{const d=new Date();d.setDate(1);return new Date(e.date)>=d}).reduce((s,e)=>s+e.amount,0))}</div><div class="ss-lbl">This Month</div></div>
    <div class="ss-item"><div class="ss-val">${ugx(ALL_EXPENSES.filter(e=>new Date(e.date).toDateString()===new Date().toDateString()).reduce((s,e)=>s+e.amount,0))}</div><div class="ss-lbl">Today</div></div>`;

  document.getElementById('expense-cats').innerHTML = Object.entries(catTotals).map(([cat,amt]) =>
    `<div class="exp-cat"><div class="exp-cat-icon">${catIcons[cat]||'📦'}</div><div class="exp-cat-name">${cat}</div><div class="exp-cat-amt">${ugx(amt)}</div></div>`
  ).join('');

  const el = document.getElementById('expenses-table');
  el.innerHTML = ALL_EXPENSES.length === 0 ? '<p class="empty-state">No expenses recorded yet.</p>' :
    `<table class="dtable"><thead><tr><th>Date</th><th>Category</th><th>Paid To</th><th>Amount</th><th>Method</th><th>Description</th><th>Receipt</th></tr></thead>
    <tbody>${[...ALL_EXPENSES].reverse().map(e=>`<tr>
      <td>${dt(e.date)}</td>
      <td>${catIcons[e.category]||'📦'} ${e.category}</td>
      <td>${e.paidTo||'—'}</td>
      <td style="color:var(--red);font-weight:700">${ugx(e.amount)}</td>
      <td>${badge(e.method||'cash')}</td>
      <td style="font-size:0.8rem;color:var(--muted)">${e.description||'—'}</td>
      <td style="font-size:0.75rem;color:var(--muted)">${e.receipt||'—'}</td>
    </tr>`).join('')}</tbody></table>`;
}

async function recordExpense() {
  const category    = document.getElementById('exp-category').value;
  const amount      = parseFloat(document.getElementById('exp-amount').value);
  const paidTo      = document.getElementById('exp-paid-to').value;
  const method      = document.getElementById('exp-method').value;
  const description = document.getElementById('exp-desc').value;
  const receipt     = document.getElementById('exp-receipt').value;

  if (!amount || !category) return showMsg('exp-msg', '❌ Category and amount required.', 'error');
  if (amount <= 0)           return showMsg('exp-msg', '❌ Amount must be greater than 0.', 'error');

  // Professional control: expenses above UGX 100,000 require confirmation
  const APPROVAL_LIMIT = 100000;
  if (amount >= APPROVAL_LIMIT) {
    const confirmed = confirm(
      `⚠️ Large Expense Alert\n\n` +
      `Amount: UGX ${amount.toLocaleString()}\n` +
      `Category: ${category}\n` +
      `Paid To: ${paidTo || 'Not specified'}\n\n` +
      `Expenses above UGX 100,000 require confirmation.\n` +
      `Are you sure you want to record this expense?`
    );
    if (!confirmed) return showMsg('exp-msg', 'ℹ️ Expense cancelled.', 'info');
  }

  // Check wallet balance before recording
  const totalSavings  = ALL_SAVINGS.filter(s => !s.reversed).reduce((sum, s) => sum + s.amount, 0);
  const totalLoaned   = ALL_LOANS.filter(l => ['active','overdue'].includes(l.status)).reduce((sum, l) => sum + l.amount, 0);
  const totalExisting = ALL_EXPENSES.reduce((sum, e) => sum + e.amount, 0);
  const currentBalance = Math.max(0, totalSavings - totalLoaned - totalExisting);

  if (amount > currentBalance) {
    const proceed = confirm(
      `⚠️ Insufficient Wallet Balance\n\n` +
      `Current Balance: UGX ${currentBalance.toLocaleString()}\n` +
      `Expense Amount:  UGX ${amount.toLocaleString()}\n\n` +
      `This expense exceeds your available balance.\n` +
      `Do you still want to record it?`
    );
    if (!proceed) return showMsg('exp-msg', 'ℹ️ Expense cancelled.', 'info');
  }

  try {
    showMsg('exp-msg', '⏳ Recording expense...', 'info');
    const expense = await api('/api/expenses', 'POST', { category, amount, paidTo, method, description, receipt });
    ALL_EXPENSES.push(expense);
    showMsg('exp-msg', `✅ Expense of UGX ${amount.toLocaleString()} recorded successfully!`, 'success');
    ['exp-amount','exp-paid-to','exp-desc','exp-receipt'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
    loadExpenses();
    // Always refresh ALL_EXPENSES and wallet data
    ALL_EXPENSES = await api('/api/expenses');
    await loadWallet();
    loadDashboard();
    setTimeout(() => closeModal('modal-expense'), 1800);
  } catch(err) { showMsg('exp-msg', '❌ ' + err.message, 'error'); }
}

// ============================================================
// PAYMENTS
// ============================================================
function loadPayments() {
  const el = document.getElementById('payments-history');
  const payments = ALL_EXPENSES.filter(e => e.paymentType === 'direct_payment');
  el.innerHTML = payments.length === 0 ? '<p class="empty-state">No payments made yet.</p>' :
    `<table class="dtable"><thead><tr><th>Date</th><th>Category</th><th>Recipient</th><th>Amount</th><th>Method</th></tr></thead>
    <tbody>${[...payments].reverse().map(p=>`<tr>
      <td>${dt(p.date)}</td><td>${p.category}</td><td>${p.paidTo||'—'}</td>
      <td style="color:var(--red);font-weight:700">${ugx(p.amount)}</td><td>${badge(p.method||'cash')}</td>
    </tr>`).join('')}</tbody></table>`;
}

function openPaymentForm(category) {
  SEL_PAY_CAT = category;
  const titles = { salary:'👷 Pay Salary', electricity:'💡 Pay Electricity (UMEME)', water:'💧 Pay Water (NWSC)', internet:'🌐 Pay Internet', rent:'🏠 Pay Office Rent', fuel:'⛽ Pay Fuel', repair:'🔧 Pay Bike Repairs', emergency:'🚨 Emergency Payment', other:'📦 Make Payment' };
  document.getElementById('payment-modal-title').textContent = titles[category] || '💳 Make Payment';
  document.getElementById('pmt-name').value = '';
  document.getElementById('pmt-phone').value = '';
  document.getElementById('pmt-amount').value = '';
  document.getElementById('pmt-notes').value = '';
  const msg = document.getElementById('pmt-msg');
  msg.textContent = ''; msg.className = 'amsg';
  openModal('modal-payment');
}

function selPayNet(net) {
  SEL_PAY_NET = net;
  document.querySelectorAll('#modal-payment .mm-net').forEach(el => el.classList.remove('active'));
  document.getElementById('pmt-' + net).classList.add('active');
}

async function makePayment() {
  const name   = document.getElementById('pmt-name').value.trim();
  const phone  = document.getElementById('pmt-phone').value.trim();
  const amount = parseFloat(document.getElementById('pmt-amount').value);
  const notes  = document.getElementById('pmt-notes').value;

  if (!name || !amount) return showMsg('pmt-msg', '❌ Recipient name and amount required.', 'error');
  if (amount <= 0)       return showMsg('pmt-msg', '❌ Amount must be greater than 0.', 'error');

  // Check wallet balance before payment
  const totalSavings  = ALL_SAVINGS.filter(s => !s.reversed).reduce((sum, s) => sum + s.amount, 0);
  const totalLoaned   = ALL_LOANS.filter(l => ['active','overdue'].includes(l.status)).reduce((sum, l) => sum + l.amount, 0);
  const totalExisting = ALL_EXPENSES.reduce((sum, e) => sum + e.amount, 0);
  const currentBalance = Math.max(0, totalSavings - totalLoaned - totalExisting);

  // Approval required for payments above UGX 100,000
  if (amount >= 100000) {
    const confirmed = confirm(
      `⚠️ Large Payment Alert\n\n` +
      `Recipient: ${name}\n` +
      `Category:  ${SEL_PAY_CAT}\n` +
      `Amount:    UGX ${amount.toLocaleString()}\n` +
      `Method:    ${SEL_PAY_NET.toUpperCase()}\n\n` +
      `Payments above UGX 100,000 require confirmation.\n` +
      `Current wallet balance: UGX ${currentBalance.toLocaleString()}\n\n` +
      `Confirm this payment?`
    );
    if (!confirmed) return showMsg('pmt-msg', 'ℹ️ Payment cancelled.', 'info');
  }

  if (amount > currentBalance) {
    const proceed = confirm(
      `⚠️ Insufficient Wallet Balance\n\n` +
      `Current Balance: UGX ${currentBalance.toLocaleString()}\n` +
      `Payment Amount:  UGX ${amount.toLocaleString()}\n\n` +
      `This payment exceeds your available balance.\n` +
      `Do you still want to record it?`
    );
    if (!proceed) return showMsg('pmt-msg', 'ℹ️ Payment cancelled.', 'info');
  }

  try {
    showMsg('pmt-msg', '⏳ Processing payment...', 'info');

    // Save to server — not localStorage
    const expense = await api('/api/expenses', 'POST', {
      category:    SEL_PAY_CAT,
      amount:      amount,
      paidTo:      name,
      method:      SEL_PAY_NET,
      description: notes || SEL_PAY_CAT + ' payment',
      receipt:     phone,
      paymentType: 'direct_payment'
    });

    ALL_EXPENSES.push(expense);

    if (SEL_PAY_NET !== 'cash') {
      showMsg('pmt-msg', `✅ Payment of UGX ${amount.toLocaleString()} to ${name} recorded! Mobile money notification sent (Sandbox).`, 'success');
    } else {
      showMsg('pmt-msg', `✅ Cash payment of UGX ${amount.toLocaleString()} to ${name} recorded successfully!`, 'success');
    }

    loadPayments();
    // Always refresh ALL_EXPENSES and wallet data
    ALL_EXPENSES = await api('/api/expenses');
    await loadWallet();
    loadDashboard();
    setTimeout(() => closeModal('modal-payment'), 2000);
  } catch(err) { showMsg('pmt-msg', '❌ ' + err.message, 'error'); }
}

// ============================================================
// MESSAGES
// ============================================================
async function loadMessages() {
  try {
    const msgs = await api('/api/messages');
    const el   = document.getElementById('msg-history');
    el.innerHTML = msgs.length === 0 ? '<p class="empty-state">No messages sent yet.</p>' :
      `<table class="dtable"><thead><tr><th>Date</th><th>Sent To</th><th>Recipients</th><th>Message</th><th>By</th></tr></thead>
      <tbody>${msgs.map(m=>`<tr>
        <td>${dt(m.sentAt)}</td>
        <td><span class="badge b-pending">${m.target}</span></td>
        <td>${m.sentTo} riders</td>
        <td style="max-width:300px;font-size:0.8rem">${m.message}</td>
        <td>${m.sentBy}</td>
      </tr>`).join('')}</tbody></table>`;
  } catch(err) { console.error(err); }
}

function setTpl(type) {
  const tpls = {
    reminder: 'Dear Rider, please remember to save today. Minimum UGX 2,000 per day keeps you eligible for loans. Thank you! BodaSACCO.',
    loan:     'Dear Rider, your loan repayment is due. Please make a payment today to avoid late penalties. Contact us for help. BodaSACCO.',
    meeting:  'Dear Rider, there will be a SACCO meeting on [DATE] at [TIME] at [LOCATION]. Attendance is compulsory. BodaSACCO.',
    congrats: 'Congratulations! You are one of our top savers this month. Keep up the excellent work! BodaSACCO salutes you. 🎉'
  };
  document.getElementById('msg-text').value = tpls[type] || '';
}

async function sendMsg() {
  const target  = document.getElementById('msg-target').value;
  const message = document.getElementById('msg-text').value.trim();
  if (!message) return showMsg('msg-result', 'Enter a message.', 'error');
  try {
    showMsg('msg-result', '⏳ Sending...', 'info');
    const data = await api('/api/messages', 'POST', { target, message });
    showMsg('msg-result', '✅ ' + data.message, 'success');
    document.getElementById('msg-text').value = '';
    loadMessages();
  } catch(err) { showMsg('msg-result', '❌ ' + err.message, 'error'); }
}

async function quickSendMsg() {
  const target  = document.getElementById('quick-msg-target').value;
  const message = document.getElementById('quick-msg-text').value.trim();
  if (!message) return showMsg('quick-msg-result', 'Enter a message.', 'error');
  try {
    const data = await api('/api/messages', 'POST', { target, message });
    showMsg('quick-msg-result', '✅ ' + data.message, 'success');
    setTimeout(() => closeModal('modal-send-message'), 1500);
  } catch(err) { showMsg('quick-msg-result', '❌ ' + err.message, 'error'); }
}

function sendReminderSMS(phone, name) {
  alert(`Reminder SMS will be sent to ${name} (${phone}).\n\nMessage: "Dear ${name}, please make your SACCO savings today. BodaSACCO."\n\n(Sandbox mode — connect real SMS API to send actual SMS)`);
}

// ============================================================
// REPORTS
// ============================================================
async function loadReports() {
  try {
    const period = document.getElementById('rpt-period')?.value || 'week';
    const rpt    = await api(`/api/reports/summary?period=${period}`);

    // Fetch fresh data for income statement
    const [savings, loans, expenses] = await Promise.all([
      api('/api/savings'),
      api('/api/loans'),
      api('/api/expenses')
    ]);
    ALL_SAVINGS  = savings;
    ALL_LOANS    = loans;
    ALL_EXPENSES = expenses;

    // Period filter
    const now = new Date();
    let cutoff = new Date(0);
    let periodLabel = '';
    if (period === 'day') {
      cutoff = new Date(); cutoff.setHours(0,0,0,0);
      periodLabel = 'Today — ' + now.toLocaleDateString('en-UG');
    } else if (period === 'week') {
      cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      periodLabel = 'This Week';
    } else if (period === 'month') {
      cutoff = new Date(); cutoff.setDate(1); cutoff.setHours(0,0,0,0);
      periodLabel = now.toLocaleString('en-UG', { month:'long', year:'numeric' });
    } else {
      periodLabel = 'All Time';
    }

    const inPeriod = d => period === 'all' || new Date(d) >= cutoff;

    // ── INCOME CALCULATIONS ──────────────────────────────────
    const periodSavings   = ALL_SAVINGS.filter(s => !s.reversed && inPeriod(s.date));
    const totalSavingsIn  = periodSavings.reduce((sum, s) => sum + s.amount, 0);

    const periodLoans     = ALL_LOANS.filter(l => inPeriod(l.createdAt));
    const interestIncome  = periodLoans.reduce((sum, l) => sum + (l.interestAmount || 0), 0);

    const penalties       = ALL_LOANS.filter(l => l.penaltyAmount > 0 && inPeriod(l.createdAt))
                              .reduce((sum, l) => sum + (l.penaltyAmount || 0), 0);

    const totalIncome     = totalSavingsIn + interestIncome + penalties;

    // ── EXPENDITURE CALCULATIONS ─────────────────────────────
    const periodExpenses  = ALL_EXPENSES.filter(e => inPeriod(e.date));

    // Group expenses by category
    const expByCategory = {};
    periodExpenses.forEach(e => {
      expByCategory[e.category] = (expByCategory[e.category] || 0) + e.amount;
    });

    const loansIssued     = ALL_LOANS.filter(l => l.status !== 'pending' && inPeriod(l.createdAt))
                              .reduce((sum, l) => sum + l.amount, 0);
    const totalExpenditure = periodExpenses.reduce((sum, e) => sum + e.amount, 0);

    // Net result
    const netSurplus = totalIncome - totalExpenditure;

    // ── SUMMARY CARDS ────────────────────────────────────────
    document.getElementById('rpt-cards').innerHTML = [
      { label:'Total Income',      val:ugx(totalIncome),       color:'c-green',  icon:'💰' },
      { label:'Total Expenditure', val:ugx(totalExpenditure),  color:'c-gold',   icon:'💸' },
      { label:'Net Surplus',       val:ugx(Math.abs(netSurplus)), color: netSurplus >= 0 ? 'c-teal' : 'c-red', icon: netSurplus >= 0 ? '📈' : '📉' },
      { label:'Repayment Rate',    val:rpt.repaymentRate+'%',  color:'c-blue',   icon:'✅' },
    ].map(s=>`<div class="stat-card ${s.color}"><div class="sc-top"><div class="sc-label">${s.label}</div><div class="sc-icon">${s.icon}</div></div><div class="sc-val">${s.val}</div></div>`).join('');

    // ── INCOME STATEMENT ─────────────────────────────────────
    document.getElementById('rpt-period-label').textContent = periodLabel;

    const incomeRow = (label, amount, muted=false) => `
      <div style="display:flex;justify-content:space-between;padding:8px 14px;border-bottom:1px solid var(--border);${muted?'color:var(--muted)':''}">
        <span>${label}</span>
        <span style="font-weight:600">${ugx(amount)}</span>
      </div>`;

    document.getElementById('income-rows').innerHTML =
      incomeRow('Member Savings Collected', totalSavingsIn) +
      incomeRow('Interest Income', interestIncome) +
      (penalties > 0 ? incomeRow('Penalty Income', penalties) : '');

    document.getElementById('total-income').textContent = ugx(totalIncome);

    // Expense rows by category
    const expRows = Object.entries(expByCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amt]) => incomeRow(cat, amt))
      .join('');

    document.getElementById('expense-rows').innerHTML = expRows ||
      '<div style="padding:12px 14px;color:var(--muted)">No expenses recorded for this period</div>';

    document.getElementById('total-expenditure').textContent = ugx(totalExpenditure);

    // Net result
    const netEl = document.getElementById('net-result');
    if (netSurplus >= 0) {
      netEl.style.background = '#d4edda';
      netEl.style.color = 'var(--green)';
      netEl.innerHTML = `<span>📈 Net Surplus</span><span>${ugx(netSurplus)}</span>`;
    } else {
      netEl.style.background = '#fde8e8';
      netEl.style.color = 'var(--red)';
      netEl.innerHTML = `<span>📉 Net Deficit</span><span>-${ugx(Math.abs(netSurplus))}</span>`;
    }

    // ── LOAN BOOK ────────────────────────────────────────────
    const active  = ALL_LOANS.filter(l => l.status === 'active').length;
    const overdue = ALL_LOANS.filter(l => l.status === 'overdue').length;
    const paid    = ALL_LOANS.filter(l => l.status === 'paid').length;
    const pending = ALL_LOANS.filter(l => l.status === 'pending').length;
    const totalOutstanding = ALL_LOANS.filter(l => ['active','overdue'].includes(l.status))
                              .reduce((sum, l) => sum + (l.remaining || l.amount), 0);

    document.getElementById('loan-book').innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px">
        ${[
          { label:'Active Loans',   val:active,  color:'var(--blue)' },
          { label:'Overdue Loans',  val:overdue, color:'var(--red)' },
          { label:'Paid Loans',     val:paid,    color:'var(--green)' },
          { label:'Pending Loans',  val:pending, color:'var(--gold)' },
        ].map(s=>`<div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center">
          <div style="font-size:1.4rem;font-weight:800;color:${s.color}">${s.val}</div>
          <div style="font-size:0.78rem;color:var(--muted);margin-top:4px">${s.label}</div>
        </div>`).join('')}
      </div>
      <div style="display:flex;justify-content:space-between;padding:12px 14px;background:var(--bg);border-radius:8px;font-weight:700">
        <span>Total Outstanding Loan Portfolio</span>
        <span style="color:var(--red)">${ugx(totalOutstanding)}</span>
      </div>`;

    // ── TOP SAVERS ───────────────────────────────────────────
    document.getElementById('rpt-top-savers').innerHTML = rpt.topSavers.length === 0 ?
      '<p class="empty-state">No savings data yet.</p>' :
      rpt.topSavers.map((s,i)=>`
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:1.2rem">${i===0?'🥇':i===1?'🥈':i===2?'🥉':'🏅'}</span>
            <div><strong>${s.name}</strong><br/><span style="font-size:0.75rem;color:var(--muted)">${s.phone||''}</span></div>
          </div>
          <div style="color:var(--green);font-weight:700">${ugx(s.total)}</div>
        </div>`).join('');

    // ── DEFAULTERS ───────────────────────────────────────────
    document.getElementById('rpt-defaulters').innerHTML = rpt.defaulters.length === 0 ?
      '<p class="empty-state">No defaulters 🎉 All loans on track!</p>' :
      rpt.defaulters.map(d=>`
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">
          <div>
            <strong>${d.riderName}</strong><br/>
            <span style="font-size:0.75rem;color:var(--muted)">${d.phone} · Due: ${dt(d.dueDate)}</span>
          </div>
          <div style="text-align:right">
            <div style="color:var(--red);font-weight:700">${ugx(d.remaining)}</div>
            ${d.penalty > 0 ? `<div style="font-size:0.72rem;color:var(--red)">+${ugx(d.penalty)} penalty</div>` : ''}
          </div>
        </div>`).join('');

  } catch(err) { console.error('Reports error:', err); }
}

function printIncomeStatement() {
  const content = document.getElementById('income-statement').innerHTML;
  const period  = document.getElementById('rpt-period-label').textContent;
  const saccoName = ADMIN?.saccoName || 'SACCO';
  const win = window.open('', '_blank');
  win.document.write(`
    <html><head><title>Income Statement — ${saccoName}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 30px; color: #1a1e16; }
      h1 { text-align: center; color: #1a6b3c; }
      h2 { text-align: center; color: #666; font-size: 14px; font-weight: normal; }
      h3 { text-align: center; margin-bottom: 20px; }
      .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
      .total { font-weight: bold; background: #f5f5f5; padding: 10px; border-radius: 6px; }
      .net-green { background: #d4edda; color: #1a6b3c; font-weight: bold; padding: 12px; border-radius: 8px; font-size: 16px; }
      .net-red { background: #fde8e8; color: #c0392b; font-weight: bold; padding: 12px; border-radius: 8px; font-size: 16px; }
      @media print { button { display: none; } }
    </style></head>
    <body>
      <h1>${saccoName}</h1>
      <h2>Income Statement — ${period}</h2>
      <h3>Printed on ${new Date().toLocaleDateString('en-UG')}</h3>
      <hr/>
      ${content}
      <br/><br/>
      <button onclick="window.print()" style="padding:10px 20px;background:#1a6b3c;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px">🖨️ Print</button>
    </body></html>`);
  win.document.close();
}

function exportReport(type) {
  fetch('/api/reports/export?type=' + type, {
    headers: { 'x-session-token': TOKEN || '' }
  }).then(res => res.text()).then(csv => {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = type + '-report.csv';
    a.click();
    URL.revokeObjectURL(url);
  }).catch(err => alert('Export failed: ' + err.message));
}

// ============================================================
// SETTINGS
// ============================================================
async function loadSettings() {
  try {
    const s = await api('/api/settings');
    document.getElementById('set-min-dep').value    = s.minDeposit || '';
    document.getElementById('set-max-dep').value    = s.maxDeposit || '';
    document.getElementById('set-interest').value   = s.defaultInterestRate || '';
    document.getElementById('set-multiplier').value = s.maxLoanMultiplier || '';
    document.getElementById('set-penalty').value    = s.latePenaltyPercent || '';
    document.getElementById('set-dual').value       = s.dualApprovalThreshold || '';
    document.getElementById('set-attempts').value   = s.maxLoginAttempts || '';
    document.getElementById('set-lockout').value    = s.lockoutMinutes || '';

    const audit = await api('/api/audit');
    document.getElementById('audit-log').innerHTML = audit.length === 0 ? '<p class="empty-state">No audit entries.</p>' :
      `<table class="dtable"><thead><tr><th>Time</th><th>Action</th><th>Details</th><th>By</th></tr></thead>
      <tbody>${audit.map(a=>`<tr><td style="font-size:0.78rem;color:var(--muted)">${dtFull(a.timestamp)}</td><td style="font-weight:600;font-size:0.82rem">${a.action}</td><td style="font-size:0.8rem;color:var(--muted)">${a.details}</td><td style="font-size:0.78rem">${a.actor}</td></tr>`).join('')}</tbody></table>`;
  } catch(err) { console.error(err); }
}

async function saveSettings() {
  try {
    await api('/api/settings', 'PUT', {
      minDeposit:           parseFloat(document.getElementById('set-min-dep').value),
      maxDeposit:           parseFloat(document.getElementById('set-max-dep').value),
      defaultInterestRate:  parseFloat(document.getElementById('set-interest').value),
      maxLoanMultiplier:    parseFloat(document.getElementById('set-multiplier').value),
      latePenaltyPercent:   parseFloat(document.getElementById('set-penalty').value),
      dualApprovalThreshold:parseFloat(document.getElementById('set-dual').value),
      maxLoginAttempts:     parseInt(document.getElementById('set-attempts').value),
      lockoutMinutes:       parseInt(document.getElementById('set-lockout').value),
    });
    showMsg('settings-msg', '✅ Settings saved!', 'success');
  } catch(err) { showMsg('settings-msg', '❌ ' + err.message, 'error'); }
}

// ============================================================
// CHANGE PASSWORD
// ============================================================
async function changePassword() {
  // Support both settings page IDs and profile page IDs
  const currPass = (document.getElementById('prof-curr-pass') || document.getElementById('set-curr-pass'))?.value.trim();
  const newPass  = (document.getElementById('prof-new-pass')  || document.getElementById('set-new-pass'))?.value.trim();
  const confPass = (document.getElementById('prof-conf-pass') || document.getElementById('set-conf-pass'))?.value.trim();

  if (!currPass || !newPass || !confPass)
    return showMsg('pass-change-msg', 'Please fill in all password fields.', 'error');
  if (newPass.length < 6)
    return showMsg('pass-change-msg', 'New password must be at least 6 characters.', 'error');
  if (newPass !== confPass)
    return showMsg('pass-change-msg', 'New passwords do not match. Please try again.', 'error');
  if (newPass === currPass)
    return showMsg('pass-change-msg', 'New password must be different from current password.', 'error');

  try {
    showMsg('pass-change-msg', '⏳ Changing password...', 'info');
    const data = await api('/api/admin/changepassword', 'POST', {
      currentPassword: currPass,
      newPassword: newPass
    });
    showMsg('pass-change-msg', '✅ ' + data.message, 'success');
    // Clear all possible fields
    ['prof-curr-pass','prof-new-pass','prof-conf-pass','set-curr-pass','set-new-pass','set-conf-pass'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
  } catch(err) {
    showMsg('pass-change-msg', '❌ ' + err.message, 'error');
  }
}

// ============================================================
// FORGOT PASSWORD — Show modal
// ============================================================
// [removed duplicate forgot password functions]

// ============================================================
// PROFILE PAGE
// ============================================================
async function loadProfile() {
  try {
    const data = await api('/api/admin/profile');

    // Use API data OR fall back to ADMIN global
    const name      = data.name      || ADMIN?.name      || 'Chairman';
    const username  = data.username  || ADMIN?.username  || '—';
    const role      = data.role      || ADMIN?.role      || '—';
    const saccoName = data.saccoName || ADMIN?.saccoName || '—';
    const plan      = data.plan      || ADMIN?.plan      || '—';
    const dueDate   = data.dueDate   || ADMIN?.dueDate   || null;

    // Update avatar and name
    document.getElementById('profile-big-avatar').textContent = name.charAt(0).toUpperCase();
    document.getElementById('profile-full-name').textContent  = name;
    document.getElementById('profile-role-badge').textContent = role;
    document.getElementById('profile-sacco-name').textContent = saccoName;

    // Info rows
    document.getElementById('profile-username').textContent = username;
    document.getElementById('profile-role').textContent     = role;
    document.getElementById('profile-sacco').textContent    = saccoName;
    document.getElementById('profile-plan').textContent     = plan.toUpperCase();
    document.getElementById('profile-due').textContent      = dueDate ? new Date(dueDate).toLocaleDateString('en-UG', { day:'2-digit', month:'short', year:'numeric' }) : '—';

    // Security status
    const secStatus = document.getElementById('profile-security-status');
    const banner    = document.getElementById('security-setup-status');
    if (data.hasSecurityQ) {
      secStatus.textContent  = '✅ Secured';
      secStatus.style.color  = 'var(--green)';
      if (banner) {
        banner.className   = 'security-status-banner set';
        banner.textContent = '✅ Security question is set up. You can recover your password if you forget it.';
      }
    } else {
      secStatus.textContent  = '⚠️ Not set up';
      secStatus.style.color  = 'var(--gold)';
      if (banner) {
        banner.className   = 'security-status-banner not-set';
        banner.textContent = '⚠️ Security question not set up yet! Set it now so you can recover your password if you forget it.';
      }
    }

    // Pre-fill security question if already set
    if (data.securityQuestion) {
      const sel  = document.getElementById('sec-question');
      const opts = ['stage','moto','school','nickname','village','friend'];
      const map  = {
        'What was the name of your first boda boda stage?':         'stage',
        'What was the number plate of your first motorcycle?':      'moto',
        'What primary school did you attend?':                      'school',
        'What is your childhood nickname?':                         'nickname',
        'What village did you grow up in?':                         'village',
        'What is the name of your closest childhood friend?':       'friend'
      };
      const matched = map[data.securityQuestion];
      if (matched && sel) {
        sel.value = matched;
      } else if (sel) {
        sel.value = 'custom';
        const customEl = document.getElementById('sec-custom-q');
        const customField = document.getElementById('custom-question-field');
        if (customEl) customEl.value = data.securityQuestion;
        if (customField) customField.style.display = 'block';
      }
    }

  } catch(err) { console.error('Profile load error:', err); }
}

// Show/hide custom question field
document.addEventListener('DOMContentLoaded', () => {
  const sel = document.getElementById('sec-question');
  if (sel) {
    sel.addEventListener('change', () => {
      const customField = document.getElementById('custom-question-field');
      if (customField) customField.style.display = sel.value === 'custom' ? 'block' : 'none';
    });
  }
});

// ============================================================
// SAVE SECURITY QUESTION
// ============================================================
async function saveSecurityQuestion() {
  const selVal    = document.getElementById('sec-question').value;
  const customQ   = document.getElementById('sec-custom-q')?.value.trim();
  const answer    = document.getElementById('sec-answer').value.trim();
  const nid       = document.getElementById('sec-nid').value.trim();
  const password  = document.getElementById('sec-confirm-pass').value.trim();

  // Get the actual question text
  const questionMap = {
    stage:    'What was the name of your first boda boda stage?',
    moto:     'What was the number plate of your first motorcycle?',
    school:   'What primary school did you attend?',
    nickname: 'What is your childhood nickname?',
    village:  'What village did you grow up in?',
    friend:   'What is the name of your closest childhood friend?',
    custom:   customQ
  };
  const question = questionMap[selVal];

  if (!selVal)   return showMsg('security-msg', 'Please choose a security question.', 'error');
  if (selVal === 'custom' && !customQ) return showMsg('security-msg', 'Please write your custom question.', 'error');
  if (!answer)   return showMsg('security-msg', 'Please enter your secret answer.', 'error');
  if (answer.length < 3) return showMsg('security-msg', 'Answer must be at least 3 characters.', 'error');
  if (!nid)      return showMsg('security-msg', 'Please enter your National ID number.', 'error');
  if (!password) return showMsg('security-msg', 'Please enter your current password to confirm.', 'error');

  try {
    showMsg('security-msg', '⏳ Saving security settings...', 'info');
    const data = await api('/api/admin/security/setup', 'POST', {
      securityQuestion: question,
      securityAnswer:   answer,
      nationalId:       nid,
      confirmPassword:  password
    });
    showMsg('security-msg', '✅ ' + data.message, 'success');

    // Clear sensitive fields
    document.getElementById('sec-answer').value       = '';
    document.getElementById('sec-confirm-pass').value = '';

    // Reload profile to update status
    setTimeout(() => loadProfile(), 1000);
  } catch(err) {
    showMsg('security-msg', '❌ ' + err.message, 'error');
  }
}

// ============================================================
// UPDATED FORGOT PASSWORD — now requires NID too
// ============================================================
function showForgotPassword() {
  document.getElementById('forgot-step1').style.display = 'block';
  document.getElementById('forgot-step2').style.display = 'none';
  document.getElementById('forgot-step3').style.display = 'none';
  document.getElementById('forgot-username').value = '';
  ['forgot-msg1','forgot-msg2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = ''; el.className = 'amsg'; }
  });
  openModal('modal-forgot');
}

let FORGOT_ADMIN_ID = null;

async function forgotStep1() {
  const username = document.getElementById('forgot-username').value.trim();
  if (!username) return showMsg('forgot-msg1', 'Enter your username.', 'error');
  try {
    showMsg('forgot-msg1', '⏳ Looking up account...', 'info');
    const res  = await fetch('/api/admin/forgotpassword/verify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
    const data = await res.json();
    if (data.error) return showMsg('forgot-msg1', '❌ ' + data.error, 'error');

    FORGOT_ADMIN_ID = data.adminId;

    if (data.noSetup) {
      return showMsg('forgot-msg1', '⚠️ You have not set up a security question. Please contact your platform admin to reset your password.', 'error');
    }

    // Show security question + NID field
    document.getElementById('security-q-box').innerHTML = `
      <strong>Your Security Question:</strong>
      ${data.question}
      <div style="font-size:0.78rem;color:var(--muted);margin-top:6px">
        📌 ${data.hint}
      </div>`;

    // Add NID field dynamically to step 2 if not there
    const step2 = document.getElementById('forgot-step2');
    if (!document.getElementById('forgot-nid')) {
      const nidDiv = document.createElement('div');
      nidDiv.className = 'lf';
      nidDiv.innerHTML = '<label>Your National ID Number</label><input type="text" id="forgot-nid" placeholder="e.g. CM1234567890ABC"/>';
      const answerDiv = step2.querySelector('.lf');
      step2.insertBefore(nidDiv, answerDiv.nextSibling);
    }

    document.getElementById('forgot-answer').value = '';
    const nidEl = document.getElementById('forgot-nid');
    if (nidEl) nidEl.value = '';

    document.getElementById('forgot-step1').style.display = 'none';
    document.getElementById('forgot-step2').style.display = 'block';

  } catch(err) {
    showMsg('forgot-msg1', '❌ Something went wrong. Try again.', 'error');
  }
}

async function forgotStep2() {
  const answer = document.getElementById('forgot-answer').value.trim();
  const nid    = document.getElementById('forgot-nid')?.value.trim() || '';
  if (!answer) return showMsg('forgot-msg2', 'Please answer the security question.', 'error');
  if (!nid)    return showMsg('forgot-msg2', 'Please enter your National ID number.', 'error');
  if (!FORGOT_ADMIN_ID) return showMsg('forgot-msg2', 'Session expired. Start again.', 'error');

  try {
    showMsg('forgot-msg2', '⏳ Verifying your identity...', 'info');
    const res  = await fetch('/api/admin/forgotpassword/answer', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminId: FORGOT_ADMIN_ID, answer, nationalId: nid })
    });
    const data = await res.json();
    if (data.error) return showMsg('forgot-msg2', '❌ ' + data.error, 'error');

    document.getElementById('password-reveal-box').innerHTML = `
      <div class="reveal-title">✅ Identity Verified — Your Password Is</div>
      <div class="reveal-pass">${data.password}</div>
      <div class="reveal-note">Write this down then close and login. Consider changing it afterwards.</div>`;

    document.getElementById('forgot-step2').style.display = 'none';
    document.getElementById('forgot-step3').style.display = 'block';
    FORGOT_ADMIN_ID = null;

  } catch(err) {
    showMsg('forgot-msg2', '❌ Something went wrong. Try again.', 'error');
  }
}
