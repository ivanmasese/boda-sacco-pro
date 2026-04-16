// ============================================================
// BODA SACCO PRO — Backend Server v2.0
// Multi-SACCO Management System for Uganda
// Run with: node server.js
// ============================================================

const express = require("express");
const fs      = require("fs");
const path    = require("path");

const app  = express();
const PORT = process.env.PORT || 3000;
const DB   = path.join(__dirname, "data", "db.json");

// ---- MIDDLEWARE ----
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Simple in-memory session store
const sessions = {};

// ============================================================
// DATABASE HELPERS
// ============================================================
function readDB()       { return JSON.parse(fs.readFileSync(DB, "utf-8")); }
function writeDB(data)  { fs.writeFileSync(DB, JSON.stringify(data, null, 2)); }
function genId()        { return Date.now().toString(36) + Math.random().toString(36).substr(2,5); }
function genToken()     { return Math.random().toString(36).substr(2) + Date.now().toString(36); }
function today()        { return new Date().toISOString(); }

// ============================================================
// AUDIT LOG HELPER — records every action
// ============================================================
function auditLog(db, adminName, action, details) {
  db.auditLog.push({
    id: genId(),
    admin: adminName,
    action,
    details,
    timestamp: today()
  });
}

// ============================================================
// AUTH MIDDLEWARE — protect admin routes
// ============================================================
function requireAuth(req, res, next) {
  const token = req.headers["x-session-token"];
  if (!token || !sessions[token]) {
    return res.status(401).json({ error: "Unauthorized. Please login." });
  }
  req.admin = sessions[token]; // attach admin info to request
  next();
}

// Role check — only superadmin can do some things
function requireSuper(req, res, next) {
  if (req.admin.role !== "superadmin") {
    return res.status(403).json({ error: "Only Super Admin can do this." });
  }
  next();
}

// ============================================================
// ROUTE: LOGIN
// POST /api/login
// ============================================================
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "Username and password required." });

  const db    = readDB();
  const admin = db.admins.find(a => a.username === username && a.password === password);
  if (!admin) return res.status(401).json({ error: "Invalid credentials." });

  // Create a session token
  const token = genToken();
  sessions[token] = { id: admin.id, name: admin.name, username: admin.username, role: admin.role };

  auditLog(db, admin.name, "LOGIN", `${admin.name} logged in`);
  writeDB(db);

  res.json({ token, admin: { name: admin.name, role: admin.role, username: admin.username } });
});

// ============================================================
// ROUTE: LOGOUT
// POST /api/logout
// ============================================================
app.post("/api/logout", requireAuth, (req, res) => {
  const token = req.headers["x-session-token"];
  delete sessions[token];
  res.json({ message: "Logged out." });
});

// ============================================================
// ROUTE: GET DASHBOARD STATS
// GET /api/dashboard
// ============================================================
app.get("/api/dashboard", requireAuth, (req, res) => {
  const db = readDB();
  const now = new Date();

  // Helper: check if date is within last N days
  const withinDays = (dateStr, days) => {
    const d = new Date(dateStr);
    return (now - d) / (1000 * 60 * 60 * 24) <= days;
  };

  const totalSavings    = db.savings.reduce((s, d) => s + d.amount, 0);
  const todaySavings    = db.savings.filter(d => withinDays(d.date, 1)).reduce((s, d) => s + d.amount, 0);
  const weeklySavings   = db.savings.filter(d => withinDays(d.date, 7)).reduce((s, d) => s + d.amount, 0);
  const monthlySavings  = db.savings.filter(d => withinDays(d.date, 30)).reduce((s, d) => s + d.amount, 0);
  const totalLoaned     = db.loans.reduce((s, l) => s + l.amount, 0);
  const totalRepaid     = db.repayments.reduce((s, r) => s + r.amount, 0);
  const activeLoans     = db.loans.filter(l => l.status === "active").length;
  const overdueLoans    = db.loans.filter(l => l.status === "overdue").length;
  const availableCash   = totalSavings - (totalLoaned - totalRepaid);

  // Daily savings trend (last 7 days)
  const savingsTrend = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const label = d.toLocaleDateString("en-UG", { weekday: "short" });
    const dayTotal = db.savings
      .filter(s => new Date(s.date).toDateString() === d.toDateString())
      .reduce((sum, s) => sum + s.amount, 0);
    savingsTrend.push({ label, total: dayTotal });
  }

  res.json({
    totalSavings, todaySavings, weeklySavings, monthlySavings,
    totalLoaned, totalRepaid, availableCash,
    totalRiders: db.riders.length,
    activeLoans, overdueLoans,
    totalSaccos: db.saccos.length,
    savingsTrend,
  });
});

