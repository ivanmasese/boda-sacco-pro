// ============================================================
// BODA SACCO PRO — Server v4.0
// PRIORITY FEATURES:
// P1 — Master Admin Panel (platform owner controls all)
// P2 — SACCO Data Isolation (each SACCO sees only their data)
// P3 — Subscription Tracking (auto-suspend non-payers)
// ============================================================

const express = require("express");
const fs      = require("fs");
const path    = require("path");
const bcrypt  = require("bcryptjs");

const app  = express();
const PORT = 3000;
// Use /opt/render/project/data on Render, local data folder otherwise
const DATA_DIR = process.env.RENDER ? '/opt/render/project/src/data' : path.join(__dirname, "data");
const DB = path.join(DATA_DIR, "db.json");

// Make sure data directory exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// If db.json does not exist yet, create a fresh one
if (!fs.existsSync(DB)) {
  const fresh = {
    masterAdmin: { username: "master", password: "master2026", name: "Platform Owner", email: "owner@bodasacco.com" },
    platformSettings: {
      platformName: "BodaSACCO Pro", currency: "UGX",
      plans: {
        starter: { name:"Starter", maxRiders:100,  price:100000, description:"Up to 100 riders" },
        growth:  { name:"Growth",  maxRiders:500,  price:200000, description:"Up to 500 riders" },
        pro:     { name:"Pro",     maxRiders:2000, price:400000, description:"Up to 2000 riders" }
      },
      setupFee:300000, trialDays:14, smsCostPerUnit:50, smsMarkupPerUnit:120
    },
    saccos:[], admins:[], riders:[], savings:[], loans:[], repayments:[], expenses:[],
    messages:[], auditLog:[], loginAttempts:{}, depositRequests:[],
    subscriptionPayments:[], supportTickets:[]
  };
  fs.writeFileSync(DB, JSON.stringify(fresh, null, 2));
  console.log("Fresh database created at", DB);
}
const BACKUP_DIR = path.join(__dirname, "backups");

if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ============================================================
// SESSION STORES
// ============================================================
const masterSessions = {};  // Platform owner sessions
const adminSessions  = {};  // SACCO admin/treasurer sessions
const riderSessions  = {};  // Rider sessions

// ============================================================
// DATABASE HELPERS
// ============================================================
function readDB()      { return JSON.parse(fs.readFileSync(DB, "utf-8")); }
function writeDB(data) { fs.writeFileSync(DB, JSON.stringify(data, null, 2)); }
function genId()       { return Date.now().toString(36) + Math.random().toString(36).substr(2, 5); }
function genToken()    { return Math.random().toString(36).substr(2) + Date.now().toString(36); }
function now()         { return new Date().toISOString(); }

function auditLog(db, actor, saccoId, action, details) {
  db.auditLog.push({ id: genId(), actor, saccoId: saccoId || "platform", action, details, timestamp: now() });
}

// ============================================================
// AUTO BACKUP — every 24 hours
// ============================================================
function runBackup() {
  try {
    const date = new Date().toISOString().split("T")[0];
    fs.copyFileSync(DB, path.join(BACKUP_DIR, `backup-${date}.json`));
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith("backup-")).sort();
    if (files.length > 30) files.slice(0, files.length - 30).forEach(f => fs.unlinkSync(path.join(BACKUP_DIR, f)));
    console.log(`[BACKUP] ✅ Backed up: backup-${date}.json`);
  } catch(e) { console.error("[BACKUP] Failed:", e.message); }
}
runBackup();
setInterval(runBackup, 24 * 60 * 60 * 1000);

// ============================================================
// P3 — AUTO SUBSCRIPTION CHECK
// Runs every hour — suspends SACCOs that haven't paid
// ============================================================
function checkSubscriptions() {
  const db = readDB();
  let changed = false;
  db.saccos.forEach((sacco, idx) => {
    if (sacco.status === "active" || sacco.status === "trial") {
      const now = new Date();
      // Check if trial expired
      if (sacco.status === "trial") {
        const trialEnd = new Date(sacco.trialEndsAt);
        if (now > trialEnd) {
          db.saccos[idx].status = "suspended";
          db.saccos[idx].suspendedReason = "Trial period expired";
          console.log(`[SUBSCRIPTION] SACCO "${sacco.name}" trial expired — suspended.`);
          changed = true;
        }
      }
      // Check if subscription payment overdue (more than 35 days since last payment)
      if (sacco.status === "active" && sacco.subscriptionDueDate) {
        const due = new Date(sacco.subscriptionDueDate);
        const daysOverdue = Math.floor((now - due) / (1000 * 60 * 60 * 24));
        if (daysOverdue > 5) { // 5 day grace period
          db.saccos[idx].status = "suspended";
          db.saccos[idx].suspendedReason = `Subscription overdue by ${daysOverdue} days`;
          console.log(`[SUBSCRIPTION] SACCO "${sacco.name}" suspended — overdue ${daysOverdue} days.`);
          changed = true;
        }
      }
    }
  });
  if (changed) writeDB(db);
}
checkSubscriptions();
setInterval(checkSubscriptions, 60 * 60 * 1000);

// ============================================================
// AUTO LOAN PENALTY CHECK — every hour
// ============================================================
function checkOverdueLoans() {
  const db = readDB();
  let changed = false;
  db.loans.forEach((loan, idx) => {
    if (loan.status === "active" && new Date(loan.dueDate) < new Date()) {
      db.loans[idx].status = "overdue";
      if (!loan.penaltyAdded) {
        const paid      = db.repayments.filter(r => r.loanId === loan.id).reduce((s, r) => s + r.amount, 0);
        const remaining = loan.totalRepayable - paid;
        const sacco     = db.saccos.find(s => s.id === loan.saccoId);
        const penalty   = Math.round(remaining * ((sacco?.settings?.latePenaltyPercent || 5) / 100));
        db.loans[idx].penaltyAmount    = penalty;
        db.loans[idx].totalRepayable  += penalty;
        db.loans[idx].penaltyAdded     = true;
        db.loans[idx].penaltyDate      = now();
        const rider = db.riders.find(r => r.id === loan.riderId);
        if (rider) console.log(`[SMS] To ${rider.phone}: Your loan is OVERDUE. Penalty UGX ${penalty.toLocaleString()} added. BodaSACCO.`);
        changed = true;
      }
    }
  });
  if (changed) writeDB(db);
}
checkOverdueLoans();
setInterval(checkOverdueLoans, 60 * 60 * 1000);

// ============================================================
// SESSION CLEANUP — every 5 minutes
// ============================================================
setInterval(() => {
  const timeout = 30 * 60 * 1000;
  const n = Date.now();
  [masterSessions, adminSessions, riderSessions].forEach(store => {
    Object.keys(store).forEach(t => { if (n - store[t].lastActive > timeout) delete store[t]; });
  });
}, 5 * 60 * 1000);

// ============================================================
// SECURITY HELPERS
// ============================================================
async function hashPIN(pin) { return await bcrypt.hash(pin, 10); }
async function verifyPIN(pin, hash) {
  if (hash && hash.startsWith("$2")) return await bcrypt.compare(pin, hash);
  return pin === hash;
}

function checkLockout(phone, db) {
  const attempts = db.loginAttempts[phone];
  if (!attempts) return { allowed: true };
  if (attempts.count >= 3) {
    const elapsed = Date.now() - new Date(attempts.lockedAt).getTime();
    if (elapsed < 30 * 60 * 1000) {
      return { allowed: false, message: `Locked. Try again in ${Math.ceil((30 * 60 * 1000 - elapsed) / 60000)} minutes.` };
    }
    delete db.loginAttempts[phone];
  }
  return { allowed: true };
}

function recordFail(phone, db) {
  if (!db.loginAttempts[phone]) db.loginAttempts[phone] = { count: 0 };
  db.loginAttempts[phone].count++;
  if (db.loginAttempts[phone].count >= 3) db.loginAttempts[phone].lockedAt = now();
}

function clearLockout(phone, db) { delete db.loginAttempts[phone]; }

// ============================================================
// AUTH MIDDLEWARES
// ============================================================
function requireMaster(req, res, next) {
  const token = req.headers["x-master-token"];
  if (!token || !masterSessions[token]) {
    return res.status(401).json({ error: "Session expired. Please login to master panel again." });
  }
  masterSessions[token].lastActive = Date.now();
  req.master = masterSessions[token];
  next();
}

function requireAdmin(req, res, next) {
  const token = req.headers["x-session-token"];
  if (!token || !adminSessions[token]) return res.status(401).json({ error: "Unauthorized. Please login." });
  const session = adminSessions[token];
  session.lastActive = Date.now();
  // P3 — Check if SACCO is suspended
  const db    = readDB();
  const sacco = db.saccos.find(s => s.id === session.saccoId);
  if (sacco && sacco.status === "suspended") {
    return res.status(403).json({ error: "Your SACCO subscription is suspended. Please contact BodaSACCO support to renew." });
  }
  req.admin = session;
  next();
}

