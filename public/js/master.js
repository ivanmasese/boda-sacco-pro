
// ===== MOBILE SIDEBAR TOGGLE =====
function toggleSidebar() {
  const sidebar = document.getElementById('msidebar');
  const overlay = document.getElementById('sidebarOverlay');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('show');
}
function closeSidebar() {
  const sidebar = document.getElementById('msidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('show');
}

// Close sidebar when nav button clicked on mobile
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.ms-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (window.innerWidth <= 900) closeSidebar();
    });
  });
});

// ============================================================
// BodaSACCO Master Admin Panel — JavaScript
// ============================================================

let MASTER_TOKEN = null;
let CURRENT_PAGE = 'overview';
let SEL_SACCO_ID = null; // Currently selected SACCO for actions

// ============================================================
// API HELPER
// ============================================================
async function mapi(url, method = 'GET', body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'x-master-token': MASTER_TOKEN || '' }
  };
  if (body) opts.body = JSON.stringify(body);

  // Add 10 second timeout so it never hangs forever
  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 10000);
  opts.signal      = controller.signal;

  try {
    const res  = await fetch(url, opts);
    clearTimeout(timeout);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed.');
    return data;
  } catch(err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error('Request timed out. Please try again.');
    throw err;
  }
}

function ugx(n)  { return 'UGX ' + Number(n || 0).toLocaleString(); }
function dt(iso) { return new Date(iso).toLocaleDateString('en-UG', { day:'2-digit', month:'short', year:'numeric' }); }
function dtFull(iso) { return new Date(iso).toLocaleString('en-UG', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }); }

function showMsg(id, text, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className   = 'mmsg ' + type;
}

// ============================================================
// LOGIN
// ============================================================
async function masterLogin() {
  const username = document.getElementById('m-user').value.trim();
  const password = document.getElementById('m-pass').value.trim();
  if (!username || !password) return showMsg('login-msg', 'Enter username and password.', 'error');

  try {
    showMsg('login-msg', '⏳ Authenticating...', 'info');
    const data   = await fetch('/api/master/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    }).then(r => r.json());

    if (data.error) return showMsg('login-msg', '❌ ' + data.error, 'error');

    MASTER_TOKEN = data.token;
    document.getElementById('ms-owner-name').textContent = data.name;
    document.getElementById('login-page').classList.remove('active');
    document.getElementById('master-page').classList.add('active');
    goTo('overview');

  } catch(err) { showMsg('login-msg', '❌ ' + err.message, 'error'); }
}

document.addEventListener('DOMContentLoaded', () => {
  ['m-user','m-pass'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') masterLogin(); });
  });
});

async function masterLogout() {
  try { await mapi('/api/master/logout', 'POST'); } catch(e) {}
  MASTER_TOKEN = null;
  document.getElementById('master-page').classList.remove('active');
  document.getElementById('login-page').classList.add('active');
  document.getElementById('m-pass').value = '';
}

// ============================================================
// NAVIGATION
// ============================================================
function goTo(page) {
  CURRENT_PAGE = page;
  document.querySelectorAll('.mpg').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.ms-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('pg-' + page).classList.add('active');
  document.querySelectorAll('.ms-btn').forEach(btn => {
    if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes("'" + page + "'"))
      btn.classList.add('active');
  });
  const titles = { overview:'Overview', saccos:'SACCOs', payments:'Payments', settings:'Settings', audit:'Audit Log', backups:'Backups' };
  document.getElementById('mtopbar-title').textContent = titles[page] || page;
  loadPage();
}

function loadPage() {
  if (CURRENT_PAGE === 'overview')  loadOverview();
  if (CURRENT_PAGE === 'saccos')    loadSaccos();
  if (CURRENT_PAGE === 'payments')  loadPayments();
  if (CURRENT_PAGE === 'settings')  loadSettings();
  if (CURRENT_PAGE === 'audit')     loadAudit();
  if (CURRENT_PAGE === 'backups')   loadBackups();
}

// ============================================================
// MODALS
// ============================================================
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.addEventListener('click', e => { if (e.target.classList.contains('moverlay')) e.target.classList.remove('open'); });