// ============================================================
// ROUTES: SACCOs
// ============================================================
app.get("/api/saccos", requireAuth, (req, res) => {
  const db = readDB();
  // Add rider count to each SACCO
  const saccos = db.saccos.map(s => ({
    ...s,
    riderCount: db.riders.filter(r => r.saccoId === s.id).length,
    totalSavings: db.savings.filter(sv => {
      const rider = db.riders.find(r => r.id === sv.riderId);
      return rider && rider.saccoId === s.id;
    }).reduce((sum, sv) => sum + sv.amount, 0)
  }));
  res.json(saccos);
});

app.post("/api/saccos", requireAuth, requireSuper, (req, res) => {
  const { name, location, chairperson, phone } = req.body;
  if (!name || !location) return res.status(400).json({ error: "Name and location required." });

  const db  = readDB();
  const newSacco = { id: genId(), name, location, chairperson, phone, createdAt: today(), status: "active" };
  db.saccos.push(newSacco);
  auditLog(db, req.admin.name, "CREATE_SACCO", `Created SACCO: ${name}`);
  writeDB(db);
  res.json({ message: "SACCO created!", sacco: newSacco });
});

app.put("/api/saccos/:id", requireAuth, requireSuper, (req, res) => {
  const db = readDB();
  const idx = db.saccos.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "SACCO not found." });
  db.saccos[idx] = { ...db.saccos[idx], ...req.body };
  auditLog(db, req.admin.name, "EDIT_SACCO", `Edited SACCO: ${db.saccos[idx].name}`);
  writeDB(db);
  res.json({ message: "SACCO updated.", sacco: db.saccos[idx] });
});

// ============================================================
// ROUTES: RIDERS
// ============================================================
app.get("/api/riders", requireAuth, (req, res) => {
  const db = readDB();
  const { saccoId, search, status } = req.query;

  let riders = db.riders.map(r => {
    const sacco       = db.saccos.find(s => s.id === r.saccoId);
    const riderSavings = db.savings.filter(s => s.riderId === r.id && !s.reversed).reduce((sum, s) => sum + s.amount, 0);
    const activeLoan   = db.loans.find(l => l.riderId === r.id && l.status === "active");
    return { ...r, saccoName: sacco ? sacco.name : "—", totalSavings: riderSavings, activeLoan: activeLoan || null };
  });

  if (saccoId)  riders = riders.filter(r => r.saccoId === saccoId);
  if (status)   riders = riders.filter(r => r.status  === status);
  if (search)   riders = riders.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.phone.includes(search)
  );

  res.json(riders);
});

app.get("/api/riders/:id", requireAuth, (req, res) => {
  const db    = readDB();
  const rider = db.riders.find(r => r.id === req.params.id);
  if (!rider) return res.status(404).json({ error: "Rider not found." });

  const sacco        = db.saccos.find(s => s.id === rider.saccoId);
  const riderSavings = db.savings.filter(s => s.riderId === rider.id && !s.reversed);
  const riderLoans   = db.loans.filter(l => l.riderId === rider.id);
  const riderRepay   = db.repayments.filter(r => r.riderId === rider.id);
  const totalSavings = riderSavings.reduce((s, d) => s + d.amount, 0);

  // AI-like insights
  const insights = [];
  const recentSavings = riderSavings.filter(s => {
    return (new Date() - new Date(s.date)) / (1000 * 60 * 60 * 24) <= 30;
  });
  if (recentSavings.length >= 4) insights.push({ type: "positive", text: "Consistent saver — eligible for a loan!" });
  if (recentSavings.length === 0) insights.push({ type: "warning", text: "No savings this month — send a reminder." });
  const overdueL = riderLoans.find(l => l.status === "overdue");
  if (overdueL) insights.push({ type: "danger", text: "Overdue loan — flagged as At Risk." });

  res.json({
    ...rider,
    saccoName: sacco ? sacco.name : "—",
    totalSavings,
    savings: riderSavings,
    loans: riderLoans,
    repayments: riderRepay,
    insights
  });
});

app.post("/api/riders", requireAuth, (req, res) => {
  const { name, phone, stage, saccoId, pin } = req.body;
  if (!name || !phone || !saccoId) return res.status(400).json({ error: "Name, phone and SACCO required." });

  const db = readDB();
  if (db.riders.find(r => r.phone === phone))
    return res.status(409).json({ error: "Phone number already registered." });

  const newRider = {
    id: genId(), name, phone, stage: stage || "", saccoId,
    pin: pin || "1234", status: "pending", loanLimit: 0,
    createdAt: today()
  };
  db.riders.push(newRider);
  auditLog(db, req.admin.name, "REGISTER_RIDER", `Registered rider: ${name} (${phone})`);
  writeDB(db);
  res.json({ message: "Rider registered!", rider: newRider });
});

app.put("/api/riders/:id/status", requireAuth, (req, res) => {
  const { status } = req.body; // approved | suspended | rejected
  const db  = readDB();
  const idx = db.riders.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Rider not found." });
  db.riders[idx].status = status;
  auditLog(db, req.admin.name, "RIDER_STATUS", `Set rider ${db.riders[idx].name} to ${status}`);
  writeDB(db);
  res.json({ message: `Rider ${status}.`, rider: db.riders[idx] });
});

