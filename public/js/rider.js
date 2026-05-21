// ============================================================
// BodaSACCO Rider Portal — JavaScript
// Performance optimised: caching, debouncing, lazy loading
// ============================================================

let RIDER_TOKEN    = null;
let RIDER_INFO     = null;
let SEL_NET        = 'mtn';
let SEL_PAY_METHOD = 'mtn';
let DASH_DATA      = null;
let ACTIVE_LOAN    = null;
let ALL_SAVINGS    = [];
let ALL_LOANS      = [];
let NOTIF_MSGS     = [];
let NOTIF_INDEX    = 0;
let NOTIF_TIMER    = null;
let CACHE          = {};       // Simple response cache
let CACHE_TTL      = 30000;   // Cache expires after 30 seconds

// ============================================================
// PERFORMANCE: Cached API calls — reduces server load
// Same request within 30s returns cached result
// ============================================================
async function rapi(url, method = 'GET', body = null, useCache = false) {
  const cacheKey = url + method;

  // Return cached result if fresh (GET requests only)
  if (useCache && method === 'GET' && CACHE[cacheKey]) {
    const { data, ts } = CACHE[cacheKey];
    if (Date.now() - ts < CACHE_TTL) return data;
  }

  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'x-rider-token': RIDER_TOKEN || '' }
  };
  if (body) opts.body = JSON.stringify(body);

  const res  = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');

  // Cache successful GET responses
  if (useCache && method === 'GET') CACHE[cacheKey] = { data, ts: Date.now() };
  return data;
}

// Clear cache for a URL (called after writes)
function clearCache(url) { Object.keys(CACHE).forEach(k => { if (k.startsWith(url)) delete CACHE[k]; }); }

// ============================================================
// HELPERS
// ============================================================
function ugx(n)  { return 'UGX ' + Number(n || 0).toLocaleString(); }
function dt(iso) { return new Date(iso).toLocaleDateString('en-UG', { day:'2-digit', month:'short', year:'numeric' }); }
function dtFull(iso) { return new Date(iso).toLocaleString('en-UG', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }); }

function showMsg(id, text, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className   = 'rmsg ' + type;
}

function clearMsg(id) {
  const el = document.getElementById(id);
  if (el) { el.textContent = ''; el.className = 'rmsg'; }
}

// ============================================================
// AUTH TAB SWITCHER
// ============================================================
function showAuthTab(tab) {
  document.querySelectorAll('.aform').forEach(f => f.classList.remove('active'));
  document.querySelectorAll('.atab').forEach(b => b.classList.remove('active'));
  document.getElementById('form-' + tab).classList.add('active');
  document.getElementById('tab-' + (tab === 'login' ? 'login' : 'reg') + '-btn').classList.add('active');
  const msg = document.getElementById('auth-msg');
  msg.textContent = ''; msg.className = 'rmsg';
}

// ============================================================
// LOAD SACCOs FOR DROPDOWN
// ============================================================
async function loadSaccos() {
  try {
    const saccos = await rapi('/api/rider/saccos', 'GET', null, true);
    const sel    = document.getElementById('r-sacco');
    sel.innerHTML = '<option value="">-- Select your SACCO --</option>';
    saccos.forEach(s => sel.innerHTML += `<option value="${s.id}">${s.name} — ${s.location}</option>`);
  } catch(e) {
    document.getElementById('r-sacco').innerHTML = '<option value="">No SACCOs available yet</option>';
  }
}

