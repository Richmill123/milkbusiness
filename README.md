# Milk Register (Node + MongoDB)

Replaces the Excel sheet. Same layout: areas, customers, M / E / P (paneer) for every day,
then Litres, Rate, Milk ₹, Prev balance, Paneer ₹, Total due, Paid, Balance.
Every box you type in is saved to MongoDB automatically.

## Setup (once)
1. Install Node.js 20 or newer (https://nodejs.org).
2. Get a MongoDB: either install MongoDB locally, or make a free cluster at https://www.mongodb.com/atlas
   and copy its connection string.
3. In this folder:
   ```
   npm install
   copy .env.example .env      (Mac/Linux: cp .env.example .env)
   ```
   Open `.env` and paste your connection string into MONGODB_URI.
4. Load your existing Excel (customers + all November quantities):
   ```
   npm run import -- BM_MILK_NOVEMBER_2026.xlsx
   ```
   (add `--dry` to only preview. Safe to run again: it will not create duplicate customers.)
5. Start:
   ```
   npm start
   ```
   Open http://localhost:3000  (on your phone use http://<computer-ip>:3000 on the same Wi-Fi).

## Daily use
- **Dashboard** tab (opens first): today's litres and paneer, month litres, billed / collected / outstanding, litres-per-day chart,
  totals by area, highest outstanding customers, and staff attendance for today (tap to mark).
- **Employees** tab: add staff (name, mobile, role, area, monthly salary). Tap a day to cycle P (present) → H (half day) → A (absent) → blank.
  Pay = salary ÷ days in month × days present (half day = 0.5). Type any Advance taken and the amount Paid; "To pay" shows what is left.
- **Today** tab: pick a date, type Morning / Evening / Paneer for each customer. "Copy yesterday" fills empty boxes.
- **Month Sheet** tab: the full Excel-style grid. Arrow keys / Enter move between boxes. Search by name.
  Edit Rate, Prev bal, Paid and Paneer date on the right. "Bill" opens a detailed monthly customer invoice with date-wise milk and paneer quantities, daily amounts, previous balance, paid amount and balance. Download it as PDF or PNG image, print it, or share the image using your phone share menu / WhatsApp. PDF and image export use browser-loaded html2canvas and jsPDF libraries (internet connection required).
- **Customers** tab: add / edit / delete customers with separate default Morning and Evening litres, change paneer rate and business name.
- **Daily Totals** tab: see morning, evening and combined customer litres for a selected day.
- **Paneer** tab: record milk litres used and paneer kg produced each day; view yield.
- **Expenses** tab: add and delete dated expenses. Dashboard shows today/month expenses and net after expenses.
- **New month**: change the month at the top, then press "Carry last month's balance" on the Month Sheet.
- **Download Excel (CSV)** exports the month.

## Data in MongoDB
- `customers`: name, mobile, area, rate
- `sheets`: one document per customer per month (days → m/e/p, rate, prev, paid, pdate)
- `employees`: name, mobile, role, area, salary
- `attendance`: one document per employee per month (days → P/H/A, advance, paid)
- `settings`: paneer rate, business name
- `expenses`: dated monthly expense entries
- `paneer_production`: daily milk input and paneer output


## Deploy to Vercel
1. Push this folder to GitHub.
2. Import the repository into Vercel. Set the project root to `milk-register` if the repository contains a parent folder.
3. In Vercel → Settings → Environment Variables, add `MONGODB_URI` with your MongoDB Atlas connection string.
4. In MongoDB Atlas → Network Access, allow connections from Vercel (for a quick test, `0.0.0.0/0`; use proper database credentials).
5. Redeploy. The Express app is exported from `server.js` for Vercel's Node.js runtime.
6. Do not upload `.env` or put database credentials in frontend code.

Employee management no longer asks for or displays Area / Route. Existing employee records may still contain an old `area` field in MongoDB; it is ignored by the updated interface.


## Recent improvements

- Invoice PNG rendering now uses a 4× capture scale for sharper downloads and sharing.
- The Month Sheet includes **Share All Bills**. On supported phones, it creates customer-wise PNG files and opens the native share sheet with the files together. If multi-file sharing is unsupported, it downloads the PNGs for selecting together in WhatsApp.
- Editable month-sheet cells, customer/employee fields, attendance, payroll fields and settings are staged locally. Use **Save All Changes** to commit pending edits together. The app warns before leaving a month with unsaved edits.
- A Vercel Cron endpoint creates a database snapshot of each customer's previous-month bill on the first day of each month (Asia/Kolkata). It runs daily at 18:45 UTC and only performs work on the first local day. Snapshots are available at `/api/bills/YYYY-MM`.

### Enable automatic monthly bill snapshots

1. Deploy this project to Vercel with MongoDB configured as `MONGODB_URI`.
2. Add a long random `CRON_SECRET` environment variable in Vercel. Vercel sends this as the Bearer authorization value to scheduled cron requests.
3. Redeploy after adding the environment variable.
4. Confirm the Vercel project has Cron Jobs enabled on its plan.

The monthly job stores invoice data (totals and daily quantities) in MongoDB. It does **not** send WhatsApp messages or create phone-rendered PNG files in the background. Those actions require an app/device session; use **Share All Bills** when you open the app. WhatsApp unattended sending requires WhatsApp Business Platform/API access and is not included in this free workflow.
