const express = require('express');
const { MongoClient } = require('mongodb');
const crypto = require('crypto');
const path = require('path');

const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/milk');
let dbReady = null;
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

let Cust, Sheet, Set, Emp, Att;
const DEF = { paneerRate: 500, bizName: '' };
const h = fn => (req, res) => fn(req, res)
  .then(r => res.json(r ?? { ok: true }))
  .catch(e => { console.error(e); res.status(500).json({ error: e.message }); });
const prevMonth = ym => { let [y, m] = ym.split('-').map(Number); m--; if (!m) { m = 12; y--; } return `${y}-${String(m).padStart(2, '0')}`; };
const bad = (c, m) => { const e = new Error(m); throw e; };

// One call returns everything needed for a month (like opening the Excel file)
app.get('/api/month/:ym', h(async (req) => {
  const ym = req.params.ym;
  const [customers, sheets, st] = await Promise.all([
    Cust.find().sort({ order: 1 }).toArray(),
    Sheet.find({ month: ym }).toArray(),
    Set.findOne({ _id: 'main' })
  ]);
  return { customers, sheets, settings: { ...DEF, ...(st || {}) } };
}));

// Save one or many day cells: ops = [{m:'2026-11', cid, d:5, f:'m'|'e'|'p', v:number|null}]
app.post('/api/cells', h(async (req) => {
  const ops = (req.body.ops || []).map(o => {
    if (!['m', 'e', 'p'].includes(o.f) || !(o.d >= 1 && o.d <= 31) || !o.cid || !/^\d{4}-\d\d$/.test(o.m)) bad(0, 'bad cell');
    const k = `days.${o.d}.${o.f}`;
    const empty = o.v === null || o.v === '' || isNaN(o.v);
    return { updateOne: { filter: { month: o.m, cid: o.cid },
      update: empty ? { $unset: { [k]: '' } } : { $set: { [k]: Number(o.v) } }, upsert: true } };
  });
  if (ops.length) await Sheet.bulkWrite(ops, { ordered: true });
}));

// Save rate / previous balance / paid / paneer date for one customer-month
app.post('/api/sheet', h(async (req) => {
  const { month, cid, f, v } = req.body;
  if (!['rate', 'prev', 'paid', 'pdate'].includes(f) || !cid || !/^\d{4}-\d\d$/.test(month)) bad(0, 'bad field');
  const val = f === 'pdate' ? String(v || '') : (v === null || v === '' || isNaN(v) ? null : Number(v));
  await Sheet.updateOne({ month, cid }, val === null || val === '' ? { $unset: { [f]: '' } } : { $set: { [f]: val } }, { upsert: true });
}));

// Customers
app.post('/api/customers', h(async (req) => {
  const b = req.body; if (!String(b.name || '').trim()) bad(0, 'Name is required');
  const last = await Cust.find().sort({ order: -1 }).limit(1).toArray();
  const doc = { _id: crypto.randomUUID(), name: b.name.trim(), mobile: b.mobile || '', area: (b.area || '').trim(),
    rate: Number(b.rate) || 60, order: (last[0]?.order || 0) + 1 };
  await Cust.insertOne(doc); return doc;
}));
app.put('/api/customers/:id', h(async (req) => {
  const $set = {}; for (const f of ['name', 'mobile', 'area']) if (f in req.body) $set[f] = String(req.body[f]).trim();
  if ('rate' in req.body) $set.rate = Number(req.body.rate) || 0;
  await Cust.updateOne({ _id: req.params.id }, { $set });
}));
app.delete('/api/customers/:id', h(async (req) => {
  await Cust.deleteOne({ _id: req.params.id });
  await Sheet.deleteMany({ cid: req.params.id });
}));