// ============================================================
// REGISTER
// ============================================================
async function riderRegister() {
  const name       = document.getElementById('r-name').value.trim();
  const phone      = document.getElementById('r-phone').value.trim();
  const stage      = document.getElementById('r-stage').value.trim();
  const nationalId = document.getElementById('r-nid') ? document.getElementById('r-nid').value.trim() : '';
  const saccoId    = document.getElementById('r-sacco').value;
  const pin        = document.getElementById('r-pin').value.trim();

  if (!name || !phone || !saccoId || !pin || !nationalId)
    return showMsg('auth-msg', 'All fields including National ID are required.', 'error');
  if (pin.length !== 4 || isNaN(pin))
    return showMsg('auth-msg', 'PIN must be exactly 4 digits.', 'error');

  try {
    showMsg('auth-msg', '⏳ Submitting registration...', 'info');
    const data = await rapi('/api/rider/register', 'POST', { name, phone, stage, nationalId, saccoId, pin });
    showMsg('auth-msg', '✅ ' + data.message, 'success');
    ['r-name','r-phone','r-stage','r-nid','r-pin'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    setTimeout(() => showAuthTab('login'), 3000);
  } catch(err) { showMsg('auth-msg', '❌ ' + err.message, 'error'); }
}

// FIX #3 — Auto session timeout (30 mins)
let sessionTimer = null;
let warningTimer = null;
function startSessionTimer() {
  clearTimeout(sessionTimer);
  clearTimeout(warningTimer);
  warningTimer = setTimeout(() => {
    if (RIDER_TOKEN) {
      const bar = document.getElementById('notif-bar');
      const text = document.getElementById('notif-text');
      if (bar && text) {
        bar.style.background = '#7a4f0f';
        bar.style.display = 'block';
        text.textContent = '⚠️ Your session expires in 5 minutes. Click anywhere to stay logged in.';
      }
    }
  }, 25 * 60 * 1000);
  sessionTimer = setTimeout(() => {
    if (RIDER_TOKEN) {
      alert('Session expired due to inactivity. Please login again.');
      riderLogout();
    }
  }, 30 * 60 * 1000);
}
document.addEventListener('click',    () => { if (RIDER_TOKEN) startSessionTimer(); });
document.addEventListener('keypress', () => { if (RIDER_TOKEN) startSessionTimer(); });

// ============================================================
// LOGIN
// ============================================================
async function riderLogin() {
  const phone = document.getElementById('l-phone').value.trim();
  const pin   = document.getElementById('l-pin').value.trim();
  if (!phone || !pin) return showMsg('auth-msg', 'Enter phone and PIN.', 'error');

  try {
    showMsg('auth-msg', '⏳ Signing in...', 'info');
    const data  = await rapi('/api/rider/login', 'POST', { phone, pin });
    RIDER_TOKEN = data.token;
    RIDER_INFO  = data.rider;

    // Update sidebar profile
    document.getElementById('sb-rider-name').textContent = RIDER_INFO.name;
    document.getElementById('sb-sacco-name').textContent  = RIDER_INFO.saccoName;
    document.getElementById('sb-avatar').textContent      = RIDER_INFO.name.charAt(0).toUpperCase();

    // Update topbar date
    document.getElementById('topbar-date').textContent =
      new Date().toLocaleDateString('en-UG', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

    // Switch pages
    document.getElementById('auth-page').classList.remove('active');
    document.getElementById('dashboard-page').classList.add('active');

    // Load data and start notifications
    await loadDashboard();
    startNotifications();
    startSessionTimer();

  } catch(err) { showMsg('auth-msg', '❌ ' + err.message, 'error'); }
}

// Enter key on login fields
document.addEventListener('DOMContentLoaded', () => {
  loadSaccos();
  ['l-phone','l-pin'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') riderLogin(); });
  });
});

// ============================================================
// LOGOUT
// ============================================================
async function riderLogout() {
  stopNotifications();
  CACHE = {}; // Clear all cache on logout
  try { await rapi('/api/rider/logout', 'POST'); } catch(e) {}
  RIDER_TOKEN = null; RIDER_INFO = null; DASH_DATA = null;
  document.getElementById('dashboard-page').classList.remove('active');
  document.getElementById('auth-page').classList.add('active');
  document.getElementById('l-pin').value = '';
  showAuthTab('login');
}

// ============================================================
// TAB NAVIGATION — lazy loads data per tab
// ============================================================
function showTab(tab) {
  document.querySelectorAll('.rtab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.sb-btn').forEach(b => b.classList.remove('active'));

  document.getElementById('rtab-' + tab).classList.add('active');
  document.querySelectorAll('.sb-btn').forEach(btn => {
    if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes("'" + tab + "'"))
      btn.classList.add('active');
  });

  const titles = { home:'Home', savings:'Savings', loans:'Loans', receipts:'Receipts', messages:'Messages', support:'Support' };
  document.getElementById('topbar-title').textContent = titles[tab] || tab;

  // Lazy load tab data
  if (tab === 'savings')  loadSavingsTab();
  if (tab === 'loans')    loadLoansTab();
  if (tab === 'receipts') loadReceipts();
  if (tab === 'messages') loadMessages();
}