// ============================================================
// OVERVIEW
// ============================================================
async function loadOverview() {
  try {
    const d = await mapi('/api/master/dashboard');

    document.getElementById('overview-stats').innerHTML = [
      { label:'Total SACCOs',    val: d.totalSaccos,          icon:'🏢', color:'c-blue',   sub: `${d.activeSaccos} active, ${d.trialSaccos} trial` },
      { label:'Total Riders',    val: d.totalRiders,          icon:'👥', color:'c-green',  sub: 'Across all SACCOs' },
      { label:'Total Savings',   val: ugx(d.totalSavings),    icon:'💰', color:'c-gold',   sub: 'All SACCOs combined' },
      { label:'Monthly Revenue', val: ugx(d.monthRevenue),    icon:'💳', color:'c-purple', sub: 'This month' },
      { label:'Total Revenue',   val: ugx(d.totalRevenue),    icon:'📈', color:'c-teal',   sub: 'All time' },
      { label:'Suspended',       val: d.suspendedSaccos,      icon:'⛔', color:'c-red',    sub: 'Need follow up' },
    ].map(s => `
      <div class="mstat ${s.color}">
        <div class="mstat-icon">${s.icon}</div>
        <div class="mstat-label">${s.label}</div>
        <div class="mstat-val">${s.val}</div>
        <div style="font-size:0.72rem;color:var(--muted);margin-top:3px">${s.sub}</div>
      </div>`).join('');

    // SACCO performance list
    const perfEl = document.getElementById('sacco-perf-list');
    perfEl.innerHTML = d.saccoStats.length === 0 ? '<p class="empty-m">No SACCOs yet.</p>' :
      d.saccoStats.sort((a,b) => b.totalSavings - a.totalSavings).slice(0,8).map(s => `
        <div class="perf-item">
          <div>
            <div class="perf-name">${s.name}</div>
            <div class="perf-detail">${s.location} · <span class="sbadge s-${s.status}">${s.status}</span></div>
          </div>
          <div class="perf-right">
            <div class="perf-savings">${ugx(s.totalSavings)}</div>
            <div class="perf-riders">${s.riderCount} riders</div>
          </div>
        </div>`).join('');

    // Recent payments
    const payEl = document.getElementById('recent-payments-list');
    payEl.innerHTML = d.recentPayments.length === 0 ? '<p class="empty-m">No payments yet.</p>' :
      d.recentPayments.slice(0,8).map(p => `
        <div class="pay-item">
          <div>
            <div class="pay-sacco">${p.saccoName}</div>
            <div class="pay-date">${dt(p.date)}</div>
          </div>
          <div>
            <div class="pay-amount">${ugx(p.amount)}</div>
            <div class="pay-method">${p.method}</div>
          </div>
        </div>`).join('');

  } catch(err) { console.error(err); }
}

// ============================================================
// SACCOs
// ============================================================
async function loadSaccos() {
  try {
    const saccos = await mapi('/api/master/saccos');
    const filter = document.getElementById('sacco-status-filter')?.value || '';
    const filtered = filter ? saccos.filter(s => s.status === filter) : saccos;
    const el = document.getElementById('saccos-list');

    el.innerHTML = filtered.length === 0 ? '<p class="empty-m">No SACCOs found.</p>' :
      `<table class="mtable">
        <thead><tr>
          <th>#</th><th>SACCO Name</th><th>Location</th><th>Plan</th>
          <th>Riders</th><th>Savings</th><th>Status</th>
          <th>Due Date</th><th>Actions</th>
        </tr></thead>
        <tbody>${filtered.map((s, i) => `
          <tr>
            <td>${i+1}</td>
            <td>
              <div style="font-weight:700">${s.name}</div>
              <div style="font-size:0.75rem;color:var(--muted)">${s.chairpersonName} · ${s.chairpersonPhone}</div>
            </td>
            <td>${s.location}</td>
            <td><span style="color:var(--gold);font-weight:600;font-size:0.82rem">${(s.plan||'').toUpperCase()}</span></td>
            <td>${s.riderCount}</td>
            <td style="color:var(--green);font-weight:600">${ugx(s.totalSavings)}</td>
            <td><span class="sbadge s-${s.status}">${s.status}</span></td>
            <td style="font-size:0.78rem">${s.subscriptionDueDate ? dt(s.subscriptionDueDate) : '—'}</td>
            <td>
              <div style="display:flex;gap:4px;flex-wrap:wrap">
                <button class="mbtn-sm mbtn-blue" onclick="viewSacco('${s.id}')">👁 View</button>
                <button class="mbtn-sm mbtn-green" onclick="openPaymentModal('${s.id}','${s.name}','${s.plan}')">💳 Pay</button>
                ${s.status !== 'suspended'
                  ? `<button class="mbtn-sm mbtn-red" onclick="suspendSacco('${s.id}','${s.name}')">⛔ Suspend</button>`
                  : `<button class="mbtn-sm mbtn-green" onclick="activateSacco('${s.id}','${s.name}')">✅ Activate</button>`
                }
              </div>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  } catch(err) { console.error(err); }
}

