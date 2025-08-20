# Mizania+
Custom POS, cashflow, and operations dashboard for a tech repair business.

Mizania+ centralizes daily sales, repairs, inventory, cash handling, transfers, and analytics. It is tailored to phone/computer repair shops with simple workflows, accurate cash tracking, and clean reports.

## Key Features
- Point of Sale (PDV)
  - Inventory-aware sales (prevents negative stock)
  - Services with standardized 60% margin policy (cost derived from price)
  - Ticket printing with jsPDF
- Repairs (Fiches de réparation)
  - Track statuses: Reçu, En cours, Terminé
  - Detailed job sheets and billing
- Inventory Management
  - Fast search, edit, and export
  - Low stock alerts in header notifications and Dashboard
- Cash Management (Encaissements)
  - Daily and range views with local-day boundaries (no UTC shifts)
  - Opening cash fund recorded as internal cash-in (excluded from sales/margins)
  - Duplicate fund protection and update flow
  - Clôture journalière creates a closure marker entry (optional future: auto-transfer to Coffre/Banque)
  - PDF exports for daily report
- Expenses & Transfers
  - Record expenses by wallet and category
  - Safe transfers between wallets (Caisse, Banque, Coffre, Carte Postal, Carte Banker)
  - Wallet balances computed from all movements
- Dashboard & Analytics
  - KPIs, 7-day trend, monthly breakdown
  - Excludes opening fund from revenue, margins, and trends; keeps it in wallet balances
  - Recent activity and operational summaries
- Admin & Security
  - Supabase Auth (email magic links)
  - Role management and invitations

## Tech Stack
- React 18 + Vite
- Material UI (MUI)
- Supabase (Auth + Postgres)
- React Router v6
- jsPDF + jspdf-autotable (PDFs)
- Recharts (charts)
- React Toastify (notifications)

## Getting Started
Prerequisites:
- Node.js 18+
- A Supabase project with public anon key

1) Install dependencies
- Windows PowerShell:
  npm install

2) Configure environment
Create a .env file at the project root:
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_public_anon_key
VITE_SITE_URL=http://localhost:5173
# Optional base path for Vite builds
VITE_BASE_URL=/

3) Run locally
npm run dev

4) Build
npm run build

## Database Notes
The app expects a transactions table, plus optional tables:
- transactions: id, type ('Revenu' | 'Dépense' | 'Transfert' | 'Cloture'), montant, cout_total, description, created_at, wallet?, method?, is_internal?, source?, user_id?
- inventaire: id, nom, sku?, quantite_stock, prix_achat?, prix_vente?
- fiches_reparation: id, statut, …
- clients: id, nom, telephone?, email?
- user_profiles: id, role

Schema flexibility:
- If wallet/method/is_internal columns are absent, the app falls back gracefully.
- Opening fund is detected via is_internal/source='Ouverture'/description contains 'fond de caisse'. It is excluded from revenue/margins but included in wallet balances.

## Deployment (Vercel)
- SPA rewrites via vercel.json:
  { "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
- Set environment vars (VITE_*) in Vercel project settings
- Optionally set VITE_BASE_URL if deploying under a subpath
- Ensure Supabase Auth redirect URL points to your site URL

## Roadmap (optional)
- Clôture that moves cash from Caisse to Coffre/Banque and locks the day
- Attach closure PDF to the entry
- Variance handling (Écart de caisse)

## Credits
- Built by Khalil Zghida for a custom tech repair business workflow

## License
This is a proprietary, closed-source application. All rights reserved © 2025 Khalil Zghida.
- Use is restricted to the client’s internal business operations.
- No redistribution, sublicensing, public hosting, or resale without prior written permission.
- Private repository visibility on GitHub is strongly recommended.
