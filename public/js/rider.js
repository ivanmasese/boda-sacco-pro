// ============================================================
// BodaSACCO Rider Portal — JavaScript
// ============================================================

let RIDER_TOKEN = null;
let RIDER_INFO  = null;
let SEL_NET     = 'mtn';
let DASH_DATA   = null;

// ============================================================
// API HELPER
// ============================================================
async function rapi(url, method = 'GET', body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'x-rider-token': RIDER_TOKEN || '' }
  };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

// ============================================================
// HELPERS
// ============================================================
function ugx(n)  { return 'UGX ' + Number(n || 0).toLocaleString(); }
function dt(iso) { return new Date(iso).toLocaleDateString('en-UG', { day:'2-digit', month:'short', year:'numeric' }); }

function showMsg(id, text, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = 'rmsg ' + type;
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
  document.getElementById('auth-msg').textContent = '';
  document.getElementById('auth-msg').className = 'rmsg';
}

// ============================================================
// LOAD SACCOs INTO REGISTER DROPDOWN
// ============================================================
async function loadSaccos() {
  try {
    const saccos = await rapi('/api/rider/saccos');
    const sel    = document.getElementById('r-sacco');
    sel.innerHTML = '<option value="">-- Select your SACCO --</option>';
    saccos.forEach(s => {
      sel.innerHTML += `<option value="${s.id}">${s.name} — ${s.location}</option>`;
    });
  } catch(e) {
    document.getElementById('r-sacco').innerHTML = '<option value="">No SACCOs available yet</option>';
  }
}

// ============================================================
// REGISTER
// ============================================================
async function riderRegister() {
  const name    = document.getElementById('r-name').value.trim();
  const phone   = document.getElementById('r-phone').value.trim();
  const stage   = document.getElementById('r-stage').value.trim();
  const saccoId = document.getElementById('r-sacco').value;
  const pin     = document.getElementById('r-pin').value.trim();

  if (!name || !phone || !saccoId || !pin)
    return showMsg('auth-msg', 'Please fill in all fields.', 'error');
  if (pin.length !== 4 || isNaN(pin))
    return showMsg('auth-msg', 'PIN must be exactly 4 digits.', 'error');

  try {
    showMsg('auth-msg', '⏳ Submitting registration...', 'info');
    const data = await rapi('/api/rider/register', 'POST', { name, phone, stage, saccoId, pin });
    showMsg('auth-msg', '✅ ' + data.message, 'success');
    // Clear form
    ['r-name','r-phone','r-stage','r-pin'].forEach(id => document.getElementById(id).value = '');
    setTimeout(() => showAuthTab('login'), 2500);
  } catch(err) {
    showMsg('auth-msg', '❌ ' + err.message, 'error');
  }
}

// ============================================================
// LOGIN
// ============================================================
async function riderLogin() {
  const phone = document.getElementById('l-phone').value.trim();
  const pin   = document.getElementById('l-pin').value.trim();

  if (!phone || !pin)
    return showMsg('auth-msg', 'Enter your phone number and PIN.', 'error');

  try {
    showMsg('auth-msg', '⏳ Signing in...', 'info');
    const data  = await rapi('/api/rider/login', 'POST', { phone, pin });
    RIDER_TOKEN = data.token;
    RIDER_INFO  = data.rider;

    // Update navbar
    document.getElementById('rn-name').textContent   = RIDER_INFO.name;
    document.getElementById('rn-sacco').textContent  = RIDER_INFO.saccoName;
    document.getElementById('rn-avatar').textContent = RIDER_INFO.name.charAt(0).toUpperCase();

    // Switch to dashboard
    document.getElementById('auth-page').classList.remove('active');
    document.getElementById('dashboard-page').classList.add('active');

    // Set greeting date
    document.getElementById('greeting-date').textContent =
      new Date().toLocaleDateString('en-UG', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

    // Load dashboard
    await loadDashboard();

  } catch(err) {
    showMsg('auth-msg', '❌ ' + err.message, 'error');
  }
}

// Enter key support
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
  try { await rapi('/api/rider/logout', 'POST'); } catch(e) {}
  RIDER_TOKEN = null;
  RIDER_INFO  = null;
  document.getElementById('dashboard-page').classList.remove('active');
  document.getElementById('auth-page').classList.add('active');
  document.getElementById('l-pin').value = '';
  showAuthTab('login');
}