// ============================================================
// NOTIFICATION SLIDESHOW — 5 second rotation
// ============================================================
function startNotifications() {
  NOTIF_MSGS = [
    '💰 Remember to save today — small savings build big futures!',
    '🏍️ Welcome to BodaSACCO — your financial home.',
    '📅 Regular savings increase your loan eligibility!',
    '📱 Deposit via MTN MoMo or Airtel Money anytime.',
    '🎯 Consistent savers get priority loan approval.',
    '🧾 Download receipts for all your transactions in the Receipts tab.',
  ];
  if (DASH_DATA && DASH_DATA.insights) {
    DASH_DATA.insights.forEach(ins => NOTIF_MSGS.unshift('💡 ' + ins.text));
  }
  showNextNotif();
  NOTIF_TIMER = setInterval(showNextNotif, 5000);
}

function showNextNotif() {
  if (!NOTIF_MSGS.length) return;
  const bar  = document.getElementById('notif-bar');
  const text = document.getElementById('notif-text');
  bar.style.display = 'block';
  text.style.animation = 'none';
  text.offsetHeight;
  text.style.animation = 'nslide 0.4s ease';
  text.textContent = NOTIF_MSGS[NOTIF_INDEX % NOTIF_MSGS.length];
  NOTIF_INDEX++;
}

function stopNotifications() {
  if (NOTIF_TIMER) clearInterval(NOTIF_TIMER);
  NOTIF_TIMER = null;
}

function closeNotifBar() {
  document.getElementById('notif-bar').style.display = 'none';
  stopNotifications();
}

// ============================================================
// LOAD DASHBOARD — main data fetch
// ============================================================
async function loadDashboard() {
  try {
    // Parallel fetches for speed
    [DASH_DATA, ALL_SAVINGS, ALL_LOANS] = await Promise.all([
      rapi('/api/rider/dashboard', 'GET', null, true),
      rapi('/api/rider/savings',   'GET', null, true),
      rapi('/api/rider/loans',     'GET', null, true),
    ]);

    const d = DASH_DATA;

    // Greeting
    document.getElementById('greet-name').textContent  = d.rider.name.split(' ')[0];
    document.getElementById('greet-sacco').textContent = d.rider.saccoName;

    // Weekly total
    const weekAgo    = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const weekTotal  = ALL_SAVINGS.filter(s => new Date(s.date) >= weekAgo).reduce((sum, s) => sum + s.amount, 0);

    // Active loan
    ACTIVE_LOAN = ALL_LOANS.find(l => l.status === 'active' || l.status === 'overdue');

    // Stat cards
    document.getElementById('hm-savings').textContent      = ugx(d.totalSavings);
    document.getElementById('hm-savings-sub').textContent  = d.savingsCount + ' deposits made';
    document.getElementById('hm-loanbal').textContent      = ACTIVE_LOAN ? ugx(ACTIVE_LOAN.remaining) : 'None';
    document.getElementById('hm-loan-sub').textContent     = ACTIVE_LOAN ? 'Remaining balance' : 'No active loan';
    document.getElementById('hm-weekdeposits').textContent = ugx(weekTotal);
    document.getElementById('hm-paidloans').textContent    = d.paidLoans;

    // Loan progress
    if (ACTIVE_LOAN) {
      const lp = ACTIVE_LOAN;
      document.getElementById('loan-progress-section').style.display = 'block';
      document.getElementById('lp-amount').textContent    = ugx(lp.amount);
      document.getElementById('lp-total').textContent     = ugx(lp.totalRepayable);
      document.getElementById('lp-paid').textContent      = ugx(lp.paid);
      document.getElementById('lp-remaining').textContent = ugx(lp.remaining);
      document.getElementById('lp-due').textContent       = dt(lp.dueDate);
      document.getElementById('lp-monthly').textContent   = ugx(Math.ceil(lp.totalRepayable / lp.repaymentMonths));
      document.getElementById('lp-bar').style.width       = lp.progress + '%';
      document.getElementById('lp-pct').textContent       = lp.progress + '% repaid';
      const badge = document.getElementById('lp-status-badge');
      badge.textContent  = lp.status;
      badge.className    = 'status-badge ' + lp.status;
    } else {
      document.getElementById('loan-progress-section').style.display = 'none';
    }

    // Insights
    document.getElementById('insights-section').innerHTML = d.insights.map(ins =>
      `<div class="insight-item ${ins.type}">💡 ${ins.text}</div>`
    ).join('');

    // Chart (defer to not block render)
    setTimeout(() => drawChart(d.savingsTrend), 100);

    // Recent transactions
    const txEl   = document.getElementById('recent-txns');
    const recent = [...ALL_SAVINGS].reverse().slice(0, 5);
    txEl.innerHTML = recent.length === 0
      ? '<p class="empty-state">No transactions yet.</p>'
      : recent.map(s => `
          <div class="txn-item">
            <div class="txn-left">
              <div class="txn-icon dep">💰</div>
              <div>
                <div class="txn-type">Savings Deposit</div>
                <div class="txn-sub">${(s.method || 'cash').toUpperCase()} · ${s.reference || '—'}</div>
              </div>
            </div>
            <div>
              <div class="txn-amount">${ugx(s.amount)}</div>
              <div class="txn-date">${dt(s.date)}</div>
            </div>
          </div>`).join('');

    // Update savings tab summary
    document.getElementById('sav-total').textContent    = ugx(d.totalSavings);
    document.getElementById('sav-week').textContent     = ugx(weekTotal);
    document.getElementById('sav-count').textContent    = d.savingsCount;
    document.getElementById('sav-max-loan').textContent = ugx(d.maxLoan);

    // Loan rules
    if (d.settings) {
      document.getElementById('rule-rate').textContent = d.settings.defaultInterestRate + '% flat';
      document.getElementById('rule-max').textContent  = d.settings.maxLoanMultiplier + '× your savings';
    }

  } catch(err) { console.error('Dashboard error:', err); }
}