app.put("/api/riders/:id/loanlimit", requireAuth, (req, res) => {
  const { loanLimit } = req.body;
  const db  = readDB();
  const idx = db.riders.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Rider not found." });
  db.riders[idx].loanLimit = parseFloat(loanLimit);
  auditLog(db, req.admin.name, "SET_LOAN_LIMIT", `Set loan limit for ${db.riders[idx].name} to UGX ${loanLimit}`);
  writeDB(db);
  res.json({ message: "Loan limit updated." });
});

// ============================================================
// ROUTES: SAVINGS
// ============================================================
app.get("/api/savings", requireAuth, (req, res) => {
  const db = readDB();
  const { riderId, from, to, saccoId } = req.query;

  let savings = db.savings.map(s => {
    const rider = db.riders.find(r => r.id === s.riderId);
    const sacco = rider ? db.saccos.find(sc => sc.id === rider.saccoId) : null;
    return { ...s, riderName: rider ? rider.name : "—", saccoName: sacco ? sacco.name : "—", riderPhone: rider ? rider.phone : "—" };
  });

  if (riderId)  savings = savings.filter(s => s.riderId === riderId);
  if (saccoId)  savings = savings.filter(s => {
    const rider = db.riders.find(r => r.id === s.riderId);
    return rider && rider.saccoId === saccoId;
  });
  if (from) savings = savings.filter(s => new Date(s.date) >= new Date(from));
  if (to)   savings = savings.filter(s => new Date(s.date) <= new Date(to));

  savings.sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json(savings);
});

app.post("/api/savings", requireAuth, (req, res) => {
  const { riderId, amount, method, reference } = req.body;
  if (!riderId || !amount) return res.status(400).json({ error: "Rider and amount required." });

  const db    = readDB();
  const rider = db.riders.find(r => r.id === riderId);
  if (!rider) return res.status(404).json({ error: "Rider not found." });
  if (rider.status !== "approved") return res.status(400).json({ error: "Rider must be approved before saving." });

  const dep = {
    id: genId(), riderId, amount: parseFloat(amount),
    method: method || "cash", reference: reference || "",
    date: today(), reversed: false, recordedBy: req.admin.name
  };
  db.savings.push(dep);
  auditLog(db, req.admin.name, "DEPOSIT", `Deposited UGX ${amount} for ${rider.name}`);
  writeDB(db);

  // Simulate SMS
  console.log(`[SMS] To ${rider.phone}: Dear ${rider.name}, UGX ${Number(amount).toLocaleString()} savings received. Balance updated. BodaSACCO.`);

  res.json({ message: "Deposit recorded!", deposit: dep });
});

app.put("/api/savings/:id/reverse", requireAuth, requireSuper, (req, res) => {
  const db  = readDB();
  const idx = db.savings.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Deposit not found." });
  db.savings[idx].reversed = true;
  db.savings[idx].reversedBy = req.admin.name;
  db.savings[idx].reversedAt = today();
  auditLog(db, req.admin.name, "REVERSE_DEPOSIT", `Reversed deposit ${req.params.id}`);
  writeDB(db);
  res.json({ message: "Deposit reversed." });
});

// ============================================================
// MOBILE MONEY DEPOSIT — triggers MoMo payment request
// POST /api/savings/mobilemoney
// ============================================================
app.post("/api/savings/mobilemoney", requireAuth, (req, res) => {
  const { riderId, amount, phone, network } = req.body;
  if (!riderId || !amount || !phone || !network)
    return res.status(400).json({ error: "riderId, amount, phone and network required." });

  const db    = readDB();
  const rider = db.riders.find(r => r.id === riderId);
  if (!rider) return res.status(404).json({ error: "Rider not found." });
  if (rider.status !== "approved") return res.status(400).json({ error: "Rider must be approved." });

  // ---- SANDBOX SIMULATION ----
  // To go live with MTN MoMo:
  //   POST https://sandbox.momodeveloper.mtn.com/collection/v1_0/requesttopay
  //   Headers: Authorization: Bearer {access_token}, X-Reference-Id: {uuid}
  //   Body: { amount, currency:"UGX", externalId, payer:{partyIdType:"MSISDN",partyId:phone}, payerMessage, payeeNote }
  //
  // To go live with Airtel Money:
  //   POST https://openapi.airtel.africa/merchant/v1/payments/
  //   Headers: Authorization: Bearer {access_token}
  //   Body: { reference, subscriber:{country:"UG",currency:"UGX",msisdn:phone}, transaction:{amount,country:"UG",currency:"UGX",id} }

  const reference = "MM-" + Date.now();
  console.log(`[MOBILE MONEY] ${network.toUpperCase()} request: UGX ${amount} from ${phone} for rider ${rider.name}. Ref: ${reference}`);

  // Record the deposit automatically after "successful" mobile money
  const dep = {
    id: genId(), riderId, amount: parseFloat(amount),
    method: network, reference, date: today(),
    reversed: false, recordedBy: req.admin.name
  };
  db.savings.push(dep);
  auditLog(db, req.admin.name, "MOBILE_MONEY_DEPOSIT",
    `${network} deposit UGX ${amount} for ${rider.name} (${phone}). Ref: ${reference}`);
  writeDB(db);

  console.log(`[SMS] To ${rider.phone}: Dear ${rider.name}, UGX ${Number(amount).toLocaleString()} received via ${network}. Ref: ${reference}. BodaSACCO.`);

  res.json({
    message: `${network.toUpperCase()} payment request sent to ${phone}. Deposit of UGX ${Number(amount).toLocaleString()} recorded. (Sandbox mode)`,
    reference,
    deposit: dep
  });
});

