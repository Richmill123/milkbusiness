// Usage:  npm run import -- path/to/BM_MILK_NOVEMBER_2026.xlsx        (add --dry to only preview)
const XLSX = require('xlsx');
const crypto = require('crypto');
const file = process.argv[2], dry = process.argv.includes('--dry');
if (!file) { console.log('Usage: npm run import -- yourfile.xlsx [--dry]'); process.exit(1); }

const MONTHS = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const n = v => (typeof v === 'number' && isFinite(v)) ? v : null;

function parse(path) {
  const wb = XLSX.readFile(path, { cellDates: true });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null, raw: true });
  const mm = clean(rows[0][0]).toUpperCase().match(/([A-Z]+)\s*-?\s*(\d{4})/);
  if (!mm || !MONTHS.includes(mm[1])) throw new Error('Cannot read month from cell A1 (expected e.g. NOVEMBER-2026)');
  const month = `${mm[2]}-${String(MONTHS.indexOf(mm[1]) + 1).padStart(2, '0')}`;
  const dim = new Date(+mm[2], MONTHS.indexOf(mm[1]) + 1, 0).getDate();
  let area = '', order = 0; const customers = [], sheets = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r], name = clean(row[0]);
    if (!name) continue;
    if (/^(TOTAL|PER DAY|COOLER|EXTRA|SHORTAGE|SUGANYA LINE|C&I)/i.test(name)) continue;
    if (row.slice(1, 95).every(v => v === null || v === '')) { area = name; continue; }   // area heading row
    const id = crypto.randomUUID(), days = {};
    for (let d = 1; d <= dim; d++) {
      const i = 2 + 3 * (d - 1), cell = {};
      ['m', 'e', 'p'].forEach((f, k) => { const v = n(row[i + k]); if (v) cell[f] = v; });
      if (Object.keys(cell).length) days[d] = cell;
    }
    const pd = row[104];
    customers.push({ _id: id, name, mobile: clean(row[1]), area, rate: n(row[97]) || 60, order: ++order });
    sheets.push({ month, cid: id, days, rate: n(row[97]) || 60, prev: n(row[99]) || 0, paid: n(row[102]) || 0,
      pdate: pd instanceof Date ? pd.toISOString().slice(0, 10) : '' });
  }
  const farmRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[2]], {header:1,defval:null,raw:true});
  const cows=[];
  for(let r=1;r<farmRows.length;r++){const row=farmRows[r],name=clean(row[0]);if(!name||/^(TOTAL|RATE|MILK AMOUNT|COW FEED)/i.test(name))continue;
    if(row.slice(1,20).every(v=>v===null||v===''))continue;
    cows.push({name,lastYear:n(row[1])||0,...Object.fromEntries(Array.from({length:12},(_,i)=>['m'+(i+1),n(row[i+2])||0])),rate:n(row[15])||50,feedingCost:n(row[17])||0});
  }
  const expRows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[3]],{header:1,defval:null,raw:true});
  const rawDate=expRows[0]?.[0], expMonth=rawDate instanceof Date?`${rawDate.getFullYear()}-${String(rawDate.getMonth()+1).padStart(2,'0')}`:'2024-03';
  const expenses=[];
  for(let r=2;r<expRows.length;r++){const row=expRows[r],day=Number(row[0]);if(!day||day>31)continue;
    const date=expMonth+'-'+String(day).padStart(2,'0');
    for(const [nameCol,amountCol,category] of [[1,2,'Cow feed'],[3,4,'Needs'],[5,6,'Extra']]){
      const description=clean(row[nameCol]);const amount=n(row[amountCol])||0;
      if(description||amount)expenses.push({month:expMonth,date,category,description:description||category,amount,party:'',payable:0,paid:0,emi:0});
    }
    const party=clean(row[7]),payable=n(row[8])||0,paid=n(row[9])||0,emi=n(row[10])||0;
    if(party||payable||paid||emi)expenses.push({month:expMonth,date,category:'Loan / EMI',description:party||'Monthly payable',amount:paid,party,payable,paid,emi});
  }
  return { month, customers, sheets, cows, farmYear:month.slice(0,4), expenses };
}

(async () => {
  const { month, customers, sheets, cows, farmYear, expenses } = parse(file);
  const areas = [...new Set(customers.map(c => c.area))];
  console.log(`Month: ${month}\nAreas: ${areas.join(' | ')}\nCustomers: ${customers.length}`);
  let litres = 0, kg = 0;
  sheets.forEach(s => Object.values(s.days).forEach(d => { litres += (d.m || 0) + (d.e || 0); kg += d.p || 0; }));
  console.log(`Total milk: ${litres.toFixed(2)} L   Total paneer: ${kg.toFixed(2)} kg`);
  if (dry) return console.log('(dry run – nothing saved)');

  const { MongoClient } = require('mongodb');
  const client = new MongoClient(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/milk');
  await client.connect();
  const db = client.db(), Cust = db.collection('customers'), Sheet = db.collection('sheets');
  await Sheet.createIndex({ month: 1, cid: 1 }, { unique: true });
  const existing = await Cust.find().toArray();
  const key = c => (c.area + '|' + c.name).toLowerCase();
  const have = {};                                            // key -> list of existing ids (handles two customers with the same name)
  existing.forEach(c => (have[key(c)] = have[key(c)] || []).push(c._id));
  const ops = [];
  for (let i = 0; i < customers.length; i++) {                 // re-import safely: match on area+name
    const c = customers[i], s = sheets[i];
    const hit = have[key(c)]?.shift();
    if (hit) s.cid = hit; else await Cust.insertOne(c);
    ops.push({ replaceOne: { filter: { month, cid: s.cid }, replacement: s, upsert: true } });
  }
  await Sheet.bulkWrite(ops);
  console.log(`Saved to MongoDB (${month}).`);
  await client.close();
})().catch(e => { console.error('Import failed:', e.message); process.exit(1); });