// ============================================================
// SAVINGS CHART — lightweight canvas drawing
// ============================================================
function drawChart(trend) {
  const canvas = document.getElementById('riderChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w   = canvas.offsetWidth || 400;
  const h   = 170;
  canvas.width  = w;
  canvas.height = h;

  const max  = Math.max(...trend.map(t => t.total), 1);
  const bw   = (w - 48) / trend.length;
  ctx.clearRect(0, 0, w, h);

  trend.forEach((t, i) => {
    const barH = t.total > 0 ? Math.max((t.total / max) * (h - 44), 4) : 4;
    const x    = 24 + i * bw + bw * 0.18;
    const y    = h - 28 - barH;
    const bww  = bw * 0.64;

    // Bar shadow
    ctx.shadowColor   = 'rgba(26,107,60,0.15)';
    ctx.shadowBlur    = 6;
    ctx.shadowOffsetY = 2;

    // Bar fill
    const grad = ctx.createLinearGradient(0, y, 0, y + barH);
    grad.addColorStop(0, t.total > 0 ? '#25a65a' : '#d4edda');
    grad.addColorStop(1, t.total > 0 ? '#1a6b3c' : '#e8f5ec');
    ctx.fillStyle = grad;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, bww, barH, [4,4,0,0]);
    else ctx.rect(x, y, bww, barH);
    ctx.fill();

    ctx.shadowColor = 'transparent';

    // Label
    ctx.fillStyle = '#6b7a6a';
    ctx.font      = '11px DM Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(t.label, x + bww / 2, h - 10);

    // Value
    if (t.total > 0) {
      ctx.fillStyle = '#1a6b3c';
      ctx.font      = 'bold 10px DM Sans, sans-serif';
      ctx.fillText(Number(t.total).toLocaleString(), x + bww / 2, y - 5);
    }
  });
}

// ============================================================
// SAVINGS TAB
// ============================================================
function selectRNet(net) {
  SEL_NET = net;
  document.querySelectorAll('.net-tab').forEach(el => el.classList.remove('active'));
  document.getElementById('rnet-' + net).classList.add('active');
}

function loadSavingsTab() {
  if (!DASH_DATA) return;
  const weekAgo   = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weekTotal = ALL_SAVINGS.filter(s => new Date(s.date) >= weekAgo).reduce((sum, s) => sum + s.amount, 0);
  document.getElementById('sav-total').textContent    = ugx(DASH_DATA.totalSavings);
  document.getElementById('sav-week').textContent     = ugx(weekTotal);
  document.getElementById('sav-count').textContent    = DASH_DATA.savingsCount;
  document.getElementById('sav-max-loan').textContent = ugx(DASH_DATA.maxLoan);
}