function requireSuper(req, res, next) {
  if (req.admin.role !== "superadmin") return res.status(403).json({ error: "Only SACCO Super Admin can do this." });
  next();
}

function requireRider(req, res, next) {
  const token = req.headers["x-rider-token"];
  if (!token || !riderSessions[token]) return res.status(401).json({ error: "Session expired. Please login again." });
  riderSessions[token].lastActive = Date.now();
  req.rider = riderSessions[token];
  next();
}

// P2 — Ensure admin only accesses their SACCO's data
function saccoFilter(req) { return req.admin.saccoId; }

// ============================================================
// ============================================================
// MASTER ADMIN ROUTES (Platform Owner)
// ============================================================
// ============================================================

// MASTER LOGIN
app.post("/api/master/login", (req, res) => {
  const { username, password } = req.body;
  const db = readDB();
  const ma = db.masterAdmin;
  if (!ma || username !== ma.username || password !== ma.password)
    return res.status(401).json({ error: "Invalid master credentials." });
  const token = genToken();
  masterSessions[token] = { username: ma.username, name: ma.name, lastActive: Date.now() };
  res.json({ token, name: ma.name });
});

// MASTER LOGOUT
app.post("/api/master/logout", requireMaster, (req, res) => {
  delete masterSessions[req.headers["x-master-token"]];
  res.json({ message: "Logged out." });
});

// MASTER DASHBOARD — full platform overview
app.get("/api/master/dashboard", requireMaster, (req, res) => {
  const db = readDB();
  const activeSaccos    = db.saccos.filter(s => s.status === "active").length;
  const trialSaccos     = db.saccos.filter(s => s.status === "trial").length;
  const suspendedSaccos = db.saccos.filter(s => s.status === "suspended").length;
  const totalRiders     = db.riders.length;
  const totalSavings    = db.savings.filter(s => !s.reversed).reduce((sum, s) => sum + s.amount, 0);
  const totalLoans      = db.loans.reduce((sum, l) => sum + l.amount, 0);
  const totalRevenue    = db.subscriptionPayments.reduce((sum, p) => sum + p.amount, 0);

  // Monthly revenue this month
  const thisMonth   = new Date(); thisMonth.setDate(1); thisMonth.setHours(0,0,0,0);
  const monthRevenue = db.subscriptionPayments
    .filter(p => new Date(p.date) >= thisMonth)
    .reduce((sum, p) => sum + p.amount, 0);

  // SACCO performance
  const saccoStats = db.saccos.map(s => {
    const riders   = db.riders.filter(r => r.saccoId === s.id);
    const savings  = db.savings.filter(sv => sv.saccoId === s.id && !sv.reversed).reduce((sum, sv) => sum + sv.amount, 0);
    const loans    = db.loans.filter(l => l.saccoId === s.id).length;
    const overdue  = db.loans.filter(l => l.saccoId === s.id && l.status === "overdue").length;
    const lastPay  = db.subscriptionPayments.filter(p => p.saccoId === s.id).sort((a,b) => new Date(b.date) - new Date(a.date))[0];
    return { ...s, riderCount: riders.length, totalSavings: savings, totalLoans: loans, overdueLoans: overdue, lastPayment: lastPay || null };
  });

  res.json({
    totalSaccos: db.saccos.length, activeSaccos, trialSaccos, suspendedSaccos,
    totalRiders, totalSavings, totalLoans, totalRevenue, monthRevenue,
    saccoStats,
    recentPayments: [...db.subscriptionPayments].reverse().slice(0, 10),
    recentAudit:    [...db.auditLog].reverse().slice(0, 20)
  });
});

// MASTER — GET ALL SACCOs
app.get("/api/master/saccos", requireMaster, (req, res) => {
  const db = readDB();
  const saccos = db.saccos.map(s => {
    const riders = db.riders.filter(r => r.saccoId === s.id);
    const savings = db.savings.filter(sv => sv.saccoId === s.id && !sv.reversed).reduce((sum, sv) => sum + sv.amount, 0);
    const lastPay = db.subscriptionPayments.filter(p => p.saccoId === s.id).sort((a,b) => new Date(b.date) - new Date(a.date))[0];
    return { ...s, riderCount: riders.length, totalSavings: savings, lastPayment: lastPay || null };
  });
  res.json(saccos);
});

// MASTER — CREATE NEW SACCO (when a client pays you)
app.post("/api/master/saccos", requireMaster, (req, res) => {
  const { name, location, chairpersonName, chairpersonPhone, chairpersonEmail, plan, setupFeePaid } = req.body;
  if (!name || !location || !chairpersonName || !chairpersonPhone || !plan)
    return res.status(400).json({ error: "All fields required." });

  const db       = readDB();
  const plans    = db.platformSettings.plans;
  const planInfo = plans[plan];
  if (!planInfo) return res.status(400).json({ error: "Invalid plan selected." });

  const saccoId = genId();

  // Trial period — 14 days free
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + (db.platformSettings.trialDays || 14));

  // Create the SACCO
  const newSacco = {
    id: saccoId, name, location,
    chairpersonName, chairpersonPhone, chairpersonEmail: chairpersonEmail || "",
    plan, status: "trial",
    trialEndsAt: trialEnd.toISOString(),
    subscriptionDueDate: trialEnd.toISOString(),
    setupFeePaid: setupFeePaid || false,
    createdAt: now(),
    settings: {
      minDeposit: 1000,
      maxDeposit: 5000000,
      defaultInterestRate: 10,
      maxLoanMultiplier: 3,
      latePenaltyPercent: 5,
      dualApprovalThreshold: 500000,
      maxLoginAttempts: 3,
      lockoutMinutes: 30
    }
  };
  db.saccos.push(newSacco);

  // Create chairman admin account automatically
  const chairUsername = name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") + "_admin";
  const chairPassword = Math.random().toString(36).substr(2, 8).toUpperCase() + "!";
  const newAdmin = {
    id: genId(), saccoId, username: chairUsername,
    password: chairPassword, role: "superadmin",
    name: chairpersonName, phone: chairpersonPhone,
    createdAt: now(), createdBy: req.master.name
  };
  db.admins.push(newAdmin);

  auditLog(db, req.master.name, saccoId, "CREATE_SACCO", `Created SACCO: ${name} on ${plan} plan. Chairman: ${chairpersonName}`);
  writeDB(db);

  console.log(`[NEW SACCO] ${name} created. Chairman login: ${chairUsername} / ${chairPassword}`);
  res.json({
    message: `SACCO "${name}" created successfully! Trial period: ${db.platformSettings.trialDays} days.`,
    sacco: newSacco,
    chairmanLogin: { username: chairUsername, password: chairPassword },
    trialEndsAt: trialEnd.toISOString()
  });
});

// MASTER — SUSPEND SACCO
app.put("/api/master/saccos/:id/suspend", requireMaster, (req, res) => {
  const { reason } = req.body;
  const db  = readDB();
  const idx = db.saccos.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "SACCO not found." });
  db.saccos[idx].status          = "suspended";
  db.saccos[idx].suspendedReason = reason || "Suspended by platform admin";
  db.saccos[idx].suspendedAt     = now();
  auditLog(db, req.master.name, req.params.id, "SUSPEND_SACCO", reason || "Manual suspension");
  writeDB(db);
  res.json({ message: `SACCO "${db.saccos[idx].name}" suspended.` });
});

// MASTER — REACTIVATE SACCO
app.put("/api/master/saccos/:id/activate", requireMaster, (req, res) => {
  const db  = readDB();
  const idx = db.saccos.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "SACCO not found." });

  // Set next due date 30 days from now
  const nextDue = new Date(); nextDue.setDate(nextDue.getDate() + 30);
  db.saccos[idx].status              = "active";
  db.saccos[idx].subscriptionDueDate = nextDue.toISOString();
  db.saccos[idx].suspendedReason     = null;
  db.saccos[idx].suspendedAt         = null;

  auditLog(db, req.master.name, req.params.id, "ACTIVATE_SACCO", `Reactivated. Next due: ${nextDue.toLocaleDateString()}`);
  writeDB(db);
  res.json({ message: `SACCO reactivated. Next payment due: ${nextDue.toLocaleDateString()}` });
});

