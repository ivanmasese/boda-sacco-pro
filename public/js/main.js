// ============================================================
// BodaSACCO Pro — Frontend JavaScript v2.0
// ============================================================

let TOKEN    = null;   // Session token from login
let ADMIN    = null;   // Logged-in admin info
let SACCOS   = [];     // All SACCOs cache
let RIDERS   = [];     // All riders cache
let SEL_NET  = 'mtn'; // Selected mobile money network
let SEL_LOAN = null;  // Currently selected loan for repayment

// ============================================================
// API HELPER
// ============================================================
async function api(url, method = 'GET', body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'x-session-token': TOKEN || '' }
  };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

// ============================================================
// LOGIN / LOGOUT
// ============================================================
async function doLogin() {
  const username = document.getElementById('l-user').value.trim();
  const password = document.getElementById('l-pass').value.trim();

  if (!username || !password)
    return showMsg('login-msg', 'Enter username and password.', 'error');

  try {
    const data = await api('/api/login', 'POST', { username, password });
    TOKEN = data.token;
    ADMIN = data.admin;

    // Update sidebar
    document.getElementById('sb-name').textContent   = ADMIN.name;
    document.getElementById('sb-role').textContent   = ADMIN.role;
    document.getElementById('sb-avatar').textContent = ADMIN.name.charAt(0).toUpperCase();

    // Hide login, show app
    document.getElementById('login-page').classList.remove('active');
    document.getElementById('app').classList.add('active');

    // Role restrictions: hide super-only features for treasurer
    if (ADMIN.role === 'treasurer') {
      document.getElementById('btn-add-sacco') && (document.getElementById('btn-add-sacco').style.display = 'none');
    }

    // Load everything
    await loadSaccos();
    goTo('dashboard');

  } catch (err) {
    showMsg('login-msg', '❌ ' + err.message, 'error');
  }
}

// Allow Enter key on login
document.addEventListener('DOMContentLoaded', () => {
  ['l-user','l-pass'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  });
});

async function doLogout() {
  try { await api('/api/logout', 'POST'); } catch(e) {}
  TOKEN = null; ADMIN = null;
  document.getElementById('app').classList.remove('active');
  document.getElementById('login-page').classList.add('active');
  document.getElementById('l-pass').value = '';
}

// ============================================================
// PAGE NAVIGATION
// ============================================================
function goTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sb-btn').forEach(b => b.classList.remove('active'));

  document.getElementById('pg-' + page).classList.add('active');
  document.querySelectorAll('.sb-btn').forEach(btn => {
    if (btn.getAttribute('onclick').includes(page)) btn.classList.add('active');
  });

  const titles = {
    dashboard:'Dashboard', saccos:'SACCOs', riders:'Riders',
    savings:'Savings', loans:'Loans', reports:'Reports',
    messages:'Messages', settings:'Settings'
  };
  document.getElementById('tb-title').textContent = titles[page] || page;
  document.getElementById('tb-breadcrumb').textContent = 'BodaSACCO Pro / ' + (titles[page] || page);

  // Load page data
  const loaders = {
    dashboard: loadDashboard,
    saccos:    loadSaccos,
    riders:    loadRiders,
    savings:   loadSavings,
    loans:     loadLoans,
    reports:   loadReports,
    messages:  loadMessages,
    settings:  loadSettings,
  };
  if (loaders[page]) loaders[page]();
}

// ============================================================
// MODALS
// ============================================================
function openModal(id) {
  document.getElementById(id).classList.add('open');
  // Pre-populate dropdowns
  if (id === 'modal-add-rider')  populateSelect('rider-sacco',  SACCOS, 'id', 'name');
  if (id === 'modal-add-saving') populateSelect('sav-rider',    RIDERS.filter(r=>r.status==='approved'), 'id', 'name', r => `${r.name} — ${r.phone}`);
  if (id === 'modal-add-loan')   populateSelect('loan-rider',   RIDERS.filter(r=>r.status==='approved'), 'id', 'name', r => `${r.name} — ${r.phone}`);
  if (id === 'modal-mm-deposit') populateSelect('mm-rider',     RIDERS.filter(r=>r.status==='approved'), 'id', 'name', r => `${r.name} — ${r.phone}`);
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

// Close modal on overlay click
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('open');
});