// ============================================================
// ROUTES: LOANS
// ============================================================
app.get("/api/loans", requireAuth, (req, res) => {
  const db = readDB();
  const { status, saccoId } = req.query;

  let loans = db.loans.map(l => {
    const rider = db.riders.find(r => r.id === l.riderId);
    const sacco = rider ? db.saccos.find(s => s.id === rider.saccoId) : null;
    const paid  = db.repayments.filter(r => r.loanId === l.id).reduce((s, r) => s + r.amount, 0);
    return { ...l, riderName: rider ? rider.name : "—", riderPhone: rider ? rider.phone : "—",
             saccoName: sacco ? sacco.name : "—", totalPaid: paid, remaining: l.amount - paid };
  });

  if (status)  loans = loans.filter(l => l.status === status);
  if (saccoId) loans = loans.filter(l => {
    const rider = db.riders.find(r => r.id === l.riderId);
    return rider && rider.saccoId === saccoId;
  });

  // Auto-flag overdue loans
  loans.forEach(l => {
    if (l.status === "active" && new Date(l.dueDate) < new Date()) l.status = "overdue";
  });

  loans.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(loans);
});

app.post("/api/loans", requireAuth, (req, res) => {
  const { riderId, amount, interestRate, repaymentMonths } = req.body;
  if (!riderId || !amount) return res.status(400).json({ error: "Rider and amount required." });

  const db     = readDB();
  const rider  = db.riders.find(r => r.id === riderId);
  if (!rider)  return res.status(404).json({ error: "Rider not found." });
  if (rider.status !== "approved") return res.status(400).json({ error: "Rider must be approved." });

  const existing = db.loans.find(l => l.riderId === riderId && (l.status === "active" || l.status === "overdue"));
  if (existing)  return res.status(400).json({ error: "Rider already has an active loan." });

  const settings  = db.settings;
  const riderSavings = db.savings.filter(s => s.riderId === riderId && !s.reversed).reduce((s, d) => s + d.amount, 0);
  const maxLoan   = rider.loanLimit > 0 ? rider.loanLimit : riderSavings * settings.maxLoanMultiplier;

  if (parseFloat(amount) > maxLoan)
    return res.status(400).json({ error: `Loan exceeds limit. Max: UGX ${maxLoan.toLocaleString()}` });

  const rate     = parseFloat(interestRate || settings.defaultInterestRate);
  const months   = parseInt(repaymentMonths || 3);
  const interest = (parseFloat(amount) * rate / 100);
  const total    = parseFloat(amount) + interest;
  const dueDate  = new Date();
  dueDate.setMonth(dueDate.getMonth() + months);

  const loan = {
    id: genId(), riderId, amount: parseFloat(amount),
    interestRate: rate, interestAmount: interest,
    totalRepayable: total, repaymentMonths: months,
    status: "pending", dueDate: dueDate.toISOString(),
    createdAt: today(), approvedBy: null
  };

  db.loans.push(loan);
  auditLog(db, req.admin.name, "LOAN_REQUEST", `Loan request UGX ${amount} for ${rider.name}`);
  writeDB(db);
  res.json({ message: "Loan request created!", loan });
});

app.put("/api/loans/:id/approve", requireAuth, (req, res) => {
  const db  = readDB();
  const idx = db.loans.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Loan not found." });
  if (db.loans[idx].status !== "pending") return res.status(400).json({ error: "Loan is not pending." });

  db.loans[idx].status     = "active";
  db.loans[idx].approvedBy = req.admin.name;
  db.loans[idx].approvedAt = today();

  const rider = db.riders.find(r => r.id === db.loans[idx].riderId);
  auditLog(db, req.admin.name, "LOAN_APPROVED", `Approved loan UGX ${db.loans[idx].amount} for ${rider ? rider.name : "?"}`);
  writeDB(db);

  if (rider) console.log(`[SMS] To ${rider.phone}: Dear ${rider.name}, your loan of UGX ${Number(db.loans[idx].amount).toLocaleString()} has been APPROVED. Repay by ${new Date(db.loans[idx].dueDate).toLocaleDateString()}. BodaSACCO.`);

  res.json({ message: "Loan approved!", loan: db.loans[idx] });
});

