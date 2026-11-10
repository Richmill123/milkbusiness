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
4. Load your existing Excel (customers, November quantities, farm production from Sheet 3, and expenses/EMI from Sheet 4):
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
  Edit Rate, Prev bal, Paid and Paneer date on the right. "Bill" prints a customer's monthly bill.
- **Customers** tab: add / edit / delete customers, change paneer rate (₹500/kg) and business name.
- **New month**: change the month at the top, then press "Carry last month's balance" on the Month Sheet.
- **Download Excel (CSV)** exports the month.

## Data in MongoDB
- `customers`: name, mobile, area, rate
- `sheets`: one document per customer per month (days → m/e/p, rate, prev, paid, pdate)
- `employees`: name, mobile, role, area, salary
- `attendance`: one document per employee per month (days → P/H/A, advance, paid)
- `settings`: paneer rate, business name

## Additional registers (Sheets 3 & 4)
- **Farm**: annual cow/group production register with last-year total, Jan–Dec milk, milk rate and feeding cost. Add a row for each cow or herd group; edits save automatically.
- **Expenses**: dated cow-feed, needs, extra, medical, transport, utility and loan/EMI entries. Tracks amount, lender/payee, payable, paid and EMI with monthly totals.
- **Profile**: business name, owner/contact, phone/WhatsApp, email, address, GSTIN, UPI ID and paneer rate. Profile details are saved and printed on customer bills.
- The interface has mobile-first navigation and stacked forms; on the Month Sheet you can still scroll horizontally through the full Excel-style grid.

## Security
The supplied MongoDB connection string is intentionally not included in this package. Copy `.env.example` to `.env` and add your own connection string. Keep `.env` private and never share it.