function populateSelect(selectId, items, valKey, labelKey, labelFn = null) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = '<option value="">-- Select --</option>';
  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item[valKey];
    opt.textContent = labelFn ? labelFn(item) : item[labelKey];
    sel.appendChild(opt);
  });
}

// ============================================================
// HELPERS
// ============================================================
function ugx(n)    { return 'UGX ' + Number(n||0).toLocaleString(); }
function pct(n)    { return n + '%'; }
function dt(iso)   { return new Date(iso).toLocaleString('en-UG', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }); }
function dtShort(iso) { return new Date(iso).toLocaleDateString('en-UG', { day:'2-digit', month:'short', year:'numeric'}); }

function showMsg(id, text, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = 'lmsg ' + type;
}

function badge(status) {
  const map = {
    pending:'b-pending', approved:'b-approved', active:'b-active',
    overdue:'b-overdue', paid:'b-paid', rejected:'b-rejected',
    suspended:'b-suspended', cash:'b-deposit', mtn:'b-mtn', airtel:'b-airtel'
  };
  return `<span class="badge ${map[status]||'b-pending'}">${status}</span>`;
}

// ============================================================
// DASHBOARD
// ============================================================
async function loadDashboard() {
  try {
    const d = await api('/api/dashboard');

    const stats = [
      { label:'Total Savings',   val: ugx(d.totalSavings),   icon:'💰', color:'c-green' },
      { label:'Today\'s Savings', val: ugx(d.todaySavings),   icon:'📅', color:'c-blue' },
      { label:'Total Riders',    val: d.totalRiders,          icon:'👥', color:'c-purple' },
      { label:'Active Loans',    val: d.activeLoans,          icon:'🏦', color:'c-gold' },
      { label:'Overdue Loans',   val: d.overdueLoans,         icon:'⚠️', color:'c-red' },
      { label:'Available Cash',  val: ugx(d.availableCash),   icon:'💵', color:'c-teal' },
      { label:'Total Loaned',    val: ugx(d.totalLoaned),     icon:'📤', color:'c-red' },
      { label:'Total Repaid',    val: ugx(d.totalRepaid),     icon:'✅', color:'c-green' },
    ];

    document.getElementById('dash-stats').innerHTML = stats.map(s => `
      <div class="stat-card ${s.color}">
        <div class="sc-icon">${s.icon}</div>
        <div><div class="sc-label">${s.label}</div><div class="sc-val">${s.val}</div></div>
      </div>`).join('');

    drawChart(d.savingsTrend);

    // Load reports for overdue & top savers
    const rpt = await api('/api/reports/summary?period=month');

    const od = document.getElementById('dash-overdue');
    od.innerHTML = rpt.defaulters.length === 0
      ? '<p class="empty">No overdue loans 🎉</p>'
      : `<table class="tbl"><thead><tr><th>Rider</th><th>Phone</th><th>Remaining</th><th>Due</th></tr></thead><tbody>
        ${rpt.defaulters.map(d=>`<tr>
          <td>${d.riderName}</td><td>${d.phone}</td>
          <td style="color:var(--red)">${ugx(d.remaining)}</td>
          <td>${dtShort(d.dueDate)}</td>
        </tr>`).join('')}</tbody></table>`;

    const ts = document.getElementById('dash-topSavers');
    ts.innerHTML = rpt.topSavers.length === 0
      ? '<p class="empty">No data yet.</p>'
      : `<table class="tbl"><thead><tr><th>#</th><th>Rider</th><th>Total Savings</th></tr></thead><tbody>
        ${rpt.topSavers.map((s,i)=>`<tr>
          <td>${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</td>
          <td>${s.name}</td>
          <td style="color:var(--green2)">${ugx(s.total)}</td>
        </tr>`).join('')}</tbody></table>`;

  } catch(err) { console.error(err); }
}

// Simple bar chart using canvas
function drawChart(trend) {
  const canvas = document.getElementById('savingsChart');
  if (!canvas) return;
  const ctx  = canvas.getContext('2d');
  const w    = canvas.offsetWidth || 500;
  const h    = 180;
  canvas.width  = w;
  canvas.height = h;

  const max  = Math.max(...trend.map(t=>t.total), 1);
  const barW = (w - 60) / trend.length;
  ctx.clearRect(0, 0, w, h);

  trend.forEach((t, i) => {
    const barH = (t.total / max) * (h - 40);
    const x    = 30 + i * barW + barW * 0.1;
    const y    = h - 30 - barH;
    const bw   = barW * 0.8;

    // Bar
    ctx.fillStyle = t.total > 0 ? '#16a34a' : '#2a3348';
    ctx.beginPath();
    ctx.roundRect(x, y, bw, barH, [4,4,0,0]);
    ctx.fill();

    // Label
    ctx.fillStyle = '#8892a4';
    ctx.font      = '11px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(t.label, x + bw/2, h - 12);

    // Value on hover-like
    if (t.total > 0) {
      ctx.fillStyle = '#e8eaf0';
      ctx.font      = '10px Outfit, sans-serif';
      ctx.fillText(Number(t.total).toLocaleString(), x + bw/2, y - 4);
    }
  });
}

// ============================================================
// SACCOs
// ============================================================
async function loadSaccos() {
  try {
    SACCOS = await api('/api/saccos');
    // Populate global filter
    const gf = document.getElementById('global-sacco-filter');
    gf.innerHTML = '<option value="">All SACCOs</option>';
    SACCOS.forEach(s => {
      gf.innerHTML += `<option value="${s.id}">${s.name}</option>`;
    });
    // Also populate message sacco dropdown
    const ms = document.getElementById('msg-sacco');
    if (ms) {
      ms.innerHTML = '<option value="">-- Select --</option>';
      SACCOS.forEach(s => ms.innerHTML += `<option value="${s.id}">${s.name}</option>`);
    }

    const el = document.getElementById('saccos-table');
    if (!el) return;

    el.innerHTML = SACCOS.length === 0
      ? '<p class="empty">No SACCOs yet. Create one!</p>'
      : `<table class="tbl">
          <thead><tr><th>#</th><th>SACCO Name</th><th>Location</th><th>Chairperson</th><th>Phone</th><th>Riders</th><th>Total Savings</th><th>Status</th></tr></thead>
          <tbody>${SACCOS.map((s,i)=>`<tr>
            <td>${i+1}</td>
            <td><strong>${s.name}</strong></td>
            <td>${s.location}</td>
            <td>${s.chairperson||'—'}</td>
            <td>${s.phone||'—'}</td>
            <td>${s.riderCount}</td>
            <td style="color:var(--green2)">${ugx(s.totalSavings)}</td>
            <td>${badge(s.status)}</td>
          </tr>`).join('')}</tbody>
        </table>`;
  } catch(err) { console.error(err); }
}

async function addSacco() {
  try {
    const name     = document.getElementById('sacco-name').value.trim();
    const location = document.getElementById('sacco-location').value.trim();
    const chair    = document.getElementById('sacco-chair').value.trim();
    const phone    = document.getElementById('sacco-phone').value.trim();
    await api('/api/saccos', 'POST', { name, location, chairperson: chair, phone });
    showMsg('sacco-msg', '✅ SACCO created!', 'success');
    ['sacco-name','sacco-location','sacco-chair','sacco-phone'].forEach(id => document.getElementById(id).value = '');
    setTimeout(() => { closeModal('modal-add-sacco'); loadSaccos(); }, 1200);
  } catch(err) { showMsg('sacco-msg', '❌ ' + err.message, 'error'); }
}

// ============================================================
// RIDERS
// ============================================================
async function loadRiders() {
  try {
    const search = document.getElementById('rider-search')?.value || '';
    const status = document.getElementById('rider-status-filter')?.value || '';
    let url      = '/api/riders?';
    if (search) url += `search=${encodeURIComponent(search)}&`;
    if (status) url += `status=${status}&`;

    RIDERS = await api(url);
    const el = document.getElementById('riders-table');
    if (!el) return;

    el.innerHTML = RIDERS.length === 0
      ? '<p class="empty">No riders found.</p>'
      : `<table class="tbl">
          <thead><tr><th>#</th><th>Name</th><th>Phone</th><th>Stage</th><th>SACCO</th><th>Savings</th><th>Loan</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>${RIDERS.map((r,i)=>`<tr>
            <td>${i+1}</td>
            <td><strong>${r.name}</strong></td>
            <td>${r.phone}</td>
            <td>${r.stage||'—'}</td>
            <td>${r.saccoName}</td>
            <td style="color:var(--green2)">${ugx(r.totalSavings)}</td>
            <td>${r.activeLoan ? `<span style="color:var(--gold)">${ugx(r.activeLoan.amount)}</span>` : '—'}</td>
            <td>${badge(r.status)}</td>
            <td style="display:flex;gap:5px;flex-wrap:wrap">
              <button class="btn-sm btn-view" onclick="viewRider('${r.id}')">👤 View</button>
              ${r.status==='pending'?`<button class="btn-sm btn-approve" onclick="setRiderStatus('${r.id}','approved')">✅ Approve</button>`:''}
              ${r.status==='approved'?`<button class="btn-sm btn-suspend" onclick="setRiderStatus('${r.id}','suspended')">⏸ Suspend</button>`:''}
              ${r.status==='suspended'?`<button class="btn-sm btn-approve" onclick="setRiderStatus('${r.id}','approved')">▶ Restore</button>`:''}
            </td>
          </tr>`).join('')}</tbody>
        </table>`;
  } catch(err) { console.error(err); }
}

async function addRider() {
  try {
    const name    = document.getElementById('rider-name').value.trim();
    const phone   = document.getElementById('rider-phone').value.trim();
    const stage   = document.getElementById('rider-stage').value.trim();
    const saccoId = document.getElementById('rider-sacco').value;
    const pin     = document.getElementById('rider-pin').value.trim();
    if (!name || !phone || !saccoId) return showMsg('rider-msg','All required fields must be filled.','error');
    await api('/api/riders', 'POST', { name, phone, stage, saccoId, pin });
    showMsg('rider-msg','✅ Rider registered!','success');
    setTimeout(() => { closeModal('modal-add-rider'); loadRiders(); }, 1200);
  } catch(err) { showMsg('rider-msg','❌ '+err.message,'error'); }
}

async function setRiderStatus(id, status) {
  try {
    await api(`/api/riders/${id}/status`, 'PUT', { status });
    loadRiders();
  } catch(err) { alert(err.message); }
}

async function viewRider(id) {
  try {
    const r = await api(`/api/riders/${id}`);
    const body = document.getElementById('rider-profile-body');

    body.innerHTML = `
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border)">
        <div style="width:56px;height:56px;background:var(--green);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:700">${r.name.charAt(0)}</div>
        <div>
          <div style="font-weight:800;font-size:1.1rem">${r.name}</div>
          <div style="color:var(--muted)">${r.phone} · ${r.saccoName}</div>
          <div style="margin-top:4px">${badge(r.status)}</div>
        </div>
      </div>

      <div class="profile-grid">
        <div class="profile-stat"><div class="val" style="color:var(--green2)">${ugx(r.totalSavings)}</div><div class="lbl">Total Savings</div></div>
        <div class="profile-stat"><div class="val" style="color:var(--gold)">${r.loans.filter(l=>l.status==='active'||l.status==='overdue').length}</div><div class="lbl">Active Loans</div></div>
        <div class="profile-stat"><div class="val">${r.savings.length}</div><div class="lbl">Deposits Made</div></div>
        <div class="profile-stat"><div class="val">${r.repayments.length}</div><div class="lbl">Repayments</div></div>
      </div>

      ${r.insights.length > 0 ? '<div style="margin-bottom:14px">' + r.insights.map(ins=>`<div class="insight ${ins.type}">💡 ${ins.text}</div>`).join('') + '</div>' : ''}

      <div style="margin-bottom:14px">
        <div style="font-weight:700;margin-bottom:8px;font-size:0.88rem">📋 Last 5 Deposits</div>
        ${r.savings.length === 0 ? '<p class="empty">No deposits yet.</p>' :
          `<table class="tbl"><thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Status</th></tr></thead><tbody>
          ${[...r.savings].reverse().slice(0,5).map(s=>`<tr>
            <td>${dtShort(s.date)}</td>
            <td>${ugx(s.amount)}</td>
            <td>${badge(s.method)}</td>
            <td>${s.reversed?'<span style="color:var(--red)">Reversed</span>':'<span style="color:var(--green2)">OK</span>'}</td>
          </tr>`).join('')}</tbody></table>`}
      </div>

      <div style="margin-bottom:14px">
        <div style="font-weight:700;margin-bottom:8px;font-size:0.88rem">🏦 Loans</div>
        ${r.loans.length === 0 ? '<p class="empty">No loans yet.</p>' :
          `<table class="tbl"><thead><tr><th>Date</th><th>Amount</th><th>Status</th><th>Due</th></tr></thead><tbody>
          ${r.loans.map(l=>`<tr>
            <td>${dtShort(l.createdAt)}</td>
            <td>${ugx(l.amount)}</td>
            <td>${badge(l.status)}</td>
            <td>${dtShort(l.dueDate)}</td>
          </tr>`).join('')}</tbody></table>`}
      </div>

      <div style="display:flex;gap:8px;margin-top:16px">
        <button class="btn-add" onclick="openMMForRider('${r.id}','${r.phone}')">📱 Mobile Money Deposit</button>
        <button class="btn-outline" onclick="closeModal('modal-rider-profile')">Close</button>
      </div>`;

    openModal('modal-rider-profile');
  } catch(err) { console.error(err); }
}

function openMMForRider(riderId, phone) {
  closeModal('modal-rider-profile');
  openModal('modal-mm-deposit');
  setTimeout(() => {
    document.getElementById('mm-rider').value = riderId;
    document.getElementById('mm-phone').value = phone;
  }, 100);
}

// ============================================================
// SAVINGS
// ============================================================
async function loadSavings() {
  try {
    const from = document.getElementById('sav-from')?.value || '';
    const to   = document.getElementById('sav-to')?.value || '';
    let url    = '/api/savings?';
    if (from) url += `from=${from}&`;
    if (to)   url += `to=${to}&`;

    const savings = await api(url);
    const el = document.getElementById('savings-table');
    if (!el) return;

    const total = savings.filter(s=>!s.reversed).reduce((sum,s)=>sum+s.amount,0);

    el.innerHTML = `<div style="padding:12px 16px;background:var(--surface2);border-bottom:1px solid var(--border);font-weight:700;color:var(--green2)">
      Total: ${ugx(total)} (${savings.filter(s=>!s.reversed).length} deposits)
    </div>` + (savings.length === 0 ? '<p class="empty">No deposits found.</p>' :
    `<table class="tbl">
      <thead><tr><th>Date</th><th>Rider</th><th>Phone</th><th>SACCO</th><th>Amount</th><th>Method</th><th>Ref</th><th>Status</th><th>Action</th></tr></thead>
      <tbody>${savings.map(s=>`<tr style="${s.reversed?'opacity:0.5':''}">
        <td>${dtShort(s.date)}</td>
        <td><strong>${s.riderName}</strong></td>
        <td>${s.riderPhone}</td>
        <td>${s.saccoName}</td>
        <td style="color:var(--green2)">${ugx(s.amount)}</td>
        <td>${badge(s.method)}</td>
        <td style="font-size:0.75rem;color:var(--muted)">${s.reference||'—'}</td>
        <td>${s.reversed?'<span style="color:var(--red)">Reversed</span>':'<span style="color:var(--green2)">✓ OK</span>'}</td>
        <td>${!s.reversed && ADMIN.role==='superadmin'?`<button class="btn-sm btn-reject" onclick="reverseDeposit('${s.id}')">↩ Reverse</button>`:'—'}</td>
      </tr>`).join('')}</tbody>
    </table>`);
  } catch(err) { console.error(err); }
}

async function addSaving() {
  try {
    const riderId = document.getElementById('sav-rider').value;
    const amount  = document.getElementById('sav-amount').value;
    const ref     = document.getElementById('sav-ref').value;
    if (!riderId || !amount) return showMsg('saving-msg','Select rider and enter amount.','error');
    await api('/api/savings','POST',{ riderId, amount, method:'cash', reference: ref });
    showMsg('saving-msg','✅ Deposit recorded!','success');
    document.getElementById('sav-amount').value = '';
    document.getElementById('sav-ref').value    = '';
    setTimeout(() => { closeModal('modal-add-saving'); loadSavings(); }, 1200);
  } catch(err) { showMsg('saving-msg','❌ '+err.message,'error'); }
}

async function reverseDeposit(id) {
  if (!confirm('Are you sure you want to reverse this deposit? This cannot be undone.')) return;
  try {
    await api(`/api/savings/${id}/reverse`,'PUT');
    loadSavings();
  } catch(err) { alert(err.message); }
}

// Mobile Money deposit
function selectNetwork(net) {
  SEL_NET = net;
  document.querySelectorAll('.mm-net').forEach(el => el.classList.remove('active'));
  document.getElementById('net-' + net).classList.add('active');
}

async function mmDeposit() {
  try {
    const riderId = document.getElementById('mm-rider').value;
    const phone   = document.getElementById('mm-phone').value.trim();
    const amount  = document.getElementById('mm-amount').value;
    if (!riderId || !phone || !amount) return showMsg('mm-msg','All fields required.','error');
    showMsg('mm-msg','⏳ Sending payment request...','info');
    const data = await api('/api/savings/mobilemoney','POST',{ riderId, amount, phone, network: SEL_NET });
    showMsg('mm-msg','✅ ' + data.message,'success');
    document.getElementById('mm-amount').value = '';
    setTimeout(() => { closeModal('modal-mm-deposit'); loadSavings(); }, 2000);
  } catch(err) { showMsg('mm-msg','❌ '+err.message,'error'); }
}

// ============================================================
// LOANS
// ============================================================
async function loadLoans() {
  try {
    const status = document.getElementById('loan-status-filter')?.value || '';
    const loans  = await api('/api/loans' + (status ? `?status=${status}` : ''));
    const el     = document.getElementById('loans-table');
    if (!el) return;

    el.innerHTML = loans.length === 0 ? '<p class="empty">No loans found.</p>' :
    `<table class="tbl">
      <thead><tr><th>Date</th><th>Rider</th><th>Phone</th><th>SACCO</th><th>Amount</th><th>Interest</th><th>Paid</th><th>Remaining</th><th>Due</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${loans.map(l=>`<tr>
        <td>${dtShort(l.createdAt)}</td>
        <td><strong>${l.riderName}</strong></td>
        <td>${l.riderPhone}</td>
        <td>${l.saccoName}</td>
        <td>${ugx(l.amount)}</td>
        <td>${pct(l.interestRate)}</td>
        <td style="color:var(--green2)">${ugx(l.totalPaid)}</td>
        <td style="color:${l.remaining>0?'var(--red)':'var(--green2)'}">${ugx(l.remaining)}</td>
        <td>${dtShort(l.dueDate)}</td>
        <td>${badge(l.status)}</td>
        <td style="display:flex;gap:4px;flex-wrap:wrap">
          ${l.status==='pending'?`
            <button class="btn-sm btn-approve" onclick="approveLoan('${l.id}')">✅ Approve</button>
            <button class="btn-sm btn-reject" onclick="rejectLoan('${l.id}')">❌ Reject</button>`:''}
          ${(l.status==='active'||l.status==='overdue')?`
            <button class="btn-sm btn-view" onclick="openRepay('${l.id}',${l.remaining})">💳 Repay</button>`:''}
        </td>
      </tr>`).join('')}</tbody>
    </table>`;
  } catch(err) { console.error(err); }
}

function previewLoan() {
  const amount   = parseFloat(document.getElementById('loan-amount').value || 0);
  const rate     = parseFloat(document.getElementById('loan-interest').value || 10);
  const months   = parseInt(document.getElementById('loan-months').value || 3);
  const interest = amount * rate / 100;
  const total    = amount + interest;
  const monthly  = total / months;
  const prev     = document.getElementById('loan-preview');
  prev.style.display = 'block';
  prev.innerHTML = `
    <strong>Loan Amount:</strong> ${ugx(amount)}<br/>
    <strong>Interest (${rate}%):</strong> ${ugx(interest)}<br/>
    <strong>Total Repayable:</strong> ${ugx(total)}<br/>
    <strong>Monthly Payment:</strong> ${ugx(monthly.toFixed(0))} over ${months} months`;
}

async function addLoan() {
  try {
    const riderId        = document.getElementById('loan-rider').value;
    const amount         = document.getElementById('loan-amount').value;
    const interestRate   = document.getElementById('loan-interest').value;
    const repaymentMonths = document.getElementById('loan-months').value;
    if (!riderId || !amount) return showMsg('loan-msg','Select rider and enter amount.','error');
    await api('/api/loans','POST',{ riderId, amount, interestRate, repaymentMonths });
    showMsg('loan-msg','✅ Loan request submitted!','success');
    setTimeout(() => { closeModal('modal-add-loan'); loadLoans(); }, 1200);
  } catch(err) { showMsg('loan-msg','❌ '+err.message,'error'); }
}

async function approveLoan(id) {
  try { await api(`/api/loans/${id}/approve`,'PUT'); loadLoans(); } catch(err) { alert(err.message); }
}
async function rejectLoan(id) {
  if (!confirm('Reject this loan?')) return;
  try { await api(`/api/loans/${id}/reject`,'PUT'); loadLoans(); } catch(err) { alert(err.message); }
}

function openRepay(loanId, remaining) {
  SEL_LOAN = loanId;
  document.getElementById('repay-loan-info').innerHTML =
    `<strong>Remaining Balance:</strong> ${ugx(remaining)}`;
  document.getElementById('repay-amount').value = '';
  openModal('modal-repay-loan');
}

async function submitRepayment() {
  try {
    const amount = document.getElementById('repay-amount').value;
    if (!amount) return showMsg('repay-msg','Enter repayment amount.','error');
    const data = await api(`/api/loans/${SEL_LOAN}/repay`,'POST',{ amount });
    showMsg('repay-msg',`✅ Repayment recorded! Remaining: ${ugx(data.remaining)}`,'success');
    setTimeout(() => { closeModal('modal-repay-loan'); loadLoans(); }, 1500);
  } catch(err) { showMsg('repay-msg','❌ '+err.message,'error'); }
}

// ============================================================
// REPORTS
// ============================================================
async function loadReports() {
  try {
    const period = document.getElementById('report-period')?.value || 'week';
    const rpt    = await api(`/api/reports/summary?period=${period}`);

    document.getElementById('report-stats').innerHTML = [
      { label:'Period Savings',   val: ugx(rpt.totalSavings),    color:'c-green' },
      { label:'Period Deposits',  val: rpt.totalDeposits,          color:'c-blue' },
      { label:'Loans Issued',     val: ugx(rpt.totalLoans),        color:'c-gold' },
      { label:'Repayment Rate',   val: pct(rpt.repaymentRate),     color:'c-teal' },
    ].map(s=>`<div class="stat-card ${s.color}">
      <div><div class="sc-label">${s.label}</div><div class="sc-val">${s.val}</div></div>
    </div>`).join('');

    document.getElementById('rpt-topSavers').innerHTML = rpt.topSavers.length === 0 ? '<p class="empty">No data.</p>' :
    `<table class="tbl"><thead><tr><th>#</th><th>Name</th><th>Total Savings</th></tr></thead><tbody>
    ${rpt.topSavers.map((s,i)=>`<tr><td>${i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}</td><td>${s.name}</td><td style="color:var(--green2)">${ugx(s.total)}</td></tr>`).join('')}</tbody></table>`;

    document.getElementById('rpt-defaulters').innerHTML = rpt.defaulters.length === 0 ? '<p class="empty">No defaulters 🎉</p>' :
    `<table class="tbl"><thead><tr><th>Rider</th><th>Loan</th><th>Remaining</th><th>Due</th></tr></thead><tbody>
    ${rpt.defaulters.map(d=>`<tr><td>${d.riderName}</td><td>${ugx(d.loanAmount)}</td><td style="color:var(--red)">${ugx(d.remaining)}</td><td>${dtShort(d.dueDate)}</td></tr>`).join('')}</tbody></table>`;

    document.getElementById('rpt-saccos').innerHTML = rpt.saccoComparison.length === 0 ? '<p class="empty">No SACCOs yet.</p>' :
    `<table class="tbl"><thead><tr><th>Rank</th><th>SACCO</th><th>Riders</th><th>Total Savings</th></tr></thead><tbody>
    ${rpt.saccoComparison.map((s,i)=>`<tr><td>${i===0?'🏆 #1':'#'+(i+1)}</td><td><strong>${s.name}</strong></td><td>${s.riders}</td><td style="color:var(--green2)">${ugx(s.savings)}</td></tr>`).join('')}</tbody></table>`;

  } catch(err) { console.error(err); }
}

function exportReport(type) {
  window.open(`/api/reports/export?type=${type}&token=${TOKEN}`, '_blank');
}

// ============================================================
// MESSAGES
// ============================================================
function toggleSaccoSelect() {
  const target = document.getElementById('msg-target').value;
  document.getElementById('sacco-select-field').style.display = target === 'sacco' ? 'block' : 'none';
}

function setTemplate(type) {
  const tpls = {
    reminder: 'Dear Rider, please remember to make your daily savings of at least UGX 2,000 today. Thank you for being part of BodaSACCO!',
    loan:     'Dear Rider, your loan repayment is due. Please make a payment to avoid penalties. Contact us for assistance. BodaSACCO Uganda.',
    congrats: 'Congratulations! You are one of our top savers this month. Keep up the great work! BodaSACCO Uganda salutes you. 🎉'
  };
  document.getElementById('msg-text').value = tpls[type] || '';
}

async function sendMessage() {
  try {
    const target  = document.getElementById('msg-target').value;
    const saccoId = document.getElementById('msg-sacco').value;
    const message = document.getElementById('msg-text').value.trim();
    if (!message) return showMsg('msg-result','Enter a message.','error');
    const data = await api('/api/messages','POST',{ target, saccoId, message });
    showMsg('msg-result', '✅ ' + data.message, 'success');
    document.getElementById('msg-text').value = '';
    loadMessages();
  } catch(err) { showMsg('msg-result','❌ '+err.message,'error'); }
}

async function loadMessages() {
  try {
    const msgs = await api('/api/messages');
    const el   = document.getElementById('msg-history');
    if (!el) return;
    el.innerHTML = msgs.length === 0 ? '<p class="empty">No messages sent yet.</p>' :
    `<table class="tbl"><thead><tr><th>Date</th><th>Sent To</th><th>Recipients</th><th>Message</th><th>By</th></tr></thead><tbody>
    ${msgs.map(m=>`<tr>
      <td>${dtShort(m.sentAt)}</td>
      <td><span class="badge b-pending">${m.target}</span></td>
      <td>${m.sentTo} riders</td>
      <td style="max-width:300px;font-size:0.8rem">${m.message}</td>
      <td>${m.sentBy}</td>
    </tr>`).join('')}</tbody></table>`;
  } catch(err) { console.error(err); }
}

// ============================================================
// SETTINGS
// ============================================================
async function loadSettings() {
  try {
    const s = await api('/api/settings');
    document.getElementById('set-minSavings').value   = s.minDailySavings;
    document.getElementById('set-interestRate').value  = s.defaultInterestRate;
    document.getElementById('set-eligMonths').value    = s.loanEligibilityMonths;
    document.getElementById('set-penalty').value       = s.latePenaltyPercent;
    document.getElementById('set-multiplier').value    = s.maxLoanMultiplier;

    const audit = await api('/api/audit');
    const el    = document.getElementById('audit-log');
    el.innerHTML = audit.length === 0 ? '<p class="empty">No audit entries.</p>' :
      audit.map(a=>`<div class="audit-item">
        <div class="audit-action">${a.action}</div>
        <div class="audit-detail">${a.details}</div>
        <div class="audit-time">${dt(a.timestamp)}<br/><span style="color:var(--green2)">${a.admin}</span></div>
      </div>`).join('');
  } catch(err) { console.error(err); }
}

async function saveSettings() {
  try {
    await api('/api/settings','PUT',{
      minDailySavings:      parseFloat(document.getElementById('set-minSavings').value),
      defaultInterestRate:  parseFloat(document.getElementById('set-interestRate').value),
      loanEligibilityMonths:parseInt(document.getElementById('set-eligMonths').value),
      latePenaltyPercent:   parseFloat(document.getElementById('set-penalty').value),
      maxLoanMultiplier:    parseFloat(document.getElementById('set-multiplier').value),
    });
    showMsg('settings-msg','✅ Settings saved!','success');
  } catch(err) { showMsg('settings-msg','❌ '+err.message,'error'); }
}

function onSaccoFilterChange() {
  const page = document.querySelector('.page.active')?.id?.replace('pg-','');
  if (page === 'riders')  loadRiders();
  if (page === 'savings') loadSavings();
  if (page === 'loans')   loadLoans();
}