async function cashDeposit() {
  const amount = document.getElementById('cash-amount').value;
  if (!amount || amount <= 0) return showMsg('cash-msg', 'Enter a valid amount.', 'error');
  try {
    showMsg('cash-msg', '⏳ Recording deposit...', 'info');
    const data = await rapi('/api/rider/deposit', 'POST', { amount, method: 'cash' });
    showMsg('cash-msg', '✅ ' + data.message, 'success');
    document.getElementById('cash-amount').value = '';
    clearCache('/api/rider'); // Invalidate cache
    await loadDashboard();
  } catch(err) { showMsg('cash-msg', '❌ ' + err.message, 'error'); }
}

async function mmDeposit() {
  const phone  = document.getElementById('mm-phone').value.trim();
  const amount = document.getElementById('mm-amount').value;
  if (!phone || !amount) return showMsg('mm-msg', 'Enter phone and amount.', 'error');
  try {
    showMsg('mm-msg', '⏳ Sending payment request...', 'info');
    const data = await rapi('/api/rider/deposit', 'POST', { amount, method: SEL_NET, phone });
    showMsg('mm-msg', '✅ ' + data.message, 'success');
    document.getElementById('mm-amount').value = '';
    clearCache('/api/rider');
    await loadDashboard();
  } catch(err) { showMsg('mm-msg', '❌ ' + err.message, 'error'); }
}

// ============================================================
// LOANS TAB
// ============================================================
async function loadLoansTab() {
  try {
    ALL_LOANS   = await rapi('/api/rider/loans', 'GET', null, true);
    ACTIVE_LOAN = ALL_LOANS.find(l => l.status === 'active' || l.status === 'overdue');

    // Repay section
    const repaySection = document.getElementById('repay-section');
    if (ACTIVE_LOAN) {
      repaySection.style.display = 'block';
      document.getElementById('repay-loan-summary').innerHTML = `
        <strong>Loan Amount:</strong> ${ugx(ACTIVE_LOAN.amount)}<br/>
        <strong>Interest Rate:</strong> ${ACTIVE_LOAN.interestRate}%<br/>
        <strong>Total Repayable:</strong> ${ugx(ACTIVE_LOAN.totalRepayable)}<br/>
        <strong>Amount Paid:</strong> ${ugx(ACTIVE_LOAN.paid)}<br/>
        <strong>Remaining Balance:</strong> ${ugx(ACTIVE_LOAN.remaining)}<br/>
        <strong>Due Date:</strong> ${dt(ACTIVE_LOAN.dueDate)}
        ${ACTIVE_LOAN.status === 'overdue' ? '<br/><span style="color:var(--red);font-weight:700">⚠️ This loan is OVERDUE!</span>' : ''}
      `;
    } else {
      repaySection.style.display = 'none';
    }

    // All loans table
    const el = document.getElementById('all-loans-list');
    el.innerHTML = ALL_LOANS.length === 0
      ? '<p class="empty-state">No loans yet. Request your first loan below!</p>'
      : `<div style="overflow-x:auto"><table class="loan-table">
          <thead><tr><th>Date</th><th>Amount</th><th>Total</th><th>Paid</th><th>Remaining</th><th>Progress</th><th>Status</th></tr></thead>
          <tbody>${ALL_LOANS.map(l => `<tr>
            <td>${dt(l.createdAt)}</td>
            <td>${ugx(l.amount)}</td>
            <td>${ugx(l.totalRepayable)}</td>
            <td style="color:var(--green);font-weight:600">${ugx(l.paid)}</td>
            <td style="color:${l.remaining > 0 ? 'var(--red)' : 'var(--green)'};font-weight:600">${ugx(l.remaining)}</td>
            <td>
              <div style="background:#e8f5ec;border-radius:10px;height:6px;width:70px;overflow:hidden">
                <div style="background:var(--green);height:100%;width:${l.progress}%;border-radius:10px"></div>
              </div>
              <div style="font-size:0.7rem;color:var(--muted);margin-top:2px">${l.progress}%</div>
            </td>
            <td><span class="badge b-${l.status}">${l.status}</span></td>
          </tr>`).join('')}</tbody>
        </table></div>`;
  } catch(err) { console.error(err); }
}