// MASTER — RECORD SUBSCRIPTION PAYMENT
app.post("/api/master/saccos/:id/payment", requireMaster, (req, res) => {
  const { amount, method, reference } = req.body;
  if (!amount) return res.status(400).json({ error: "Amount required." });

  const db  = readDB();
  const idx = db.saccos.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "SACCO not found." });

  // Record payment
  const payment = {
    id: genId(), saccoId: req.params.id,
    saccoName: db.saccos[idx].name,
    amount: parseFloat(amount), method: method || "cash",
    reference: reference || "REF-" + Date.now(),
    date: now(), recordedBy: req.master.name
  };
  db.subscriptionPayments.push(payment);

  // Activate SACCO and set next due date
  const nextDue = new Date(); nextDue.setDate(nextDue.getDate() + 30);
  db.saccos[idx].status              = "active";
  db.saccos[idx].subscriptionDueDate = nextDue.toISOString();
  db.saccos[idx].suspendedReason     = null;

  auditLog(db, req.master.name, req.params.id, "SUBSCRIPTION_PAYMENT", `UGX ${amount} received. Next due: ${nextDue.toLocaleDateString()}`);
  writeDB(db);

  console.log(`[PAYMENT] ${db.saccos[idx].name} paid UGX ${Number(amount).toLocaleString()}. Next due: ${nextDue.toLocaleDateString()}`);
  res.json({ message: "Payment recorded! SACCO activated.", payment, nextDueDate: nextDue.toISOString() });
});

// MASTER — UPDATE SACCO PLAN
app.put("/api/master/saccos/:id/plan", requireMaster, (req, res) => {
  const { plan } = req.body;
  const db  = readDB();
  const idx = db.saccos.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "SACCO not found." });
  if (!db.platformSettings.plans[plan]) return res.status(400).json({ error: "Invalid plan." });
  db.saccos[idx].plan = plan;
  auditLog(db, req.master.name, req.params.id, "CHANGE_PLAN", `Changed to ${plan} plan`);
  writeDB(db);
  res.json({ message: `Plan updated to ${plan}.` });
});

// MASTER — DELETE SACCO (with all data)
app.delete("/api/master/saccos/:id", requireMaster, (req, res) => {
  const db    = readDB();
  const sacco = db.saccos.find(s => s.id === req.params.id);
  if (!sacco) return res.status(404).json({ error: "SACCO not found." });

  // Remove all SACCO data
  db.saccos      = db.saccos.filter(s => s.id !== req.params.id);
  db.admins      = db.admins.filter(a => a.saccoId !== req.params.id);
  db.riders      = db.riders.filter(r => r.saccoId !== req.params.id);
  db.savings     = db.savings.filter(s => s.saccoId !== req.params.id);
  db.loans       = db.loans.filter(l => l.saccoId !== req.params.id);
  db.repayments  = db.repayments.filter(r => r.saccoId !== req.params.id);

  auditLog(db, req.master.name, req.params.id, "DELETE_SACCO", `Deleted SACCO: ${sacco.name}`);
  writeDB(db);
  res.json({ message: `SACCO "${sacco.name}" and all its data deleted.` });
});

// MASTER — GET ALL SUBSCRIPTION PAYMENTS
app.get("/api/master/payments", requireMaster, (req, res) => {
  const db = readDB();
  res.json([...db.subscriptionPayments].reverse());
});

// MASTER — UPDATE PLATFORM SETTINGS
app.put("/api/master/settings", requireMaster, (req, res) => {
  const db = readDB();
  db.platformSettings = { ...db.platformSettings, ...req.body };
  auditLog(db, req.master.name, null, "UPDATE_PLATFORM_SETTINGS", "Platform settings updated");
  writeDB(db);
  res.json({ message: "Platform settings updated.", settings: db.platformSettings });
});

// MASTER — RESET ADMIN PASSWORD
app.put("/api/master/admins/:id/resetpassword", requireMaster, (req, res) => {
  const { newPassword } = req.body;
  const db  = readDB();
  const idx = db.admins.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Admin not found." });
  db.admins[idx].password = newPassword;
  auditLog(db, req.master.name, db.admins[idx].saccoId, "RESET_ADMIN_PASSWORD", `Reset password for ${db.admins[idx].name}`);
  writeDB(db);
  res.json({ message: "Password reset successfully." });
});

// MASTER — GET SACCO ADMINS (with credentials)
app.get("/api/master/saccos/:id/admins", requireMaster, (req, res) => {
  const db = readDB();
  const admins = db.admins.filter(a => a.saccoId === req.params.id);
  res.json(admins); // includes passwords — master only
});

// MASTER — VIEW FULL AUDIT LOG
app.get("/api/master/audit", requireMaster, (req, res) => {
  const db = readDB();
  res.json([...db.auditLog].reverse().slice(0, 500));
});

// MASTER — BACKUP STATUS
app.get("/api/master/backups", requireMaster, (req, res) => {
  const files = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith("backup-")).sort().reverse();
  res.json({ backups: files, count: files.length });
});

// ============================================================
// ============================================================
// SACCO ADMIN ROUTES (SACCO Chairman & Treasurer)
// P2 — All routes filtered by saccoId
// ============================================================
// ============================================================

// ADMIN LOGIN
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Username and password required." });

  const db    = readDB();
  const admin = db.admins.find(a => a.username === username && a.password === password);
  if (!admin) return res.status(401).json({ error: "Invalid credentials." });

  // P3 — Check if SACCO is suspended
  const sacco = db.saccos.find(s => s.id === admin.saccoId);
  if (!sacco) return res.status(404).json({ error: "SACCO not found." });
  if (sacco.status === "suspended") {
    return res.status(403).json({ error: `Your SACCO is suspended: ${sacco.suspendedReason}. Contact BodaSACCO support.` });
  }

  const token = genToken();
  adminSessions[token] = {
    id: admin.id, name: admin.name, username: admin.username,
    role: admin.role, saccoId: admin.saccoId, saccoName: sacco.name,
    lastActive: Date.now()
  };
  auditLog(db, admin.name, admin.saccoId, "ADMIN_LOGIN", `${admin.name} logged in`);
  writeDB(db);
  res.json({ token, admin: { name: admin.name, role: admin.role, saccoName: sacco.name, plan: sacco.plan, status: sacco.status, subscriptionDueDate: sacco.subscriptionDueDate } });
});

app.post("/api/logout", requireAdmin, (req, res) => {
  delete adminSessions[req.headers["x-session-token"]];
  res.json({ message: "Logged out." });
});

// ADMIN DASHBOARD — P2: only their SACCO data
app.get("/api/dashboard", requireAdmin, (req, res) => {
  const db      = readDB();
  const saccoId = saccoFilter(req);
  const n       = new Date();
  const withinDays = (dateStr, days) => (n - new Date(dateStr)) / (1000 * 60 * 60 * 24) <= days;

  const mySavings    = db.savings.filter(s => s.saccoId === saccoId && !s.reversed);
  const myLoans      = db.loans.filter(l => l.saccoId === saccoId);
  const myRepayments = db.repayments.filter(r => r.saccoId === saccoId);
  const myRiders     = db.riders.filter(r => r.saccoId === saccoId);

  const savingsTrend = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(n); d.setDate(d.getDate() - i);
    savingsTrend.push({
      label: d.toLocaleDateString("en-UG", { weekday: "short" }),
      total: mySavings.filter(s => new Date(s.date).toDateString() === d.toDateString()).reduce((sum, s) => sum + s.amount, 0)
    });
  }

  const sacco = db.saccos.find(s => s.id === saccoId);
  res.json({
    totalSavings:   mySavings.reduce((s, d) => s + d.amount, 0),
    todaySavings:   mySavings.filter(d => withinDays(d.date, 1)).reduce((s, d) => s + d.amount, 0),
    weeklySavings:  mySavings.filter(d => withinDays(d.date, 7)).reduce((s, d) => s + d.amount, 0),
    totalLoaned:    myLoans.reduce((s, l) => s + l.amount, 0),
    totalRepaid:    myRepayments.reduce((s, r) => s + r.amount, 0),
    availableCash:  mySavings.reduce((s, d) => s + d.amount, 0) - myLoans.reduce((s, l) => s + l.amount, 0) + myRepayments.reduce((s, r) => s + r.amount, 0),
    totalRiders:    myRiders.length,
    activeLoans:    myLoans.filter(l => l.status === "active").length,
    overdueLoans:   myLoans.filter(l => l.status === "overdue").length,
    pendingLoans:   myLoans.filter(l => l.status === "pending").length,
    pendingDeposits:(db.depositRequests || []).filter(d => d.saccoId === saccoId && d.status === "pending").length,
    savingsTrend,
    subscription: { status: sacco?.status, dueDate: sacco?.subscriptionDueDate, plan: sacco?.plan }
  });
});

// SACCOS — admin sees only their own
app.get("/api/saccos", requireAdmin, (req, res) => {
  const db    = readDB();
  const sacco = db.saccos.find(s => s.id === req.admin.saccoId);
  res.json(sacco ? [sacco] : []);
});

// RIDERS — P2: filtered by saccoId
app.get("/api/riders", requireAdmin, (req, res) => {
  const db      = readDB();
  const saccoId = saccoFilter(req);
  const { search, status } = req.query;
  let riders = db.riders.filter(r => r.saccoId === saccoId).map(r => {
    const riderSavings = db.savings.filter(s => s.riderId === r.id && !s.reversed).reduce((sum, s) => sum + s.amount, 0);
    const activeLoan   = db.loans.find(l => l.riderId === r.id && (l.status === "active" || l.status === "overdue"));
    return { ...r, pin: undefined, totalSavings: riderSavings, activeLoan: activeLoan || null };
  });
  if (search) riders = riders.filter(r => r.name.toLowerCase().includes(search.toLowerCase()) || r.phone.includes(search));
  if (status) riders = riders.filter(r => r.status === status);
  res.json(riders);
});