app.put("/api/loans/:id/reject", requireAuth, (req, res) => {
  const db  = readDB();
  const idx = db.loans.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Loan not found." });
  db.loans[idx].status = "rejected";
  auditLog(db, req.admin.name, "LOAN_REJECTED", `Rejected loan ${req.params.id}`);
  writeDB(db);
  res.json({ message: "Loan rejected." });
});

app.post("/api/loans/:id/repay", requireAuth, (req, res) => {
  const { amount } = req.body;
  const db  = readDB();
  const loan = db.loans.find(l => l.id === req.params.id);
  if (!loan) return res.status(404).json({ error: "Loan not found." });

  const paid      = db.repayments.filter(r => r.loanId === loan.id).reduce((s, r) => s + r.amount, 0);
  const remaining = loan.totalRepayable - paid;
  const actual    = Math.min(parseFloat(amount), remaining);

  const repayment = {
    id: genId(), loanId: loan.id, riderId: loan.riderId,
    amount: actual, date: today(), recordedBy: req.admin.name
  };
  db.repayments.push(repayment);

  if (paid + actual >= loan.totalRepayable) {
    db.loans[db.loans.findIndex(l => l.id === loan.id)].status = "paid";
  }

  const rider = db.riders.find(r => r.id === loan.riderId);
  auditLog(db, req.admin.name, "LOAN_REPAYMENT", `Repayment UGX ${actual} for loan ${loan.id}`);
  writeDB(db);

  if (rider) console.log(`[SMS] To ${rider.phone}: Dear ${rider.name}, repayment of UGX ${Number(actual).toLocaleString()} received. Remaining: UGX ${Number(remaining - actual).toLocaleString()}. BodaSACCO.`);

  res.json({ message: "Repayment recorded!", remaining: remaining - actual });
});