// Payment method for repayment
function selectPayMethod(method) {
  SEL_PAY_METHOD = method;
  document.querySelectorAll('.pay-method').forEach(el => el.classList.remove('active'));
  document.getElementById('pm-' + method).classList.add('active');
  ['mtn','airtel','cash'].forEach(m => {
    const el = document.getElementById('repay-' + m + '-fields');
    if (el) el.style.display = m === method ? 'block' : 'none';
  });
}

async function repayLoan() {
  if (!ACTIVE_LOAN) return showMsg('repay-msg', 'No active loan found.', 'error');
  const amount = document.getElementById('repay-amount').value;
  if (!amount || amount <= 0) return showMsg('repay-msg', 'Enter repayment amount.', 'error');

  let phone = '';
  if (SEL_PAY_METHOD === 'mtn') {
    phone = document.getElementById('repay-mtn-phone').value.trim();
    if (!phone) return showMsg('repay-msg', 'Enter your MTN phone number.', 'error');
  } else if (SEL_PAY_METHOD === 'airtel') {
    phone = document.getElementById('repay-airtel-phone').value.trim();
    if (!phone) return showMsg('repay-msg', 'Enter your Airtel phone number.', 'error');
  }

  try {
    showMsg('repay-msg', '⏳ Processing repayment...', 'info');
    const data = await rapi('/api/rider/loan/repay', 'POST', {
      loanId: ACTIVE_LOAN.id, amount, method: SEL_PAY_METHOD, phone
    });
    showMsg('repay-msg', '✅ ' + data.message, 'success');
    document.getElementById('repay-amount').value = '';
    clearCache('/api/rider');
    await Promise.all([loadDashboard(), loadLoansTab()]);
  } catch(err) { showMsg('repay-msg', '❌ ' + err.message, 'error'); }
}

function previewLoan() {
  const amount   = parseFloat(document.getElementById('ln-amount').value || 0);
  const months   = parseInt(document.getElementById('ln-months').value || 3);
  const rate     = DASH_DATA ? DASH_DATA.settings.defaultInterestRate : 10;
  const interest = amount * rate / 100;
  const total    = amount + interest;
  const monthly  = total / months;
  const prev     = document.getElementById('loan-preview');
  if (amount <= 0) { prev.style.display = 'none'; return; }
  prev.style.display = 'block';
  prev.innerHTML = `
    <strong>Loan Amount:</strong> ${ugx(amount)}<br/>
    <strong>Interest (${rate}%):</strong> ${ugx(interest)}<br/>
    <strong>Total Repayable:</strong> ${ugx(total)}<br/>
    <strong>Monthly Payment:</strong> ${ugx(Math.ceil(monthly))} × ${months} months<br/>
    <strong>Estimated Due:</strong> ${new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-UG', { month:'long', year:'numeric' })}
  `;
}

async function requestLoan() {
  if (ACTIVE_LOAN) return showMsg('loan-req-msg', 'You already have an active loan. Repay it first.', 'error');
  const amount = document.getElementById('ln-amount').value;
  const months = document.getElementById('ln-months').value;
  if (!amount || amount <= 0) return showMsg('loan-req-msg', 'Enter a valid loan amount.', 'error');
  try {
    showMsg('loan-req-msg', '⏳ Submitting loan request...', 'info');
    const data = await rapi('/api/rider/loan/request', 'POST', { amount, repaymentMonths: months });
    showMsg('loan-req-msg', '✅ ' + data.message, 'success');
    document.getElementById('ln-amount').value = '';
    document.getElementById('loan-preview').style.display = 'none';
    clearCache('/api/rider');
    await loadLoansTab();
  } catch(err) { showMsg('loan-req-msg', '❌ ' + err.message, 'error'); }
}

// ============================================================
// RECEIPTS — lazy loaded
// ============================================================
async function loadReceipts() {
  try {
    const savings = await rapi('/api/rider/savings', 'GET', null, true);
    const el      = document.getElementById('receipts-list');
    if (savings.length === 0) {
      el.innerHTML = '<p class="empty-state">No receipts yet. Make your first deposit!</p>';
      return;
    }
    window._receipts = savings;
    el.innerHTML = savings.map((s, i) => `
      <div class="receipt-item" onclick="viewReceipt(${i})">
        <div class="ri-left">
          <div class="ri-icon dep">💰</div>
          <div>
            <div class="ri-title">Savings Deposit</div>
            <div class="ri-sub">${(s.method || 'cash').toUpperCase()} · ${s.reference || 'N/A'}</div>
          </div>
        </div>
        <div>
          <div class="ri-amount">${ugx(s.amount)}</div>
          <div class="ri-date">${dt(s.date)}</div>
        </div>
      </div>`).join('');
  } catch(err) { console.error(err); }
}