app.get("/api/riders/:id", requireAdmin, (req, res) => {
  const db    = readDB();
  const rider = db.riders.find(r => r.id === req.params.id && r.saccoId === req.admin.saccoId);
  if (!rider) return res.status(404).json({ error: "Rider not found." });
  const riderSavings = db.savings.filter(s => s.riderId === rider.id && !s.reversed);
  const riderLoans   = db.loans.filter(l => l.riderId === rider.id);
  const riderRepay   = db.repayments.filter(r => r.riderId === rider.id);
  const totalSavings = riderSavings.reduce((s, d) => s + d.amount, 0);
  const insights     = [];
  const recent30     = riderSavings.filter(s => (new Date() - new Date(s.date)) / (1000 * 60 * 60 * 24) <= 30);
  if (recent30.length >= 4) insights.push({ type: "positive", text: "Consistent saver — eligible for a loan!" });
  if (recent30.length === 0 && riderSavings.length) insights.push({ type: "warning", text: "No savings this month." });
  if (riderLoans.find(l => l.status === "overdue")) insights.push({ type: "danger", text: "Overdue loan — At Risk." });
  res.json({ ...rider, pin: undefined, totalSavings, savings: riderSavings, loans: riderLoans, repayments: riderRepay, insights });
});

app.post("/api/riders", requireAdmin, (req, res) => {
  const { name, phone, stage, pin, nationalId } = req.body;
  if (!name || !phone) return res.status(400).json({ error: "Name and phone required." });
  const db      = readDB();
  const saccoId = saccoFilter(req);
  if (db.riders.find(r => r.phone === phone)) return res.status(409).json({ error: "Phone already registered." });
  const newRider = { id: genId(), saccoId, name, phone, stage: stage || "", nationalId: nationalId || "", pin: pin || "1234", status: "pending", loanLimit: 0, createdAt: now() };
  db.riders.push(newRider);
  auditLog(db, req.admin.name, saccoId, "REGISTER_RIDER", `Registered: ${name} (${phone})`);
  writeDB(db);
  res.json({ message: "Rider registered!", rider: newRider });
});

app.put("/api/riders/:id/status", requireAdmin, (req, res) => {
  const db    = readDB();
  const rider = db.riders.find(r => r.id === req.params.id && r.saccoId === req.admin.saccoId);
  if (!rider) return res.status(404).json({ error: "Rider not found." });
  rider.status = req.body.status;
  auditLog(db, req.admin.name, req.admin.saccoId, "RIDER_STATUS", `${rider.name} → ${req.body.status}`);
  writeDB(db);
  res.json({ message: `Rider ${req.body.status}.` });
});

app.put("/api/riders/:id/loanlimit", requireAdmin, (req, res) => {
  const db    = readDB();
  const rider = db.riders.find(r => r.id === req.params.id && r.saccoId === req.admin.saccoId);
  if (!rider) return res.status(404).json({ error: "Rider not found." });
  rider.loanLimit = parseFloat(req.body.loanLimit);
  auditLog(db, req.admin.name, req.admin.saccoId, "SET_LOAN_LIMIT", `${rider.name}: UGX ${req.body.loanLimit}`);
  writeDB(db);
  res.json({ message: "Loan limit updated." });
});

// SAVINGS — P2: filtered by saccoId
app.get("/api/savings", requireAdmin, (req, res) => {
  const db      = readDB();
  const saccoId = saccoFilter(req);
  const { riderId, from, to } = req.query;
  let savings = db.savings.filter(s => s.saccoId === saccoId).map(s => {
    const rider = db.riders.find(r => r.id === s.riderId);
    return { ...s, riderName: rider ? rider.name : "—", riderPhone: rider ? rider.phone : "—" };
  });
  if (riderId) savings = savings.filter(s => s.riderId === riderId);
  if (from)    savings = savings.filter(s => new Date(s.date) >= new Date(from));
  if (to)      savings = savings.filter(s => new Date(s.date) <= new Date(to));
  savings.sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json(savings);
});

app.post("/api/savings", requireAdmin, (req, res) => {
  const { riderId, amount, method, reference } = req.body;
  if (!riderId || !amount) return res.status(400).json({ error: "Rider and amount required." });
  const db      = readDB();
  const saccoId = saccoFilter(req);
  const rider   = db.riders.find(r => r.id === riderId && r.saccoId === saccoId);
  if (!rider) return res.status(404).json({ error: "Rider not found in your SACCO." });
  if (rider.status !== "approved") return res.status(400).json({ error: "Rider must be approved." });
  const sacco    = db.saccos.find(s => s.id === saccoId);
  const settings = sacco?.settings || {};
  const amt      = parseFloat(amount);
  if (settings.minDeposit && amt < settings.minDeposit) return res.status(400).json({ error: `Min deposit: UGX ${settings.minDeposit.toLocaleString()}` });
  if (settings.maxDeposit && amt > settings.maxDeposit) return res.status(400).json({ error: `Max deposit: UGX ${settings.maxDeposit.toLocaleString()}` });
  const dep = { id: genId(), saccoId, riderId, amount: amt, method: method || "cash", reference: reference || "", date: now(), reversed: false, recordedBy: req.admin.name };
  db.savings.push(dep);
  auditLog(db, req.admin.name, saccoId, "DEPOSIT", `UGX ${amt} for ${rider.name}`);
  writeDB(db);
  console.log(`[SMS] To ${rider.phone}: UGX ${Number(amt).toLocaleString()} savings received. BodaSACCO.`);
  res.json({ message: "Deposit recorded!", deposit: dep });
});

app.put("/api/savings/:id/reverse", requireAdmin, requireSuper, (req, res) => {
  const db  = readDB();
  const idx = db.savings.findIndex(s => s.id === req.params.id && s.saccoId === req.admin.saccoId);
  if (idx === -1) return res.status(404).json({ error: "Deposit not found." });
  db.savings[idx].reversed   = true;
  db.savings[idx].reversedBy = req.admin.name;
  db.savings[idx].reversedAt = now();
  auditLog(db, req.admin.name, req.admin.saccoId, "REVERSE_DEPOSIT", `Reversed deposit ${req.params.id}`);
  writeDB(db);
  res.json({ message: "Deposit reversed." });
});