// ============================================================
// TAB NAVIGATION
// ============================================================
function showTab(tab) {
  document.querySelectorAll('.rtab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.rn-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('rtab-' + tab).classList.add('active');
  document.querySelectorAll('.rn-tab').forEach(btn => {
    if (btn.getAttribute('onclick').includes(tab)) btn.classList.add('active');
  });

  // Load data for tabs
  if (tab === 'savings') loadSavingsTab();
  if (tab === 'loans')   loadLoansTab();
  if (tab === 'history') loadHistory();
}

// ============================================================
// LOAD DASHBOARD
// ============================================================
async function loadDashboard() {
  try {
    DASH_DATA = await rapi('/api/rider/dashboard');
    const d   = DASH_DATA;

    // Greeting
    document.getElementById('greet-name').textContent  = d.rider.name.split(' ')[0];
    document.getElementById('greet-sacco').textContent = d.rider.saccoName;

    // Balance cards
    document.getElementById('hm-savings').textContent   = ugx(d.totalSavings);
    document.getElementById('hm-maxloan').textContent   = ugx(d.maxLoan);
    document.getElementById('hm-count').textContent     = d.savingsCount + ' deposits';
    document.getElementById('hm-paidloans').textContent = d.paidLoans + ' loans';

    // Loan progress
    if (d.loanProgress) {
      const lp = d.loanProgress;
      document.getElementById('loan-progress-section').style.display = 'block';
      document.getElementById('lp-amount').textContent    = ugx(lp.amount);
      document.getElementById('lp-total').textContent     = ugx(lp.totalRepayable);
      document.getElementById('lp-paid').textContent      = ugx(lp.paid);
      document.getElementById('lp-remaining').textContent = ugx(lp.remaining);
      document.getElementById('lp-due').textContent       = dt(lp.dueDate);
      document.getElementById('lp-status').textContent    = lp.status.toUpperCase();
      document.getElementById('lp-status').style.color    = lp.status === 'overdue' ? 'var(--red)' : 'var(--blue2)';
      document.getElementById('lp-bar').style.width       = lp.progress + '%';
      document.getElementById('lp-pct').textContent       = lp.progress + '% repaid';
    } else {
      document.getElementById('loan-progress-section').style.display = 'none';
    }

    // Insights
    const insEl = document.getElementById('insights-section');
    insEl.innerHTML = d.insights.map(ins =>
      `<div class="insight-item ${ins.type}">💡 ${ins.text}</div>`
    ).join('');

    // Chart
    drawRiderChart(d.savingsTrend);

    // Recent transactions
    const txEl = document.getElementById('recent-txns');
    const allRecent = [
      ...d.recentSavings.map(s => ({ ...s, kind: 'deposit' })),
      ...d.recentRepayments.map(r => ({ ...r, kind: 'repayment' }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);

    txEl.innerHTML = allRecent.length === 0 ? '<p class="rempty">No transactions yet.</p>' :
      allRecent.map(t => `
        <div class="txn-item">
          <div>
            <span class="txn-badge ${t.kind === 'deposit' ? 'deposit' : 'loan'}">
              ${t.kind === 'deposit' ? '💰 Deposit' : '✅ Repayment'}
            </span>
            <div class="txn-desc">${t.method ? t.method.toUpperCase() : ''} ${t.reference ? '· Ref: ' + t.reference : ''}</div>
          </div>
          <div>
            <div class="txn-amount" style="color:var(--green)">${ugx(t.amount)}</div>
            <div class="txn-date">${dt(t.date)}</div>
          </div>
        </div>`).join('');

    // Update savings tab summary
    document.getElementById('sav-total').textContent    = ugx(d.totalSavings);
    document.getElementById('sav-count').textContent    = d.savingsCount;
    document.getElementById('sav-max-loan').textContent = ugx(d.maxLoan);

    // Update loan rules
    if (d.settings) {
      document.getElementById('rule-rate').textContent = d.settings.defaultInterestRate + '%';
      document.getElementById('rule-max').textContent  = d.settings.maxLoanMultiplier + '× your savings';
    }

  } catch(err) { console.error('Dashboard error:', err); }
}

// ============================================================
// SAVINGS CHART
// ============================================================
function drawRiderChart(trend) {
  const canvas = document.getElementById('riderChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w   = canvas.offsetWidth || 600;
  const h   = 150;
  canvas.width  = w;
  canvas.height = h;

  const max  = Math.max(...trend.map(t => t.total), 1);
  const bw   = (w - 60) / trend.length;
  ctx.clearRect(0, 0, w, h);

  trend.forEach((t, i) => {
    const barH = (t.total / max) * (h - 40);
    const x    = 30 + i * bw + bw * 0.15;
    const y    = h - 30 - barH;
    const bww  = bw * 0.7;

    ctx.fillStyle = t.total > 0 ? '#16a34a' : '#d1fae5';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, bww, barH, [4,4,0,0]);
    else ctx.rect(x, y, bww, barH);
    ctx.fill();

    ctx.fillStyle = '#6b7280';
    ctx.font      = '11px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(t.label, x + bww/2, h - 10);

    if (t.total > 0) {
      ctx.fillStyle = '#15803d';
      ctx.font      = '10px Outfit, sans-serif';
      ctx.fillText(Number(t.total).toLocaleString(), x + bww/2, y - 4);
    }
  });
}

// ============================================================
// SAVINGS TAB
// ============================================================
function selectRNet(net) {
  SEL_NET = net;
  document.querySelectorAll('.mm-net').forEach(el => el.classList.remove('active'));
  document.getElementById('rnet-' + net).classList.add('active');
}

async function loadSavingsTab() {
  if (DASH_DATA) {
    document.getElementById('sav-total').textContent    = ugx(DASH_DATA.totalSavings);
    document.getElementById('sav-count').textContent    = DASH_DATA.savingsCount;
    document.getElementById('sav-max-loan').textContent = ugx(DASH_DATA.maxLoan);
  }
}

async function cashDeposit() {
  const amount = document.getElementById('cash-amount').value;
  if (!amount || amount <= 0) return showMsg('cash-msg', 'Enter a valid amount.', 'error');
  try {
    showMsg('cash-msg', '⏳ Recording deposit...', 'info');
    const data = await rapi('/api/rider/deposit', 'POST', { amount, method: 'cash' });
    showMsg('cash-msg', '✅ ' + data.message, 'success');
    document.getElementById('cash-amount').value = '';
    await loadDashboard();
  } catch(err) {
    showMsg('cash-msg', '❌ ' + err.message, 'error');
  }
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
    await loadDashboard();
  } catch(err) {
    showMsg('mm-msg', '❌ ' + err.message, 'error');
  }
}

// ============================================================
// LOANS TAB
// ============================================================
async function loadLoansTab() {
  try {
    const loans = await rapi('/api/rider/loans');

    // Active loan card
    const active = loans.find(l => l.status === 'active' || l.status === 'overdue');
    const activeCard = document.getElementById('active-loan-card');
    if (active) {
      activeCard.style.display = 'block';
      document.getElementById('active-loan-body').innerHTML = `
        <div class="lp-row">
          <div><div class="lp-label">Loan Amount</div><div class="lp-val">${ugx(active.amount)}</div></div>
          <div><div class="lp-label">Interest (${active.interestRate}%)</div><div class="lp-val">${ugx(active.interestAmount)}</div></div>
          <div><div class="lp-label">Total Repayable</div><div class="lp-val">${ugx(active.totalRepayable)}</div></div>
          <div><div class="lp-label">Amount Paid</div><div class="lp-val green">${ugx(active.paid)}</div></div>
          <div><div class="lp-label">Remaining</div><div class="lp-val red">${ugx(active.remaining)}</div></div>
          <div><div class="lp-label">Due Date</div><div class="lp-val">${dt(active.dueDate)}</div></div>
        </div>
        <div class="progress-wrap">
          <div class="progress-bar"><div class="progress-fill" style="width:${active.progress}%"></div></div>
          <div class="progress-pct">${active.progress}% repaid</div>
        </div>
        ${active.status === 'overdue' ? '<div class="insight-item danger" style="margin-top:12px">⚠️ This loan is overdue! Please make a repayment to avoid penalties.</div>' : ''}
      `;
    } else {
      activeCard.style.display = 'none';
    }

    // All loans list
    const allEl = document.getElementById('all-loans-list');
    allEl.innerHTML = loans.length === 0 ? '<p class="rempty">No loans yet. Request your first loan above!</p>' :
      `<table class="htable">
        <thead><tr><th>Date</th><th>Amount</th><th>Total Repayable</th><th>Paid</th><th>Remaining</th><th>Status</th><th>Due</th></tr></thead>
        <tbody>${loans.map(l => `<tr>
          <td>${dt(l.createdAt)}</td>
          <td>${ugx(l.amount)}</td>
          <td>${ugx(l.totalRepayable)}</td>
          <td style="color:var(--green)">${ugx(l.paid)}</td>
          <td style="color:${l.remaining > 0 ? 'var(--red)' : 'var(--green)'}">${ugx(l.remaining)}</td>
          <td><span class="badge b-${l.status}">${l.status}</span></td>
          <td>${dt(l.dueDate)}</td>
        </tr>`).join('')}</tbody>
      </table>`;
  } catch(err) { console.error(err); }
}

function previewLoan() {
  const amount  = parseFloat(document.getElementById('ln-amount').value || 0);
  const months  = parseInt(document.getElementById('ln-months').value || 3);
  const rate    = DASH_DATA ? DASH_DATA.settings.defaultInterestRate : 10;
  const interest = amount * rate / 100;
  const total   = amount + interest;
  const monthly = total / months;
  const prev    = document.getElementById('loan-preview');

  if (amount <= 0) { prev.style.display = 'none'; return; }
  prev.style.display = 'block';
  prev.innerHTML = `
    <strong>Loan Amount:</strong> ${ugx(amount)}<br/>
    <strong>Interest (${rate}%):</strong> ${ugx(interest)}<br/>
    <strong>Total Repayable:</strong> ${ugx(total)}<br/>
    <strong>Monthly Payment:</strong> ${ugx(Math.ceil(monthly))} × ${months} months<br/>
    <strong>Due Date:</strong> ${new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-UG', { month:'long', year:'numeric' })}
  `;
}

async function requestLoan() {
  const amount = document.getElementById('ln-amount').value;
  const months = document.getElementById('ln-months').value;
  if (!amount || amount <= 0) return showMsg('loan-req-msg', 'Enter a valid loan amount.', 'error');
  try {
    showMsg('loan-req-msg', '⏳ Submitting loan request...', 'info');
    const data = await rapi('/api/rider/loan/request', 'POST', { amount, repaymentMonths: months });
    showMsg('loan-req-msg', '✅ ' + data.message, 'success');
    document.getElementById('ln-amount').value = '';
    document.getElementById('loan-preview').style.display = 'none';
    await loadLoansTab();
  } catch(err) {
    showMsg('loan-req-msg', '❌ ' + err.message, 'error');
  }
}

// ============================================================
// HISTORY TAB
// ============================================================
async function loadHistory() {
  try {
    const [savings, loans] = await Promise.all([
      rapi('/api/rider/savings'),
      rapi('/api/rider/loans')
    ]);

    // Savings history
    const savEl = document.getElementById('savings-history');
    savEl.innerHTML = savings.length === 0 ? '<p class="rempty">No savings recorded yet.</p>' :
      `<table class="htable">
        <thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th></tr></thead>
        <tbody>${savings.map(s => `<tr>
          <td>${dt(s.date)}</td>
          <td style="color:var(--green);font-weight:700">${ugx(s.amount)}</td>
          <td><span class="badge b-${s.method === 'mtn' ? 'mtn' : s.method === 'airtel' ? 'airtel' : 'cash'}">${s.method}</span></td>
          <td style="font-size:0.78rem;color:var(--muted)">${s.reference || '—'}</td>
        </tr>`).join('')}</tbody>
      </table>
      <div style="padding:12px 14px;background:#f0fdf4;border-top:1px solid var(--border);font-weight:700;color:var(--green)">
        Total: ${ugx(savings.reduce((s,d) => s + d.amount, 0))}
      </div>`;

    // Loans history
    const loanEl = document.getElementById('loans-history');
    loanEl.innerHTML = loans.length === 0 ? '<p class="rempty">No loans yet.</p>' :
      `<table class="htable">
        <thead><tr><th>Date</th><th>Amount</th><th>Interest</th><th>Total</th><th>Paid</th><th>Remaining</th><th>Progress</th><th>Status</th></tr></thead>
        <tbody>${loans.map(l => `<tr>
          <td>${dt(l.createdAt)}</td>
          <td>${ugx(l.amount)}</td>
          <td>${ugx(l.interestAmount)}</td>
          <td>${ugx(l.totalRepayable)}</td>
          <td style="color:var(--green)">${ugx(l.paid)}</td>
          <td style="color:${l.remaining > 0 ? 'var(--red)' : 'var(--green)'}">${ugx(l.remaining)}</td>
          <td>
            <div style="background:#d1fae5;border-radius:10px;height:8px;width:80px;overflow:hidden">
              <div style="background:var(--green);height:100%;width:${l.progress}%;border-radius:10px"></div>
            </div>
            <div style="font-size:0.72rem;color:var(--muted);margin-top:2px">${l.progress}%</div>
          </td>
          <td><span class="badge b-${l.status}">${l.status}</span></td>
        </tr>`).join('')}</tbody>
      </table>`;
  } catch(err) { console.error(err); }
}