// ============================================================
// ROUTES: REPORTS
// ============================================================
app.get("/api/reports/summary", requireAuth, (req, res) => {
  const db      = readDB();
  const { period } = req.query; // day | week | month
  const days    = period === "day" ? 1 : period === "week" ? 7 : 30;
  const cutoff  = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const periodSavings = db.savings.filter(s => !s.reversed && new Date(s.date) >= cutoff);
  const periodLoans   = db.loans.filter(l => new Date(l.createdAt) >= cutoff);
  const periodRepay   = db.repayments.filter(r => new Date(r.date) >= cutoff);

  // Top savers
  const savingsPerRider = {};
  db.savings.filter(s => !s.reversed).forEach(s => {
    savingsPerRider[s.riderId] = (savingsPerRider[s.riderId] || 0) + s.amount;
  });
  const topSavers = Object.entries(savingsPerRider)
    .map(([riderId, total]) => {
      const rider = db.riders.find(r => r.id === riderId);
      return { name: rider ? rider.name : "?", phone: rider ? rider.phone : "?", total };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // Defaulters
  const defaulters = db.loans
    .filter(l => l.status === "overdue" || (l.status === "active" && new Date(l.dueDate) < new Date()))
    .map(l => {
      const rider = db.riders.find(r => r.id === l.riderId);
      const paid  = db.repayments.filter(r => r.loanId === l.id).reduce((s, r) => s + r.amount, 0);
      return { riderName: rider ? rider.name : "?", phone: rider ? rider.phone : "?",
               loanAmount: l.amount, remaining: l.totalRepayable - paid, dueDate: l.dueDate };
    });

  res.json({
    period,
    totalSavings:  periodSavings.reduce((s, d) => s + d.amount, 0),
    totalDeposits: periodSavings.length,
    totalLoans:    periodLoans.reduce((s, l) => s + l.amount, 0),
    totalRepaid:   periodRepay.reduce((s, r) => s + r.amount, 0),
    repaymentRate: db.loans.length > 0
      ? Math.round((db.loans.filter(l => l.status === "paid").length / db.loans.length) * 100)
      : 0,
    topSavers,
    defaulters,
    saccoComparison: db.saccos.map(s => {
      const riders = db.riders.filter(r => r.saccoId === s.id).map(r => r.id);
      const sTotal = db.savings.filter(sv => riders.includes(sv.riderId) && !sv.reversed).reduce((sum, sv) => sum + sv.amount, 0);
      return { name: s.name, riders: riders.length, savings: sTotal };
    }).sort((a, b) => b.savings - a.savings)
  });
});

app.get("/api/reports/export", requireAuth, (req, res) => {
  const db   = readDB();
  const type = req.query.type || "savings";
  let data   = [];

  if (type === "savings") {
    data = db.savings.map(s => {
      const rider = db.riders.find(r => r.id === s.riderId);
      return { Date: s.date, Rider: rider ? rider.name : "?", Phone: rider ? rider.phone : "?",
               Amount: s.amount, Method: s.method, Reference: s.reference, Reversed: s.reversed };
    });
  } else if (type === "loans") {
    data = db.loans.map(l => {
      const rider = db.riders.find(r => r.id === l.riderId);
      const paid  = db.repayments.filter(r => r.loanId === l.id).reduce((s, r) => s + r.amount, 0);
      return { Date: l.createdAt, Rider: rider ? rider.name : "?", Amount: l.amount,
               Interest: l.interestAmount, TotalRepayable: l.totalRepayable,
               Paid: paid, Remaining: l.totalRepayable - paid, Status: l.status, DueDate: l.dueDate };
    });
  }

  // Convert to CSV
  if (data.length === 0) return res.json({ csv: "No data available" });
  const headers = Object.keys(data[0]).join(",");
  const rows    = data.map(row => Object.values(row).join(","));
  const csv     = [headers, ...rows].join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename=${type}-report.csv`);
  res.send(csv);
});

// ============================================================
// ROUTES: MESSAGES
// ============================================================
app.post("/api/messages", requireAuth, (req, res) => {
  const { target, saccoId, message } = req.body;
  if (!message) return res.status(400).json({ error: "Message required." });

  const db = readDB();
  let recipients = [];

  if (target === "all") {
    recipients = db.riders.filter(r => r.status === "approved");
  } else if (target === "sacco" && saccoId) {
    recipients = db.riders.filter(r => r.saccoId === saccoId && r.status === "approved");
  } else if (target === "defaulters") {
    const overdueRiderIds = db.loans
      .filter(l => l.status === "overdue" || (l.status === "active" && new Date(l.dueDate) < new Date()))
      .map(l => l.riderId);
    recipients = db.riders.filter(r => overdueRiderIds.includes(r.id));
  } else if (target === "topsavers") {
    const savingsMap = {};
    db.savings.filter(s => !s.reversed).forEach(s => {
      savingsMap[s.riderId] = (savingsMap[s.riderId] || 0) + s.amount;
    });
    const topIds = Object.entries(savingsMap).sort((a,b) => b[1]-a[1]).slice(0,10).map(e => e[0]);
    recipients = db.riders.filter(r => topIds.includes(r.id));
  }

  // Simulate SMS to each recipient
  recipients.forEach(r => {
    console.log(`[SMS] To ${r.phone}: ${message}`);
  });

  const msg = {
    id: genId(), target, saccoId: saccoId || null, message,
    sentTo: recipients.length, sentBy: req.admin.name, sentAt: today()
  };
  db.messages.push(msg);
  auditLog(db, req.admin.name, "SEND_MESSAGE", `Sent message to ${recipients.length} riders (${target})`);
  writeDB(db);

  res.json({ message: `Message sent to ${recipients.length} riders!`, log: msg });
});

app.get("/api/messages", requireAuth, (req, res) => {
  const db = readDB();
  res.json([...db.messages].reverse());
});

// ============================================================
// ROUTES: SETTINGS
// ============================================================
app.get("/api/settings", requireAuth, (req, res) => {
  res.json(readDB().settings);
});

app.put("/api/settings", requireAuth, requireSuper, (req, res) => {
  const db = readDB();
  db.settings = { ...db.settings, ...req.body };
  auditLog(db, req.admin.name, "UPDATE_SETTINGS", "System settings updated");
  writeDB(db);
  res.json({ message: "Settings updated!", settings: db.settings });
});

// ============================================================
// ROUTES: AUDIT LOG
// ============================================================
app.get("/api/audit", requireAuth, requireSuper, (req, res) => {
  const db = readDB();
  res.json([...db.auditLog].reverse().slice(0, 100));
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, () => {
  console.log("==============================================");
  console.log("  BODA SACCO PRO — Management System v2.0");
  console.log("==============================================");
  console.log(`  Running at: http://localhost:${PORT}`);
  console.log(`  Admin Panel: http://localhost:${PORT}/index.html`);
  console.log("==============================================");
  console.log("  DEFAULT LOGINS:");
  console.log("  Super Admin  → superadmin / admin1234");
  console.log("  Treasurer    → treasurer / treasurer1234");
  console.log("==============================================");
});

// ============================================================
// RIDER PORTAL ROUTES
// ============================================================
const riderSessions = {};

app.post("/api/rider/register", (req, res) => {
  const { name, phone, stage, saccoId, pin } = req.body;
  if (!name || !phone || !saccoId || !pin) return res.status(400).json({ error: "All fields are required." });
  if (pin.length !== 4 || isNaN(pin)) return res.status(400).json({ error: "PIN must be exactly 4 digits." });
  const db = readDB();
  if (db.riders.find(r => r.phone === phone)) return res.status(409).json({ error: "Phone number already registered." });
  const sacco = db.saccos.find(s => s.id === saccoId);
  if (!sacco) return res.status(404).json({ error: "SACCO not found." });
  const newRider = { id: genId(), name, phone, stage: stage || "", saccoId, pin, status: "pending", loanLimit: 0, createdAt: today() };
  db.riders.push(newRider);
  auditLog(db, name, "SELF_REGISTER", `Rider ${name} (${phone}) self-registered. Awaiting approval.`);
  writeDB(db);
  console.log(`[SMS] To ${phone}: Dear ${name}, your BodaSACCO registration is received. Await admin approval. Thank you!`);
  res.json({ message: "Registration submitted! Wait for admin approval before you can login." });
});

app.post("/api/rider/login", (req, res) => {
  const { phone, pin } = req.body;
  if (!phone || !pin) return res.status(400).json({ error: "Phone and PIN required." });
  const db = readDB();
  const rider = db.riders.find(r => r.phone === phone && r.pin === pin);
  if (!rider) return res.status(401).json({ error: "Invalid phone number or PIN." });
  if (rider.status === "pending") return res.status(403).json({ error: "Account pending admin approval. Please wait." });
  if (rider.status === "suspended") return res.status(403).json({ error: "Account suspended. Contact your SACCO admin." });
  const token = genToken();
  riderSessions[token] = { id: rider.id, name: rider.name, phone: rider.phone, saccoId: rider.saccoId };
  const sacco = db.saccos.find(s => s.id === rider.saccoId);
  res.json({ token, rider: { id: rider.id, name: rider.name, phone: rider.phone, saccoName: sacco ? sacco.name : "—", status: rider.status } });
});

function requireRider(req, res, next) {
  const token = req.headers["x-rider-token"];
  if (!token || !riderSessions[token]) return res.status(401).json({ error: "Unauthorized. Please login." });
  req.rider = riderSessions[token];
  next();
}

app.post("/api/rider/logout", requireRider, (req, res) => {
  delete riderSessions[req.headers["x-rider-token"]];
  res.json({ message: "Logged out." });
});

app.get("/api/rider/saccos", (req, res) => {
  const db = readDB();
  res.json(db.saccos.filter(s => s.status === "active").map(s => ({ id: s.id, name: s.name, location: s.location })));
});

app.get("/api/rider/dashboard", requireRider, (req, res) => {
  const db = readDB();
  const rider = db.riders.find(r => r.id === req.rider.id);
  if (!rider) return res.status(404).json({ error: "Rider not found." });
  const sacco = db.saccos.find(s => s.id === rider.saccoId);
  const mySavings = db.savings.filter(s => s.riderId === rider.id && !s.reversed);
  const myLoans = db.loans.filter(l => l.riderId === rider.id);
  const myRepayments = db.repayments.filter(r => r.riderId === rider.id);
  const totalSavings = mySavings.reduce((s, d) => s + d.amount, 0);
  const settings = db.settings;
  const activeLoan = myLoans.find(l => l.status === "active" || l.status === "overdue");
  let loanProgress = null;
  if (activeLoan) {
    const paid = db.repayments.filter(r => r.loanId === activeLoan.id).reduce((s, r) => s + r.amount, 0);
    const remaining = activeLoan.totalRepayable - paid;
    const progress = Math.round((paid / activeLoan.totalRepayable) * 100);
    loanProgress = { ...activeLoan, paid, remaining, progress };
  }
  const savingsTrend = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    const label = d.toLocaleDateString("en-UG", { month: "short" });
    const monthTotal = mySavings.filter(s => { const sd = new Date(s.date); return sd.getMonth() === d.getMonth() && sd.getFullYear() === d.getFullYear(); }).reduce((sum, s) => sum + s.amount, 0);
    savingsTrend.push({ label, total: monthTotal });
  }
  const insights = [];
  const recentSavings = mySavings.filter(s => (new Date() - new Date(s.date)) / (1000 * 60 * 60 * 24) <= 30);
  if (recentSavings.length >= 3) insights.push({ type: "positive", text: "You are saving consistently! You may qualify for a loan." });
  if (recentSavings.length === 0 && mySavings.length > 0) insights.push({ type: "warning", text: "No savings this month. Save today to stay on track!" });
  if (activeLoan && activeLoan.status === "overdue") insights.push({ type: "danger", text: "Your loan is overdue! Make a repayment to avoid penalties." });
  if (!activeLoan && totalSavings > 0) insights.push({ type: "positive", text: `You can borrow up to UGX ${(totalSavings * settings.maxLoanMultiplier).toLocaleString()}!` });
  res.json({
    rider: { ...rider, pin: undefined, saccoName: sacco ? sacco.name : "—" },
    totalSavings, maxLoan: rider.loanLimit > 0 ? rider.loanLimit : totalSavings * settings.maxLoanMultiplier,
    savingsCount: mySavings.length, loanProgress, totalLoans: myLoans.length,
    paidLoans: myLoans.filter(l => l.status === "paid").length,
    recentSavings: [...mySavings].reverse().slice(0, 5),
    recentRepayments: [...myRepayments].reverse().slice(0, 5),
    allLoans: myLoans, savingsTrend, insights, settings
  });
});

app.post("/api/rider/deposit", requireRider, (req, res) => {
  const { amount, method, phone } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: "Valid amount required." });
  const db = readDB();
  const rider = db.riders.find(r => r.id === req.rider.id);
  if (method === "mtn" || method === "airtel") {
    if (!phone) return res.status(400).json({ error: "Phone number required for mobile money." });
    const reference = "MM-" + Date.now();
    const dep = { id: genId(), riderId: rider.id, amount: parseFloat(amount), method, reference, date: today(), reversed: false, recordedBy: rider.name };
    db.savings.push(dep);
    auditLog(db, rider.name, "RIDER_MM_DEPOSIT", `${method.toUpperCase()} deposit UGX ${amount} by ${rider.name}. Ref: ${reference}`);
    writeDB(db);
    console.log(`[MOBILE MONEY] ${method.toUpperCase()}: UGX ${amount} from ${phone}. Rider: ${rider.name}. Ref: ${reference}`);
    console.log(`[SMS] To ${rider.phone}: UGX ${Number(amount).toLocaleString()} received via ${method.toUpperCase()}. Ref: ${reference}. BodaSACCO.`);
    return res.json({ message: `${method.toUpperCase()} payment of UGX ${Number(amount).toLocaleString()} recorded! Ref: ${reference}`, reference });
  }
  const dep = { id: genId(), riderId: rider.id, amount: parseFloat(amount), method: "cash_request", reference: "PENDING-" + Date.now(), date: today(), reversed: false, recordedBy: rider.name };
  db.savings.push(dep);
  auditLog(db, rider.name, "RIDER_CASH_DEPOSIT", `Rider ${rider.name} deposited cash UGX ${amount}`);
  writeDB(db);
  console.log(`[DEPOSIT] Rider ${rider.name} (${rider.phone}) cash deposit UGX ${amount}.`);
  res.json({ message: `Deposit of UGX ${Number(amount).toLocaleString()} recorded successfully!` });
});