// ---------- Employees ----------
app.get('/api/staff/:ym', h(async (req) => ({
  employees: await Emp.find().sort({ order: 1 }).toArray(),
  att: await Att.find({ month: req.params.ym }).toArray()
})));
app.post('/api/employees', h(async (req) => {
  const b = req.body; if (!String(b.name || '').trim()) bad(0, 'Name is required');
  const last = await Emp.find().sort({ order: -1 }).limit(1).toArray();
  const doc = { _id: crypto.randomUUID(), name: b.name.trim(), mobile: b.mobile || '', role: b.role || 'Delivery',
    salary: Number(b.salary) || 0, order: (last[0]?.order || 0) + 1 };
  await Emp.insertOne(doc); return doc;
}));
app.put('/api/employees/:id', h(async (req) => {
  const $set = {}; for (const f of ['name', 'mobile', 'role']) if (f in req.body) $set[f] = String(req.body[f]).trim();
  if ('salary' in req.body) $set.salary = Number(req.body.salary) || 0;
  await Emp.updateOne({ _id: req.params.id }, { $set });
}));
app.delete('/api/employees/:id', h(async (req) => {
  await Emp.deleteOne({ _id: req.params.id }); await Att.deleteMany({ eid: req.params.id });
}));
// attendance for one day: v = 'P' present | 'H' half day | 'A' absent | null clears
app.post('/api/att', h(async (req) => {
  const { month, eid, d, v } = req.body;
  if (!eid || !/^\d{4}-\d\d$/.test(month) || !(d >= 1 && d <= 31) || ![null, 'P', 'H', 'A'].includes(v)) bad(0, 'bad attendance');
  const k = `days.${d}`;
  await Att.updateOne({ month, eid }, v ? { $set: { [k]: v } } : { $unset: { [k]: '' } }, { upsert: true });
}));
// advance / paid amount for the month
app.post('/api/attf', h(async (req) => {
  const { month, eid, f, v } = req.body;
  if (!eid || !/^\d{4}-\d\d$/.test(month) || !['advance', 'paid'].includes(f)) bad(0, 'bad field');
  const val = (v === null || v === '' || isNaN(v)) ? null : Number(v);
  await Att.updateOne({ month, eid }, val === null ? { $unset: { [f]: '' } } : { $set: { [f]: val } }, { upsert: true });
}));

app.put('/api/settings', h(async (req) => {
  const $set = {}; if ('paneerRate' in req.body) $set.paneerRate = Number(req.body.paneerRate) || 0;
  if ('bizName' in req.body) $set.bizName = String(req.body.bizName);
  await Set.updateOne({ _id: 'main' }, { $set }, { upsert: true });
}));

// Copy last month's outstanding balance into this month's "previous balance"
app.post('/api/carry', h(async (req) => {
  const month = req.body.month, pm = prevMonth(month);
  const [custs, sheets, st] = await Promise.all([Cust.find().toArray(), Sheet.find({ month: pm }).toArray(), Set.findOne({ _id: 'main' })]);
  const pr = { ...DEF, ...(st || {}) }.paneerRate, by = Object.fromEntries(sheets.map(s => [s.cid, s]));
  const ops = [];
  for (const c of custs) {
    const s = by[c.id || c._id]; if (!s) continue;
    let l = 0, kg = 0; for (const d of Object.values(s.days || {})) { l += (d.m || 0) + (d.e || 0); kg += d.p || 0; }
    const bal = l * (s.rate ?? c.rate ?? 0) + (s.prev || 0) + kg * pr - (s.paid || 0);
    ops.push({ updateOne: { filter: { month, cid: c._id }, update: { $set: { prev: Math.round(bal * 100) / 100 } }, upsert: true } });
  }
  if (ops.length) await Sheet.bulkWrite(ops);
  return { n: ops.length };
}));

// Vercel runs this file as a serverless function. Export the Express app;
// connect to MongoDB lazily and cache the connection across warm invocations.
async function ensureDatabase() {
  if (!dbReady) {
    dbReady = client.connect().then(async () => {
      const db = client.db();
      Emp = db.collection('employees');
      Att = db.collection('attendance');
      Cust = db.collection('customers');
      Sheet = db.collection('sheets');
      Set = db.collection('settings');
      await Sheet.createIndex({ month: 1, cid: 1 }, { unique: true });
      await Att.createIndex({ month: 1, eid: 1 }, { unique: true });
    }).catch(err => {
      dbReady = null; // allow a later request to retry
      throw err;
    });
  }
  return dbReady;
}

app.use(async (req, res, next) => {
  try {
    await ensureDatabase();
    next();
  } catch (err) {
    console.error('MongoDB connection failed:', err);
    res.status(503).json({ error: 'Database connection failed. Check MONGODB_URI and MongoDB Atlas Network Access.' });
  }
});

// Local development only. Vercel imports the exported app and manages the listener.
if (!process.env.VERCEL) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Milk register running → http://localhost:${port}`));
}

module.exports = app;