function viewReceipt(idx) {
  const item = window._receipts[idx];
  if (!item) return;
  const refNum = item.reference || ('RCP-' + item.id);
  document.getElementById('receipt-content').innerHTML = `
    <div class="receipt-body">
      <div class="receipt-row"><span class="rl">Receipt No.</span><span class="rv">${refNum}</span></div>
      <div class="receipt-row"><span class="rl">Date & Time</span><span class="rv">${dtFull(item.date)}</span></div>
      <div class="receipt-row"><span class="rl">Rider Name</span><span class="rv">${RIDER_INFO ? RIDER_INFO.name : '—'}</span></div>
      <div class="receipt-row"><span class="rl">SACCO</span><span class="rv">${RIDER_INFO ? RIDER_INFO.saccoName : '—'}</span></div>
      <div class="receipt-row"><span class="rl">Transaction</span><span class="rv">Savings Deposit</span></div>
      <div class="receipt-row"><span class="rl">Payment Method</span><span class="rv">${(item.method || 'cash').toUpperCase()}</span></div>
      <div class="receipt-total">
        <div class="receipt-total-lbl">Amount</div>
        <div class="receipt-total-val">${ugx(item.amount)}</div>
      </div>
      <div class="receipt-ref">Ref: ${refNum} · BodaSACCO Uganda</div>
    </div>`;
  document.getElementById('receipt-modal').classList.add('open');
}

function closeReceipt() { document.getElementById('receipt-modal').classList.remove('open'); }
function printReceipt()  { window.print(); }

// ============================================================
// MESSAGES
// ============================================================
async function loadMessages() {
  try {
    const msgs  = await rapi('/api/messages', 'GET', null, true);
    const el    = document.getElementById('messages-list');
    const myMsgs = msgs.filter(m =>
      m.target === 'all' ||
      (m.target === 'sacco' && RIDER_INFO && m.saccoId === RIDER_INFO.saccoId)
    );

    // Update badge
    const badge = document.getElementById('msg-badge');
    if (myMsgs.length > 0) { badge.style.display = 'inline'; badge.textContent = myMsgs.length; }

    // Add to notifications
    myMsgs.forEach(m => {
      const line = '📢 ' + m.message;
      if (!NOTIF_MSGS.includes(line)) NOTIF_MSGS.unshift(line);
    });

    el.innerHTML = myMsgs.length === 0
      ? '<p class="empty-state">No messages from your SACCO yet.</p>'
      : myMsgs.map((m, i) => `
          <div class="msg-item ${i < 2 ? 'unread' : ''}">
            <div class="msg-dot ${i < 2 ? 'new' : 'read'}"></div>
            <div>
              <div class="msg-title">${m.target === 'all' ? '📢 Broadcast' : '🏢 SACCO Message'}</div>
              <div class="msg-text">${m.message}</div>
              <div class="msg-time">${dtFull(m.sentAt)} · ${m.sentBy}</div>
            </div>
          </div>`).join('');
  } catch(err) { console.error(err); }
}

// ============================================================
// SUPPORT
// ============================================================
async function sendSupportMessage() {
  const subject = document.getElementById('sup-subject').value;
  const message = document.getElementById('sup-message').value.trim();
  if (!subject || !message) return showMsg('sup-msg', 'Select a subject and write your message.', 'error');
  try {
    showMsg('sup-msg', '⏳ Sending...', 'info');
    await new Promise(r => setTimeout(r, 800));
    showMsg('sup-msg', '✅ Message sent! We will respond within 24 hours.', 'success');
    document.getElementById('sup-message').value = '';
    document.getElementById('sup-subject').value = '';
    console.log(`[SUPPORT] ${RIDER_INFO.name} (${RIDER_INFO.phone}) | ${subject}: ${message}`);
  } catch(err) { showMsg('sup-msg', '❌ Failed. Please call us directly.', 'error'); }
}

function toggleFaq(el) {
  const isOpen = el.classList.contains('open');
  document.querySelectorAll('.faq-item').forEach(f => f.classList.remove('open'));
  if (!isOpen) el.classList.add('open');
}