app.post("/api/rider/loan/request", requireRider, (req, res) => {
  const { amount, repaymentMonths } = req.body;
  if (!amount) return res.status(400).json({ error: "Amount required." });
  const db = readDB();
  const rider = db.riders.find(r => r.id === req.rider.id);
  const settings = db.settings;
  const existing = db.loans.find(l => l.riderId === rider.id && (l.status === "active" || l.status === "overdue" || l.status === "pending"));
  if (existing) return res.status(400).json({ error: "You already have an active or pending loan." });
  const totalSavings = db.savings.filter(s => s.riderId === rider.id && !s.reversed).reduce((s, d) => s + d.amount, 0);
  const maxLoan = rider.loanLimit > 0 ? rider.loanLimit : totalSavings * settings.maxLoanMultiplier;
  if (parseFloat(amount) > maxLoan) return res.status(400).json({ error: `Amount exceeds your limit of UGX ${maxLoan.toLocaleString()}.` });
  const rate = settings.defaultInterestRate;
  const months = parseInt(repaymentMonths || 3);
  const interest = parseFloat(amount) * rate / 100;
  const total = parseFloat(amount) + interest;
  const dueDate = new Date(); dueDate.setMonth(dueDate.getMonth() + months);
  const loan = { id: genId(), riderId: rider.id, amount: parseFloat(amount), interestRate: rate, interestAmount: interest, totalRepayable: total, repaymentMonths: months, status: "pending", dueDate: dueDate.toISOString(), createdAt: today(), approvedBy: null };
  db.loans.push(loan);
  auditLog(db, rider.name, "RIDER_LOAN_REQUEST", `Rider ${rider.name} requested loan of UGX ${amount}`);
  writeDB(db);
  console.log(`[SMS] To ${rider.phone}: Dear ${rider.name}, loan request UGX ${Number(amount).toLocaleString()} submitted. Awaiting approval. BodaSACCO.`);
  res.json({ message: `Loan request of UGX ${Number(amount).toLocaleString()} submitted! Awaiting admin approval.`, loan });
});

app.get("/api/rider/savings", requireRider, (req, res) => {
  const db = readDB();
  const savings = db.savings.filter(s => s.riderId === req.rider.id && !s.reversed).sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json(savings);
});

app.get("/api/rider/loans", requireRider, (req, res) => {
  const db = readDB();
  const loans = db.loans.filter(l => l.riderId === req.rider.id).map(l => {
    const paid = db.repayments.filter(r => r.loanId === l.id).reduce((s, r) => s + r.amount, 0);
    const remaining = l.totalRepayable - paid;
    const progress = l.totalRepayable > 0 ? Math.round((paid / l.totalRepayable) * 100) : 0;
    return { ...l, paid, remaining, progress };
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(loans);
});