// ============================================================
// CREATE SACCO
// ============================================================
async function createSacco() {
  const name      = document.getElementById('new-sacco-name').value.trim();
  const location  = document.getElementById('new-sacco-location').value.trim();
  const chairName = document.getElementById('new-chair-name').value.trim();
  const chairPhone= document.getElementById('new-chair-phone').value.trim();
  const chairEmail= document.getElementById('new-chair-email').value.trim();
  const plan      = document.getElementById('new-sacco-plan').value;
  const setupPaid = document.getElementById('new-setup-paid').checked;

  if (!name || !location || !chairName || !chairPhone)
    return showMsg('create-sacco-msg', 'Please fill in all required fields.', 'error');

  try {
    showMsg('create-sacco-msg', '⏳ Creating SACCO...', 'info');
    const data = await mapi('/api/master/saccos', 'POST', {
      name, location, chairpersonName: chairName,
      chairpersonPhone: chairPhone, chairpersonEmail: chairEmail,
      plan, setupFeePaid: setupPaid
    });

    showMsg('create-sacco-msg', '✅ ' + data.message, 'success');

    // Show generated credentials
    const credBox = document.getElementById('sacco-credentials');
    credBox.style.display = 'block';
    credBox.innerHTML = `
      <div class="cred-title">🔑 Chairman Login Credentials</div>
      <strong>Send these to ${chairName}:</strong><br/>
      <strong>Login URL:</strong> http://your-domain.com<br/>
      <strong>Username:</strong> ${data.chairmanLogin.username}<br/>
      <strong>Password:</strong> ${data.chairmanLogin.password}<br/>
      <strong>Trial ends:</strong> ${dt(data.trialEndsAt)}<br/>
      <div style="margin-top:10px;font-size:0.78rem;color:var(--muted)">
        ⚠️ Save these credentials now — they won't be shown again!
      </div>`;

    // Clear form
    ['new-sacco-name','new-sacco-location','new-chair-name','new-chair-phone','new-chair-email'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    document.getElementById('new-setup-paid').checked = false;
    loadSaccos();

  } catch(err) { showMsg('create-sacco-msg', '❌ ' + err.message, 'error'); }
}

// ============================================================
// VIEW SACCO DETAIL
// ============================================================
async function viewSacco(saccoId) {
  try {
    // Show loading in modal first
    const body = document.getElementById('sacco-detail-body');
    body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted)">⏳ Loading...</div>';
    openModal('modal-sacco-detail');

    const saccos = await mapi('/api/master/saccos');
    const s      = saccos.find(sc => sc.id === saccoId);
    if (!s) { body.innerHTML = '<div style="color:var(--red);padding:20px">SACCO not found.</div>'; return; }

    const daysLeft = s.subscriptionDueDate
      ? Math.ceil((new Date(s.subscriptionDueDate) - new Date()) / (1000 * 60 * 60 * 24))
      : 0;

    body.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
        <div style="background:var(--surface2);border-radius:10px;padding:16px">
          <div style="font-size:0.72rem;color:var(--muted);text-transform:uppercase;margin-bottom:12px">SACCO Info</div>
          <div style="line-height:2.2;font-size:0.88rem">
            <div><strong>Name:</strong> ${s.name}</div>
            <div><strong>Location:</strong> ${s.location}</div>
            <div><strong>Chairman:</strong> ${s.chairpersonName}</div>
            <div><strong>Phone:</strong> ${s.chairpersonPhone}</div>
            <div><strong>Email:</strong> ${s.chairpersonEmail || '—'}</div>
            <div><strong>Joined:</strong> ${dt(s.createdAt)}</div>
          </div>
        </div>
        <div style="background:var(--surface2);border-radius:10px;padding:16px">
          <div style="font-size:0.72rem;color:var(--muted);text-transform:uppercase;margin-bottom:12px">Subscription</div>
          <div style="line-height:2.2;font-size:0.88rem">
            <div><strong>Plan:</strong> <span style="color:var(--gold)">${(s.plan||'').toUpperCase()}</span></div>
            <div><strong>Status:</strong> <span class="sbadge s-${s.status}">${s.status}</span></div>
            <div><strong>Due Date:</strong> ${s.subscriptionDueDate ? dt(s.subscriptionDueDate) : '—'}</div>
            <div><strong>Days Left:</strong> <span style="color:${daysLeft < 5 ? 'var(--red)' : 'var(--green)'}">${daysLeft} days</span></div>
            ${s.suspendedReason ? `<div><strong>Reason:</strong> <span style="color:var(--red)">${s.suspendedReason}</span></div>` : ''}
          </div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
        <div style="background:rgba(0,200,83,0.08);border:1px solid rgba(0,200,83,0.2);border-radius:10px;padding:14px;text-align:center">
          <div style="font-size:1.3rem;font-weight:800;color:var(--green)">${ugx(s.totalSavings)}</div>
          <div style="font-size:0.72rem;color:var(--muted);margin-top:3px">Total Savings</div>
        </div>
        <div style="background:rgba(41,121,255,0.08);border:1px solid rgba(41,121,255,0.2);border-radius:10px;padding:14px;text-align:center">
          <div style="font-size:1.3rem;font-weight:800;color:var(--blue)">${s.riderCount}</div>
          <div style="font-size:0.72rem;color:var(--muted);margin-top:3px">Total Riders</div>
        </div>
        <div style="background:rgba(255,193,7,0.08);border:1px solid rgba(255,193,7,0.2);border-radius:10px;padding:14px;text-align:center">
          <div style="font-size:1.3rem;font-weight:800;color:var(--gold)">${s.lastPayment ? ugx(s.lastPayment.amount) : 'None'}</div>
          <div style="font-size:0.72rem;color:var(--muted);margin-top:3px">Last Payment</div>
        </div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px">
        <button class="mbtn-add" onclick="openPaymentModal('${s.id}','${s.name}','${s.plan}');closeModal('modal-sacco-detail')">💳 Record Payment</button>
        ${s.status !== 'suspended'
          ? `<button class="mbtn-sm mbtn-red" style="padding:9px 16px" onclick="suspendSacco('${s.id}','${s.name}');closeModal('modal-sacco-detail')">⛔ Suspend SACCO</button>`
          : `<button class="mbtn-sm mbtn-green" style="padding:9px 16px" onclick="activateSacco('${s.id}','${s.name}');closeModal('modal-sacco-detail')">✅ Reactivate SACCO</button>`
        }
      </div>
      <div id="sacco-creds-section" style="background:rgba(0,200,83,0.08);border:1px solid rgba(0,200,83,0.3);border-radius:10px;padding:16px">
        <div style="font-size:0.8rem;font-weight:700;color:var(--green);margin-bottom:10px">🔑 Chairman Login Credentials</div>
        <div id="sacco-creds-loading" style="color:var(--muted);font-size:0.84rem">Loading credentials...</div>
      </div>`;

    openModal('modal-sacco-detail');

    // Load chairman credentials
    try {
      const admins = await mapi('/api/master/saccos/' + saccoId + '/admins');
      const credsEl = document.getElementById('sacco-creds-loading');
      if (!credsEl) return;
      if (!admins || admins.length === 0) {
        credsEl.innerHTML = '<span style="color:var(--muted)">No admin accounts found.</span>';
        return;
      }
      credsEl.innerHTML = admins.map(a => `
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:10px;font-size:0.87rem;line-height:2">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <strong style="color:var(--text)">${a.name}</strong>
            <span style="font-size:0.72rem;background:rgba(41,121,255,0.15);color:#82b1ff;padding:2px 8px;border-radius:20px;font-weight:700">${a.role}</span>
          </div>
          <div><span style="color:var(--muted)">Username:</span> <strong style="color:var(--text);font-family:monospace">${a.username}</strong>
            <button onclick="navigator.clipboard.writeText('${a.username}')" style="background:transparent;border:none;cursor:pointer;color:var(--blue);font-size:0.75rem;margin-left:6px">📋 Copy</button>
          </div>
          <div><span style="color:var(--muted)">Password:</span> <strong style="color:var(--green);font-family:monospace">${a.password}</strong>
            <button onclick="navigator.clipboard.writeText('${a.password}')" style="background:transparent;border:none;cursor:pointer;color:var(--blue);font-size:0.75rem;margin-left:6px">📋 Copy</button>
          </div>
          <div style="margin-top:8px;display:flex;gap:8px">
            <button class="mbtn-sm mbtn-blue" onclick="resetAdminPassword('${a.id}','${a.name}')">🔑 Reset Password</button>
          </div>
        </div>
      `).join('');
    } catch(e) {
      const credsEl = document.getElementById('sacco-creds-loading');
      if (credsEl) credsEl.innerHTML = '<span style="color:var(--red)">Failed to load credentials.</span>';
    }

  } catch(err) { 
    console.error('viewSacco error:', err);
    alert('Error loading SACCO details: ' + err.message);
  }
}

// ============================================================
// SUSPEND / ACTIVATE
// ============================================================
async function suspendSacco(saccoId, saccoName) {
  const reason = prompt(`Reason for suspending "${saccoName}"?`, "Subscription payment overdue");
  if (reason === null) return; // cancelled
  try {
    await mapi(`/api/master/saccos/${saccoId}/suspend`, 'PUT', { reason });
    alert(`"${saccoName}" has been suspended.`);
    loadSaccos();
  } catch(err) { alert('Error: ' + err.message); }
}

async function activateSacco(saccoId, saccoName) {
  if (!confirm(`Reactivate "${saccoName}"? This will set next payment due in 30 days.`)) return;
  try {
    const data = await mapi(`/api/master/saccos/${saccoId}/activate`, 'PUT');
    alert(data.message);
    loadSaccos();
  } catch(err) { alert('Error: ' + err.message); }
}

// ============================================================
// RECORD PAYMENT
// ============================================================
function openPaymentModal(saccoId, saccoName, plan) {
  SEL_SACCO_ID = saccoId;
  document.getElementById('payment-sacco-info').innerHTML = `
    <strong>SACCO:</strong> ${saccoName}<br/>
    <strong>Plan:</strong> ${plan?.toUpperCase() || '—'}
  `;
  document.getElementById('pay-amount').value  = '';
  document.getElementById('pay-ref').value     = '';
  const msg = document.getElementById('payment-msg');
  msg.textContent = ''; msg.className = 'mmsg';
  openModal('modal-record-payment');
}

async function recordPayment() {
  const amount = document.getElementById('pay-amount').value;
  const method = document.getElementById('pay-method').value;
  const ref    = document.getElementById('pay-ref').value.trim();
  if (!amount || !SEL_SACCO_ID) return showMsg('payment-msg', 'Enter payment amount.', 'error');
  try {
    showMsg('payment-msg', '⏳ Recording payment...', 'info');
    const data = await mapi(`/api/master/saccos/${SEL_SACCO_ID}/payment`, 'POST', { amount, method, reference: ref });
    showMsg('payment-msg', '✅ ' + data.message, 'success');
    setTimeout(() => { closeModal('modal-record-payment'); loadSaccos(); loadOverview(); }, 1500);
  } catch(err) { showMsg('payment-msg', '❌ ' + err.message, 'error'); }
}

// ============================================================
// PAYMENTS PAGE
// ============================================================
async function loadPayments() {
  try {
    const payments = await mapi('/api/master/payments');
    const el = document.getElementById('payments-list');

    // Total
    const total = payments.reduce((sum, p) => sum + p.amount, 0);

    el.innerHTML = `
      <div style="padding:12px 18px;background:var(--surface2);border-bottom:1px solid var(--border);font-weight:700;color:var(--green)">
        Total Revenue: ${ugx(total)} (${payments.length} payments)
      </div>` +
      (payments.length === 0 ? '<p class="empty-m">No payments yet.</p>' :
      `<table class="mtable">
        <thead><tr><th>Date</th><th>SACCO</th><th>Amount</th><th>Method</th><th>Reference</th><th>By</th></tr></thead>
        <tbody>${payments.map(p => `<tr>
          <td>${dt(p.date)}</td>
          <td><strong>${p.saccoName}</strong></td>
          <td style="color:var(--green);font-weight:700">${ugx(p.amount)}</td>
          <td>${p.method}</td>
          <td style="font-size:0.75rem;color:var(--muted)">${p.reference || '—'}</td>
          <td>${p.recordedBy}</td>
        </tr>`).join('')}</tbody>
      </table>`);
  } catch(err) { console.error(err); }
}

// ============================================================
// SETTINGS
// ============================================================
async function loadSettings() {
  try {
    const data = await mapi('/api/master/settings');
    document.getElementById('set-name').value          = data.platformName || '';
    document.getElementById('set-trial').value         = data.trialDays || 14;
    document.getElementById('set-setup').value         = data.setupFee || 300000;
    document.getElementById('set-starter-price').value = data.plans?.starter?.price || 100000;
    document.getElementById('set-growth-price').value  = data.plans?.growth?.price  || 200000;
    document.getElementById('set-pro-price').value     = data.plans?.pro?.price     || 400000;
  } catch(err) { console.error(err); }
}

async function saveSettings() {
  try {
    const settings = {
      platformName: document.getElementById('set-name').value,
      trialDays:    parseInt(document.getElementById('set-trial').value),
      setupFee:     parseInt(document.getElementById('set-setup').value),
      plans: {
        starter: { name:'Starter', maxRiders:100, price:parseInt(document.getElementById('set-starter-price').value), description:'Up to 100 riders' },
        growth:  { name:'Growth',  maxRiders:500, price:parseInt(document.getElementById('set-growth-price').value),  description:'Up to 500 riders' },
        pro:     { name:'Pro',     maxRiders:2000,price:parseInt(document.getElementById('set-pro-price').value),     description:'Up to 2000 riders' }
      }
    };
    await mapi('/api/master/settings', 'PUT', settings);
    showMsg('settings-msg', '✅ Settings saved!', 'success');
  } catch(err) { showMsg('settings-msg', '❌ ' + err.message, 'error'); }
}

// ============================================================
// AUDIT LOG
// ============================================================
async function loadAudit() {
  try {
    const logs = await mapi('/api/master/audit');
    const el   = document.getElementById('audit-list');
    el.innerHTML = logs.length === 0 ? '<p class="empty-m">No audit entries.</p>' :
      logs.map(a => `
        <div class="audit-item">
          <div class="audit-action">${a.action}</div>
          <div class="audit-detail">
            ${a.details}
            <div class="audit-sacco">${a.saccoId !== 'platform' ? 'SACCO: ' + a.saccoId : 'Platform'} · ${a.actor}</div>
          </div>
          <div class="audit-time">${dtFull(a.timestamp)}</div>
        </div>`).join('');
  } catch(err) { console.error(err); }
}

// ============================================================
// BACKUPS
// ============================================================
async function loadBackups() {
  try {
    const data = await mapi('/api/master/backups');
    const el   = document.getElementById('backups-list');
    el.innerHTML = data.backups.length === 0 ? '<p class="empty-m">No backups yet.</p>' :
      data.backups.map((f, i) => `
        <div class="backup-item">
          <div>
            <div class="backup-name">📁 ${f}</div>
            <div style="font-size:0.72rem;color:var(--muted);margin-top:2px">${i === 0 ? 'Latest backup' : ''}</div>
          </div>
          <span class="backup-badge">${i === 0 ? '✅ Latest' : '✓ Saved'}</span>
        </div>`).join('');
  } catch(err) { console.error(err); }
}

// Settings page also needs this endpoint
async function mapi_settings() {
  const res  = await fetch('/api/master/settings', { headers: { 'x-master-token': MASTER_TOKEN } });
  return await res.json();
}

// ============================================================
// RESET ADMIN PASSWORD
// ============================================================
async function resetAdminPassword(adminId, adminName) {
  const newPassword = prompt(`Set new password for ${adminName}:`, '');
  if (!newPassword || newPassword.trim() === '') return;
  if (newPassword.length < 6) return alert('Password must be at least 6 characters.');
  try {
    await mapi(`/api/master/admins/${adminId}/resetpassword`, 'PUT', { newPassword: newPassword.trim() });
    alert(`✅ Password for ${adminName} has been reset to: ${newPassword.trim()}\n\nSend this to the chairman securely.`);
    // Refresh the modal to show new password
    const saccoId = document.querySelector('#sacco-creds-loading')?.closest('[data-sacco-id]')?.dataset?.saccoId;
    // Re-load credentials
    const admins = await mapi(`/api/master/saccos/${adminId.split('_')[0]}/admins`).catch(() => null);
  } catch(err) { alert('Error: ' + err.message); }
}