// DEPOSIT REQUESTS
app.get("/api/deposit-requests", requireAdmin, (req, res) => {
  const db      = readDB();
  const saccoId = saccoFilter(req);
  const requests = (db.depositRequests || []).filter(d => d.saccoId === saccoId).map(r => {
    const rider = db.riders.find(rd => rd.id === r.riderId);
    return { ...r, riderName: rider ? rider.name : "—" };
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(requests);
});

app.put("/api/deposit-requests/:id/confirm", requireAdmin, (req, res) => {
  const db      = readDB();
  const saccoId = saccoFilter(req);
  if (!db.depositRequests) return res.status(404).json({ error: "No requests." });
  const reqIdx = db.depositRequests.findIndex(r => r.id === req.params.id && r.saccoId === saccoId);
  if (reqIdx === -1) return res.status(404).json({ error: "Request not found." });
  const depositReq = db.depositRequests[reqIdx];
  const rider = db.riders.find(r => r.id === depositReq.riderId);
  const dep = { id: genId(), saccoId, riderId: depositReq.riderId, amount: depositReq.amount, method: "cash", reference: "CASH-" + Date.now(), date: now(), reversed: false, recordedBy: req.admin.name };
  db.savings.push(dep);
  db.depositRequests[reqIdx].status      = "confirmed";
  db.depositRequests[reqIdx].confirmedBy = req.admin.name;
  db.depositRequests[reqIdx].confirmedAt = now();
  auditLog(db, req.admin.name, saccoId, "CONFIRM_DEPOSIT", `Confirmed UGX ${depositReq.amount} for ${rider?.name}`);
  writeDB(db);
  if (rider) console.log(`[SMS] To ${rider.phone}: Cash deposit UGX ${Number(depositReq.amount).toLocaleString()} confirmed. BodaSACCO.`);
  res.json({ message: "Cash deposit confirmed!", deposit: dep });
});

app.put("/api/deposit-requests/:id/reject", requireAdmin, (req, res) => {
  const db      = readDB();
  const saccoId = saccoFilter(req);
  const reqIdx  = (db.depositRequests || []).findIndex(r => r.id === req.params.id && r.saccoId === saccoId);
  if (reqIdx === -1) return res.status(404).json({ error: "Request not found." });
  db.depositRequests[reqIdx].status     = "rejected";
  db.depositRequests[reqIdx].rejectedBy = req.admin.name;
  writeDB(db);
  res.json({ message: "Request rejected." });
});

// MOBILE MONEY
app.post("/api/savings/mobilemoney", requireAdmin, (req, res) => {
  const { riderId, amount, phone, network } = req.body;
  if (!riderId || !amount || !phone || !network) return res.status(400).json({ error: "All fields required." });
  const db      = readDB();
  const saccoId = saccoFilter(req);
  const rider   = db.riders.find(r => r.id === riderId && r.saccoId === saccoId);
  if (!rider) return res.status(404).json({ error: "Rider not found." });
  const reference = "MM-" + Date.now();
  const dep = { id: genId(), saccoId, riderId, amount: parseFloat(amount), method: network, reference, date: now(), reversed: false, recordedBy: req.admin.name };
  db.savings.push(dep);
  auditLog(db, req.admin.name, saccoId, "MM_DEPOSIT", `${network} UGX ${amount} for ${rider.name}`);
  writeDB(db);
  res.json({ message: `${network.toUpperCase()} payment sent. (Sandbox). Ref: ${reference}`, reference });
});

// LOANS — P2: filtered by saccoId
app.get("/api/loans", requireAdmin, (req, res) => {
  const db      = readDB();
  const saccoId = saccoFilter(req);
  const { status } = req.query;
  let loans = db.loans.filter(l => l.saccoId === saccoId).map(l => {
    const rider = db.riders.find(r => r.id === l.riderId);
    const paid  = db.repayments.filter(r => r.loanId === l.id).reduce((s, r) => s + r.amount, 0);
    return { ...l, riderName: rider ? rider.name : "—", riderPhone: rider ? rider.phone : "—", totalPaid: paid, remaining: l.totalRepayable - paid };
  });
  if (status) loans = loans.filter(l => l.status === status);
  loans.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(loans);
});

app.post("/api/loans", requireAdmin, (req, res) => {
  const { riderId, amount, interestRate, repaymentMonths } = req.body;
  if (!riderId || !amount) return res.status(400).json({ error: "Rider and amount required." });
  const db      = readDB();
  const saccoId = saccoFilter(req);
  const rider   = db.riders.find(r => r.id === riderId && r.saccoId === saccoId);
  if (!rider) return res.status(404).json({ error: "Rider not found." });
  if (rider.status !== "approved") return res.status(400).json({ error: "Rider must be approved." });
  const existing = db.loans.find(l => l.riderId === riderId && (l.status === "active" || l.status === "overdue"));
  if (existing)  return res.status(400).json({ error: "Rider already has an active loan." });
  const sacco    = db.saccos.find(s => s.id === saccoId);
  const settings = sacco?.settings || {};
  const riderSav = db.savings.filter(s => s.riderId === riderId && !s.reversed).reduce((s, d) => s + d.amount, 0);
  const maxLoan  = rider.loanLimit > 0 ? rider.loanLimit : riderSav * (settings.maxLoanMultiplier || 3);
  if (parseFloat(amount) > maxLoan) return res.status(400).json({ error: `Max loan: UGX ${maxLoan.toLocaleString()}` });
  const rate     = parseFloat(interestRate || settings.defaultInterestRate || 10);
  const months   = parseInt(repaymentMonths || 3);
  const interest = parseFloat(amount) * rate / 100;
  const total    = parseFloat(amount) + interest;
  const dueDate  = new Date(); dueDate.setMonth(dueDate.getMonth() + months);
  const needsDual = parseFloat(amount) >= (settings.dualApprovalThreshold || 500000);
  const loan = { id: genId(), saccoId, riderId, amount: parseFloat(amount), interestRate: rate, interestAmount: interest, totalRepayable: total, repaymentMonths: months, status: "pending", dueDate: dueDate.toISOString(), createdAt: now(), approvedBy: null, secondApprovalNeeded: needsDual, secondApprovedBy: null, penaltyAdded: false, penaltyAmount: 0 };
  db.loans.push(loan);
  auditLog(db, req.admin.name, saccoId, "LOAN_REQUEST", `UGX ${amount} for ${rider.name}`);
  writeDB(db);
  res.json({ message: needsDual ? "Loan created. Requires second admin approval." : "Loan created!", loan });
});

app.put("/api/loans/:id/approve", requireAdmin, (req, res) => {
  const db    = readDB();
  const idx   = db.loans.findIndex(l => l.id === req.params.id && l.saccoId === req.admin.saccoId);
  if (idx === -1) return res.status(404).json({ error: "Loan not found." });
  const loan = db.loans[idx];
  if (loan.status !== "pending") return res.status(400).json({ error: "Loan is not pending." });
  if (loan.secondApprovalNeeded) {
    if (!loan.approvedBy) {
      db.loans[idx].approvedBy = req.admin.name;
      db.loans[idx].approvedAt = now();
      auditLog(db, req.admin.name, req.admin.saccoId, "LOAN_FIRST_APPROVAL", `First approval loan ${loan.id}`);
      writeDB(db);
      return res.json({ message: "First approval done. A second admin must also approve." });
    } else if (loan.approvedBy === req.admin.name) {
      return res.status(400).json({ error: "You already approved. A different admin must give second approval." });
    }
    db.loans[idx].secondApprovedBy = req.admin.name;
    db.loans[idx].secondApprovedAt = now();
    db.loans[idx].status           = "active";
  } else {
    db.loans[idx].approvedBy = req.admin.name;
    db.loans[idx].approvedAt = now();
    db.loans[idx].status     = "active";
  }
  const rider = db.riders.find(r => r.id === loan.riderId);
  auditLog(db, req.admin.name, req.admin.saccoId, "LOAN_APPROVED", `Approved UGX ${loan.amount} for ${rider?.name}`);
  writeDB(db);
  if (rider) console.log(`[SMS] To ${rider.phone}: Loan UGX ${Number(loan.amount).toLocaleString()} APPROVED. Due: ${new Date(loan.dueDate).toLocaleDateString()}. BodaSACCO.`);
  res.json({ message: "Loan approved!", loan: db.loans[idx] });
});

app.put("/api/loans/:id/reject", requireAdmin, (req, res) => {
  const db  = readDB();
  const idx = db.loans.findIndex(l => l.id === req.params.id && l.saccoId === req.admin.saccoId);
  if (idx === -1) return res.status(404).json({ error: "Loan not found." });
  db.loans[idx].status = "rejected";
  auditLog(db, req.admin.name, req.admin.saccoId, "LOAN_REJECTED", `Rejected loan ${req.params.id}`);
  writeDB(db);
  res.json({ message: "Loan rejected." });
});

app.post("/api/loans/:id/repay", requireAdmin, (req, res) => {
  const { amount } = req.body;
  const db  = readDB();
  const loan = db.loans.find(l => l.id === req.params.id && l.saccoId === req.admin.saccoId);
  if (!loan) return res.status(404).json({ error: "Loan not found." });
  const paid      = db.repayments.filter(r => r.loanId === loan.id).reduce((s, r) => s + r.amount, 0);
  const remaining = loan.totalRepayable - paid;
  const actual    = Math.min(parseFloat(amount), remaining);
  db.repayments.push({ id: genId(), saccoId: req.admin.saccoId, loanId: loan.id, riderId: loan.riderId, amount: actual, date: now(), recordedBy: req.admin.name });
  if (paid + actual >= loan.totalRepayable) db.loans[db.loans.findIndex(l => l.id === loan.id)].status = "paid";
  const rider = db.riders.find(r => r.id === loan.riderId);
  auditLog(db, req.admin.name, req.admin.saccoId, "LOAN_REPAYMENT", `UGX ${actual} for loan ${loan.id}`);
  writeDB(db);
  if (rider) console.log(`[SMS] To ${rider.phone}: Repayment UGX ${Number(actual).toLocaleString()} received. Remaining: UGX ${Number(remaining-actual).toLocaleString()}. BodaSACCO.`);
  res.json({ message: "Repayment recorded!", remaining: remaining - actual });
});

// REPORTS — P2: only their SACCO
app.get("/api/reports/summary", requireAdmin, (req, res) => {
  const db      = readDB();
  const saccoId = saccoFilter(req);
  const { period } = req.query;
  const days    = period === "day" ? 1 : period === "week" ? 7 : 30;
  const cutoff  = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const mySav   = db.savings.filter(s => s.saccoId === saccoId && !s.reversed);
  const myLoans = db.loans.filter(l => l.saccoId === saccoId);
  const myRep   = db.repayments.filter(r => r.saccoId === saccoId);
  const savMap  = {};
  mySav.forEach(s => { savMap[s.riderId] = (savMap[s.riderId] || 0) + s.amount; });
  const topSavers = Object.entries(savMap).map(([riderId, total]) => {
    const rider = db.riders.find(r => r.id === riderId);
    return { name: rider ? rider.name : "?", phone: rider ? rider.phone : "?", total };
  }).sort((a, b) => b.total - a.total).slice(0, 5);
  const defaulters = myLoans.filter(l => l.status === "overdue").map(l => {
    const rider = db.riders.find(r => r.id === l.riderId);
    const paid  = myRep.filter(r => r.loanId === l.id).reduce((s, r) => s + r.amount, 0);
    return { riderName: rider?.name || "?", phone: rider?.phone || "?", loanAmount: l.amount, remaining: l.totalRepayable - paid, dueDate: l.dueDate, penalty: l.penaltyAmount || 0 };
  });
  res.json({
    period,
    totalSavings:  mySav.filter(s => new Date(s.date) >= cutoff).reduce((s, d) => s + d.amount, 0),
    totalDeposits: mySav.filter(s => new Date(s.date) >= cutoff).length,
    totalLoans:    myLoans.filter(l => new Date(l.createdAt) >= cutoff).reduce((s, l) => s + l.amount, 0),
    totalRepaid:   myRep.filter(r => new Date(r.date) >= cutoff).reduce((s, r) => s + r.amount, 0),
    repaymentRate: myLoans.length > 0 ? Math.round((myLoans.filter(l => l.status === "paid").length / myLoans.length) * 100) : 0,
    topSavers, defaulters
  });
});

app.get("/api/reports/export", requireAdmin, (req, res) => {
  const db      = readDB();
  const saccoId = saccoFilter(req);
  const type    = req.query.type || "savings";
  let data      = type === "savings"
    ? db.savings.filter(s => s.saccoId === saccoId).map(s => { const r = db.riders.find(rd => rd.id === s.riderId); return { Date: s.date, Rider: r?.name || "?", Phone: r?.phone || "?", Amount: s.amount, Method: s.method, Reference: s.reference, Reversed: s.reversed }; })
    : db.loans.filter(l => l.saccoId === saccoId).map(l => { const r = db.riders.find(rd => rd.id === l.riderId); const paid = db.repayments.filter(rp => rp.loanId === l.id).reduce((s, rp) => s + rp.amount, 0); return { Date: l.createdAt, Rider: r?.name || "?", Amount: l.amount, Total: l.totalRepayable, Paid: paid, Remaining: l.totalRepayable - paid, Status: l.status }; });
  if (!data.length) return res.send("No data");
  const csv = [Object.keys(data[0]).join(","), ...data.map(row => Object.values(row).join(","))].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename=${type}-report.csv`);
  res.send(csv);
});

// MESSAGES — P2: only their SACCO

// ============================================================
// EXPENSES
// ============================================================
app.get("/api/expenses", requireAdmin, (req, res) => {
  const db = readDB();
  const saccoId = adminSessions[req.headers['x-admin-token']]?.saccoId;
  const expenses = (db.expenses || []).filter(e => e.saccoId === saccoId);
  res.json(expenses);
});

app.post("/api/expenses", requireAdmin, (req, res) => {
  const db = readDB();
  const saccoId = adminSessions[req.headers['x-admin-token']]?.saccoId;
  const admin   = adminSessions[req.headers['x-admin-token']];
  const { category, amount, paidTo, method, description, receipt } = req.body;
  if (!category || !amount || amount <= 0) return res.status(400).json({ error: 'Category and amount required.' });
  if (!db.expenses) db.expenses = [];
  const expense = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2,6),
    saccoId, category, amount: Number(amount),
    paidTo: paidTo || '', method: method || 'cash',
    description: description || '', receipt: receipt || '',
    date: new Date().toISOString(),
    recordedBy: admin?.name || 'Admin'
  };
  db.expenses.push(expense);
  db.auditLog.unshift({ id: genId(), actor: admin?.name, saccoId, action: 'EXPENSE', details: `UGX ${amount} — ${category}`, timestamp: new Date().toISOString() });
  writeDB(db);
  res.json(expense);
});

app.post("/api/messages", requireAdmin, (req, res) => {
  const { target, message } = req.body;
  if (!message) return res.status(400).json({ error: "Message required." });
  const db      = readDB();
  const saccoId = saccoFilter(req);
  let recipients = [];
  if (target === "all")       recipients = db.riders.filter(r => r.saccoId === saccoId && r.status === "approved");
  if (target === "defaulters") {
    const ids = db.loans.filter(l => l.saccoId === saccoId && l.status === "overdue").map(l => l.riderId);
    recipients = db.riders.filter(r => ids.includes(r.id));
  }
  recipients.forEach(r => console.log(`[SMS] To ${r.phone}: ${message}`));
  const msg = { id: genId(), saccoId, target, message, sentTo: recipients.length, sentBy: req.admin.name, sentAt: now() };
  db.messages.push(msg);
  auditLog(db, req.admin.name, saccoId, "SEND_MESSAGE", `Sent to ${recipients.length} riders`);
  writeDB(db);
  res.json({ message: `Sent to ${recipients.length} riders!`, log: msg });
});

app.get("/api/messages", requireAdmin, (req, res) => {
  const db = readDB();
  res.json([...db.messages.filter(m => m.saccoId === req.admin.saccoId)].reverse());
});

// SETTINGS — P2: per-SACCO settings
app.get("/api/settings", requireAdmin, (req, res) => {
  const db    = readDB();
  const sacco = db.saccos.find(s => s.id === req.admin.saccoId);
  res.json(sacco?.settings || {});
});

app.put("/api/settings", requireAdmin, requireSuper, (req, res) => {
  const db  = readDB();
  const idx = db.saccos.findIndex(s => s.id === req.admin.saccoId);
  if (idx === -1) return res.status(404).json({ error: "SACCO not found." });
  db.saccos[idx].settings = { ...db.saccos[idx].settings, ...req.body };
  auditLog(db, req.admin.name, req.admin.saccoId, "UPDATE_SETTINGS", "SACCO settings updated");
  writeDB(db);
  res.json({ message: "Settings saved!", settings: db.saccos[idx].settings });
});

// AUDIT — P2: only their SACCO
app.get("/api/audit", requireAdmin, requireSuper, (req, res) => {
  const db = readDB();
  res.json([...db.auditLog.filter(a => a.saccoId === req.admin.saccoId)].reverse().slice(0, 100));
});

// ============================================================
// ============================================================
// ADMIN — GET OWN PROFILE
// GET /api/admin/profile
// ============================================================
app.get("/api/admin/profile", requireAdmin, (req, res) => {
  const db    = readDB();
  const admin = db.admins.find(a => a.id === req.admin.id);
  if (!admin) return res.status(404).json({ error: "Admin not found." });
  const sacco = db.saccos.find(s => s.id === admin.saccoId);
  res.json({
    id:          admin.id,
    name:        admin.name,
    username:    admin.username,
    role:        admin.role,
    saccoName:   sacco ? sacco.name : "—",
    plan:        sacco ? sacco.plan : "—",
    status:      sacco ? sacco.status : "—",
    dueDate:     sacco ? sacco.subscriptionDueDate : null,
    hasSecurityQ: !!(admin.securityQuestion && admin.securityAnswer && admin.nationalId),
    securityQuestion: admin.securityQuestion || null
  });
});

// ADMIN — CHANGE OWN PASSWORD
// POST /api/admin/changepassword
// ============================================================
app.post("/api/admin/changepassword", requireAdmin, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword)
    return res.status(400).json({ error: "Current and new password required." });
  if (newPassword.length < 6)
    return res.status(400).json({ error: "New password must be at least 6 characters." });

  const db  = readDB();
  const idx = db.admins.findIndex(a => a.id === req.admin.id);
  if (idx === -1) return res.status(404).json({ error: "Admin not found." });

  // Verify current password
  if (db.admins[idx].password !== currentPassword)
    return res.status(401).json({ error: "Current password is incorrect." });

  db.admins[idx].password    = newPassword;
  db.admins[idx].passwordChangedAt = now();
  auditLog(db, req.admin.name, req.admin.saccoId, "CHANGE_PASSWORD", `${req.admin.name} changed their password`);
  writeDB(db);
  res.json({ message: "Password changed successfully! Please remember your new password." });
});

// ============================================================
// ============================================================
// ADMIN — SAVE SECURITY QUESTION
// POST /api/admin/security/setup
// ============================================================
app.post("/api/admin/security/setup", requireAdmin, (req, res) => {
  const { securityQuestion, securityAnswer, nationalId, confirmPassword } = req.body;
  if (!securityQuestion || !securityAnswer || !nationalId || !confirmPassword)
    return res.status(400).json({ error: "All fields are required." });

  const db  = readDB();
  const idx = db.admins.findIndex(a => a.id === req.admin.id);
  if (idx === -1) return res.status(404).json({ error: "Admin not found." });

  // Verify current password
  if (db.admins[idx].password !== confirmPassword)
    return res.status(401).json({ error: "Password is incorrect. Cannot save security settings." });

  // Save security question and answer (lowercased for comparison)
  db.admins[idx].securityQuestion  = securityQuestion;
  db.admins[idx].securityAnswer    = securityAnswer.toLowerCase().trim();
  db.admins[idx].nationalId        = nationalId.toUpperCase().trim();
  db.admins[idx].securitySetAt     = now();

  auditLog(db, req.admin.name, req.admin.saccoId, "SETUP_SECURITY_QUESTION", "Security question and National ID set");
  writeDB(db);
  res.json({ message: "Security settings saved! You can now use these to recover your password." });
});

// FORGOT PASSWORD — Step 1: Verify username exists
// POST /api/admin/forgotpassword/verify
// ============================================================
app.post("/api/admin/forgotpassword/verify", (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: "Username required." });

  const db    = readDB();
  const admin = db.admins.find(a => a.username === username);
  if (!admin) return res.status(404).json({ error: "Username not found. Contact your platform admin." });

  // Return security question based on their account info
  const sacco = db.saccos.find(s => s.id === admin.saccoId);
  res.json({
    found: true,
    adminId: admin.id,
    question: `What is the phone number of the chairman registered for ${sacco ? sacco.name : 'your SACCO'}?`,
    hint: "The phone number used when the SACCO was created"
  });
});

// ============================================================
// FORGOT PASSWORD — Step 2: Answer security question + NID
// POST /api/admin/forgotpassword/answer
// ============================================================
app.post("/api/admin/forgotpassword/answer", (req, res) => {
  const { adminId, answer, nationalId } = req.body;
  if (!adminId || !answer || !nationalId)
    return res.status(400).json({ error: "All fields required." });

  const db    = readDB();
  const admin = db.admins.find(a => a.id === adminId);
  if (!admin) return res.status(404).json({ error: "Admin not found." });

  // Check if security question has been set up
  if (!admin.securityQuestion || !admin.securityAnswer || !admin.nationalId) {
    return res.status(400).json({ error: "You have not set up a security question yet. Please contact your platform admin to reset your password." });
  }

  // Check answer (case insensitive)
  const cleanAnswer = answer.toLowerCase().trim();
  const cleanNID    = nationalId.toUpperCase().trim();

  if (cleanAnswer !== admin.securityAnswer) {
    auditLog(db, admin.username, admin.saccoId, "FORGOT_PASSWORD_FAIL", "Wrong security answer");
    writeDB(db);
    return res.status(401).json({ error: "Incorrect answer. Please try again or contact your platform admin." });
  }

  if (cleanNID !== admin.nationalId) {
    auditLog(db, admin.username, admin.saccoId, "FORGOT_PASSWORD_FAIL", "Wrong National ID");
    writeDB(db);
    return res.status(401).json({ error: "Incorrect National ID. Please try again or contact your platform admin." });
  }

  // Both correct — reveal password
  auditLog(db, admin.username, admin.saccoId, "FORGOT_PASSWORD_SUCCESS", "Password retrieved via security question + NID");
  writeDB(db);
  res.json({ message: "Identity verified!", password: admin.password });
});

// ============================================================
// RIDER PORTAL ROUTES
// ============================================================

app.get("/api/rider/saccos", (req, res) => {
  const db = readDB();
  res.json(db.saccos.filter(s => s.status === "active" || s.status === "trial").map(s => ({ id: s.id, name: s.name, location: s.location })));
});

app.post("/api/rider/register", async (req, res) => {
  const { name, phone, stage, saccoId, pin, nationalId } = req.body;
  if (!name || !phone || !saccoId || !pin || !nationalId)
    return res.status(400).json({ error: "All fields including National ID are required." });
  if (pin.length !== 4 || isNaN(pin)) return res.status(400).json({ error: "PIN must be 4 digits." });
  const db = readDB();
  if (db.riders.find(r => r.phone === phone)) return res.status(409).json({ error: "Phone already registered." });
  if (db.riders.find(r => r.nationalId === nationalId)) return res.status(409).json({ error: "National ID already registered." });
  const sacco = db.saccos.find(s => s.id === saccoId);
  if (!sacco) return res.status(404).json({ error: "SACCO not found." });
  if (sacco.status === "suspended") return res.status(403).json({ error: "This SACCO is currently suspended." });
  const pinHash = await hashPIN(pin);
  const newRider = { id: genId(), saccoId, name, phone, stage: stage || "", nationalId, pin: pinHash, status: "pending", loanLimit: 0, createdAt: now() };
  db.riders.push(newRider);
  auditLog(db, name, saccoId, "SELF_REGISTER", `${name} (${phone}) registered`);
  writeDB(db);
  console.log(`[SMS] To ${phone}: Dear ${name}, registration received. Await admin approval. BodaSACCO.`);
  res.json({ message: "Registration submitted! Wait for your SACCO admin to approve your account." });
});

app.post("/api/rider/login", async (req, res) => {
  const { phone, pin } = req.body;
  if (!phone || !pin) return res.status(400).json({ error: "Phone and PIN required." });
  const db = readDB();
  const lockCheck = checkLockout(phone, db);
  if (!lockCheck.allowed) return res.status(429).json({ error: lockCheck.message });
  const rider = db.riders.find(r => r.phone === phone);
  if (!rider) { recordFail(phone, db); writeDB(db); return res.status(401).json({ error: "Invalid phone or PIN." }); }
  const pinValid = await verifyPIN(pin, rider.pin);
  if (!pinValid) {
    recordFail(phone, db); writeDB(db);
    const left = 3 - (db.loginAttempts[phone]?.count || 0);
    return res.status(401).json({ error: `Wrong PIN. ${left > 0 ? left + " attempts left." : "Account locked for 30 minutes."}` });
  }
  if (rider.status === "pending")   return res.status(403).json({ error: "Account pending admin approval." });
  if (rider.status === "suspended") return res.status(403).json({ error: "Account suspended. Contact your SACCO admin." });
  const sacco = db.saccos.find(s => s.id === rider.saccoId);
  if (sacco?.status === "suspended") return res.status(403).json({ error: "Your SACCO is suspended. Contact your SACCO admin." });
  clearLockout(phone, db); writeDB(db);
  const token = genToken();
  riderSessions[token] = { id: rider.id, name: rider.name, phone: rider.phone, saccoId: rider.saccoId, lastActive: Date.now() };
  res.json({ token, rider: { id: rider.id, name: rider.name, phone: rider.phone, saccoName: sacco?.name || "—", status: rider.status } });
});

app.post("/api/rider/logout", requireRider, (req, res) => {
  delete riderSessions[req.headers["x-rider-token"]];
  res.json({ message: "Logged out." });
});

app.get("/api/rider/dashboard", requireRider, (req, res) => {
  const db      = readDB();
  const rider   = db.riders.find(r => r.id === req.rider.id);
  if (!rider) return res.status(404).json({ error: "Rider not found." });
  const sacco        = db.saccos.find(s => s.id === rider.saccoId);
  const mySavings    = db.savings.filter(s => s.riderId === rider.id && !s.reversed);
  const myLoans      = db.loans.filter(l => l.riderId === rider.id);
  const myRepayments = db.repayments.filter(r => r.riderId === rider.id);
  const totalSavings = mySavings.reduce((s, d) => s + d.amount, 0);
  const settings     = sacco?.settings || {};
  const activeLoan   = myLoans.find(l => l.status === "active" || l.status === "overdue");
  let loanProgress   = null;
  if (activeLoan) {
    const paid      = db.repayments.filter(r => r.loanId === activeLoan.id).reduce((s, r) => s + r.amount, 0);
    const remaining = activeLoan.totalRepayable - paid;
    loanProgress    = { ...activeLoan, paid, remaining, progress: Math.round((paid / activeLoan.totalRepayable) * 100) };
  }
  const savingsTrend = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    savingsTrend.push({ label: d.toLocaleDateString("en-UG", { month: "short" }), total: mySavings.filter(s => { const sd = new Date(s.date); return sd.getMonth() === d.getMonth() && sd.getFullYear() === d.getFullYear(); }).reduce((sum, s) => sum + s.amount, 0) });
  }
  const insights = [];
  const recent30 = mySavings.filter(s => (new Date() - new Date(s.date)) / (1000 * 60 * 60 * 24) <= 30);
  if (recent30.length >= 3)                  insights.push({ type: "positive", text: "You are saving consistently! You may qualify for a loan." });
  if (!recent30.length && mySavings.length)  insights.push({ type: "warning",  text: "No savings this month. Save today to stay on track!" });
  if (activeLoan?.status === "overdue")      insights.push({ type: "danger",   text: `Your loan is OVERDUE! Penalty UGX ${Number(activeLoan.penaltyAmount||0).toLocaleString()} added.` });
  if (!activeLoan && totalSavings > 0)       insights.push({ type: "positive", text: `You can borrow up to UGX ${(totalSavings * (settings.maxLoanMultiplier||3)).toLocaleString()}!` });
  res.json({ rider: { ...rider, pin: undefined, saccoName: sacco?.name || "—" }, totalSavings, maxLoan: rider.loanLimit > 0 ? rider.loanLimit : totalSavings * (settings.maxLoanMultiplier||3), savingsCount: mySavings.length, loanProgress, totalLoans: myLoans.length, paidLoans: myLoans.filter(l => l.status==="paid").length, recentSavings: [...mySavings].reverse().slice(0,5), savingsTrend, insights, settings });
});

app.post("/api/rider/deposit/request", requireRider, (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: "Valid amount required." });
  const db      = readDB();
  const rider   = db.riders.find(r => r.id === req.rider.id);
  const sacco   = db.saccos.find(s => s.id === rider.saccoId);
  const settings = sacco?.settings || {};
  const amt     = parseFloat(amount);
  if (settings.minDeposit && amt < settings.minDeposit) return res.status(400).json({ error: `Min deposit: UGX ${settings.minDeposit.toLocaleString()}` });
  if (settings.maxDeposit && amt > settings.maxDeposit) return res.status(400).json({ error: `Max deposit: UGX ${settings.maxDeposit.toLocaleString()}` });
  if (!db.depositRequests) db.depositRequests = [];
  const request = { id: genId(), saccoId: rider.saccoId, riderId: rider.id, riderName: rider.name, riderPhone: rider.phone, amount: amt, status: "pending", createdAt: now() };
  db.depositRequests.push(request);
  auditLog(db, rider.name, rider.saccoId, "CASH_DEPOSIT_REQUEST", `UGX ${amt} cash deposit request`);
  writeDB(db);
  res.json({ message: `Cash deposit request of UGX ${Number(amt).toLocaleString()} submitted! Bring cash to your SACCO office.` });
});

app.post("/api/rider/deposit", requireRider, (req, res) => {
  const { amount, method, phone } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: "Valid amount required." });
  if ((method === "mtn" || method === "airtel") && !phone) return res.status(400).json({ error: "Phone required for mobile money." });
  const db      = readDB();
  const rider   = db.riders.find(r => r.id === req.rider.id);
  const sacco   = db.saccos.find(s => s.id === rider.saccoId);
  const settings = sacco?.settings || {};
  const amt     = parseFloat(amount);
  if (settings.minDeposit && amt < settings.minDeposit) return res.status(400).json({ error: `Min deposit: UGX ${settings.minDeposit.toLocaleString()}` });
  if (settings.maxDeposit && amt > settings.maxDeposit) return res.status(400).json({ error: `Max deposit: UGX ${settings.maxDeposit.toLocaleString()}` });
  const reference = "MM-" + Date.now();
  const dep = { id: genId(), saccoId: rider.saccoId, riderId: rider.id, amount: amt, method: method || "cash", reference, date: now(), reversed: false, recordedBy: rider.name };
  db.savings.push(dep);
  auditLog(db, rider.name, rider.saccoId, "RIDER_MM_DEPOSIT", `${method} UGX ${amt}`);
  writeDB(db);
  console.log(`[MOBILE MONEY SANDBOX] ${(method||"").toUpperCase()}: UGX ${amt} from ${phone}. Ref: ${reference}`);
  res.json({ message: `Payment of UGX ${Number(amt).toLocaleString()} recorded! Ref: ${reference}`, reference });
});

app.post("/api/rider/loan/request", requireRider, (req, res) => {
  const { amount, repaymentMonths } = req.body;
  if (!amount) return res.status(400).json({ error: "Amount required." });
  const db      = readDB();
  const rider   = db.riders.find(r => r.id === req.rider.id);
  const sacco   = db.saccos.find(s => s.id === rider.saccoId);
  const settings = sacco?.settings || {};
  const existing = db.loans.find(l => l.riderId === rider.id && ["active","overdue","pending"].includes(l.status));
  if (existing) return res.status(400).json({ error: "You already have an active or pending loan." });
  const totalSavings = db.savings.filter(s => s.riderId === rider.id && !s.reversed).reduce((s, d) => s + d.amount, 0);
  const maxLoan      = rider.loanLimit > 0 ? rider.loanLimit : totalSavings * (settings.maxLoanMultiplier||3);
  if (parseFloat(amount) > maxLoan) return res.status(400).json({ error: `Exceeds your limit of UGX ${maxLoan.toLocaleString()}.` });
  const months   = parseInt(repaymentMonths || 3);
  const interest = parseFloat(amount) * (settings.defaultInterestRate||10) / 100;
  const total    = parseFloat(amount) + interest;
  const dueDate  = new Date(); dueDate.setMonth(dueDate.getMonth() + months);
  const loan     = { id: genId(), saccoId: rider.saccoId, riderId: rider.id, amount: parseFloat(amount), interestRate: settings.defaultInterestRate||10, interestAmount: interest, totalRepayable: total, repaymentMonths: months, status: "pending", dueDate: dueDate.toISOString(), createdAt: now(), approvedBy: null, penaltyAdded: false, penaltyAmount: 0 };
  db.loans.push(loan);
  auditLog(db, rider.name, rider.saccoId, "RIDER_LOAN_REQUEST", `UGX ${amount} loan requested`);
  writeDB(db);
  console.log(`[SMS] To ${rider.phone}: Loan UGX ${Number(amount).toLocaleString()} submitted. Awaiting approval. BodaSACCO.`);
  res.json({ message: `Loan request of UGX ${Number(amount).toLocaleString()} submitted! Awaiting admin approval.`, loan });
});

app.post("/api/rider/loan/repay", requireRider, (req, res) => {
  const { loanId, amount, method, phone } = req.body;
  if (!loanId || !amount) return res.status(400).json({ error: "Loan ID and amount required." });
  const db   = readDB();
  const loan = db.loans.find(l => l.id === loanId && l.riderId === req.rider.id);
  if (!loan) return res.status(404).json({ error: "Loan not found." });
  if (loan.status === "paid") return res.status(400).json({ error: "Loan already fully paid." });
  const paid      = db.repayments.filter(r => r.loanId === loan.id).reduce((s, r) => s + r.amount, 0);
  const remaining = loan.totalRepayable - paid;
  const actual    = Math.min(parseFloat(amount), remaining);
  db.repayments.push({ id: genId(), saccoId: loan.saccoId, loanId: loan.id, riderId: req.rider.id, amount: actual, method: method || "cash", phone: phone || "", date: now(), recordedBy: req.rider.name });
  if (paid + actual >= loan.totalRepayable) db.loans[db.loans.findIndex(l => l.id === loanId)].status = "paid";
  auditLog(db, req.rider.name, loan.saccoId, "RIDER_REPAYMENT", `UGX ${actual} repaid on loan ${loanId}`);
  writeDB(db);
  if (method === "mtn" || method === "airtel") console.log(`[MOBILE MONEY SANDBOX] ${method.toUpperCase()} repayment: UGX ${actual} from ${phone}.`);
  const rider = db.riders.find(r => r.id === req.rider.id);
  console.log(`[SMS] To ${rider?.phone}: Repayment UGX ${Number(actual).toLocaleString()} received. Remaining: UGX ${Number(remaining-actual).toLocaleString()}. BodaSACCO.`);
  res.json({ message: `Repayment of UGX ${Number(actual).toLocaleString()} recorded! Remaining: UGX ${Number(remaining-actual).toLocaleString()}`, remaining: remaining - actual });
});

app.get("/api/rider/savings", requireRider, (req, res) => {
  const db = readDB();
  res.json(db.savings.filter(s => s.riderId === req.rider.id && !s.reversed).sort((a,b) => new Date(b.date) - new Date(a.date)));
});

app.get("/api/rider/loans", requireRider, (req, res) => {
  const db = readDB();
  res.json(db.loans.filter(l => l.riderId === req.rider.id).map(l => {
    const paid = db.repayments.filter(r => r.loanId === l.id).reduce((s,r) => s+r.amount, 0);
    return { ...l, paid, remaining: l.totalRepayable - paid, progress: l.totalRepayable > 0 ? Math.round((paid/l.totalRepayable)*100) : 0 };
  }).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

app.get("/api/rider/deposit-requests", requireRider, (req, res) => {
  const db = readDB();
  res.json((db.depositRequests||[]).filter(r => r.riderId === req.rider.id).sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt)));
});

app.get("/api/messages", (req, res) => {
  const db    = readDB();
  const token = req.headers["x-rider-token"];
  if (token && riderSessions[token]) {
    const rider = riderSessions[token];
    res.json([...db.messages.filter(m => m.saccoId === rider.saccoId)].reverse());
  } else {
    res.json([]);
  }
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, () => {
  console.log("==============================================");
  console.log("  BODA SACCO PRO v4.0");
  console.log("==============================================");
  console.log(`  Master Admin: http://localhost:${PORT}/master.html`);
  console.log(`  SACCO Admin:  http://localhost:${PORT}`);
  console.log(`  Rider Portal: http://localhost:${PORT}/rider.html`);
  console.log("==============================================");
  console.log("  MASTER LOGIN: master / master2026");
  console.log("==============================================");
});
