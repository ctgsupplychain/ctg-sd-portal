# CTG Supply Chain — S&D Portal

Supply & Demand management portal for CTG Supply Chain.
Built with Next.js, Supabase, and Vercel — all free tier.

## Stack
- **Frontend**: Next.js 15 + Tailwind CSS → hosted on Vercel (free)
- **Database + Auth**: Supabase (free tier) 
- **Code**: GitHub under ctgsupplychain (free)

## Setup Instructions

### 1. Supabase Database
1. Go to your Supabase project dashboard
2. Click **SQL Editor** → New Query
3. Copy and paste the entire contents of `supabase/migrations/001_initial_schema.sql`
4. Click **Run** — this creates all tables, policies, and seeds SkinDae data

### 2. Environment Variables
```bash
cd frontend
cp .env.local.example .env.local
```
Edit `.env.local` and fill in:
- `NEXT_PUBLIC_SUPABASE_URL` — from Supabase → Settings → API → Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from Supabase → Settings → API → anon public key

### 3. Run Locally
```bash
cd frontend
npm install
npm run dev
```
Open http://localhost:3000

### 4. Deploy to Vercel
1. Push this repo to GitHub (ctgsupplychain/ctg-sd-portal)
2. Go to vercel.com → New Project → Import from GitHub
3. Set root directory to `frontend`
4. Add environment variables (same as .env.local)
5. Click Deploy

### 5. Create First User
1. Go to Supabase → Authentication → Users → Add User
2. Enter email + password for yourself
3. In SQL Editor, run:
```sql
update public.profiles 
set role = 'supply_chain', full_name = 'JiaJie'
where email = 'your@email.com';
```

### 6. Create Project Owner User (e.g. Willson for SkinDae)
```sql
-- After Willson signs up via the portal:
update public.profiles 
set role = 'project_owner', full_name = 'Willson'
where email = 'willson@example.com';

insert into public.user_brand_access (user_id, brand, can_edit)
select id, 'SkinDae', false
from public.profiles where email = 'willson@example.com';
```

## Weekly Workflow
1. Paste inventory report into Stock_Snapshot Excel sheet → data goes into `stock_snapshot` table
2. Google Form submissions auto-populate `sales_forecast` table (via Apps Script)
3. Enter new POs in Supply Input tab on portal
4. S&D recomputes automatically on every page load

## Adding New Brands
1. Add SKUs to `master_sku` table
2. Add brand to a user's `user_brand_access`
3. Done — brand appears in sidebar

## Future: BoldSign PO Approval
When ready, add BoldSign API key to env and the PO workflow triggers automatically 
when a supply_input row is marked 'Commit' with a PO reference.
