-- ============================================================
-- CTG Supply Chain — S&D Portal
-- Database Schema v1.0
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- USERS & ACCESS CONTROL
-- ============================================================
create table public.profiles (
  id           uuid references auth.users(id) on delete cascade primary key,
  email        text not null,
  full_name    text,
  role         text not null default 'project_owner'
               check (role in ('admin', 'supply_chain', 'buyer', 'project_owner')),
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- Brand access per user (many-to-many)
create table public.user_brand_access (
  id         uuid default uuid_generate_v4() primary key,
  user_id    uuid references public.profiles(id) on delete cascade,
  brand      text not null,
  can_edit   boolean default false,
  created_at timestamptz default now(),
  unique(user_id, brand)
);

-- ============================================================
-- MASTER SKU
-- ============================================================
create table public.master_sku (
  id           uuid default uuid_generate_v4() primary key,
  sku          text not null unique,
  description  text not null,
  brand        text not null,
  company      text,
  mfg          text,
  mpn          text,
  moq          integer default 0,
  uom          text default 'Unit',
  lead_time_wk integer default 8,
  avg_selling_price numeric(10,2) default 0,
  safety_stock integer default 0,
  buffer_stock integer default 0,
  status       text default 'Active' check (status in ('Active','Inactive','Discontinued')),
  demand_source text default 'GSheet Forecast / ASP',
  remarks      text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- ============================================================
-- STOCK SNAPSHOT (from WMS daily report)
-- ============================================================
create table public.stock_snapshot (
  id           uuid default uuid_generate_v4() primary key,
  report_date  date not null,
  company      text,
  brand        text,
  master_sku   text references public.master_sku(sku),
  wms_sku      text not null,
  usable_qty   integer default 0,
  atp_qty      integer default 0,
  incoming_qty integer default 0,
  unusable_qty integer default 0,
  created_at   timestamptz default now(),
  unique(report_date, wms_sku)
);

-- ============================================================
-- SALES FORECAST (from Google Form / Google Sheet)
-- ============================================================
create table public.sales_forecast (
  id           uuid default uuid_generate_v4() primary key,
  submission_wk text not null,          -- e.g. 'W18/20'
  year         integer not null,
  project      text not null,
  brand        text not null,
  company      text,
  owner        text,
  total_rm     numeric(12,2),
  notes        text,
  -- Monthly forecast in RM'000
  apr_26 numeric(10,2) default 0,
  may_26 numeric(10,2) default 0,
  jun_26 numeric(10,2) default 0,
  jul_26 numeric(10,2) default 0,
  aug_26 numeric(10,2) default 0,
  sep_26 numeric(10,2) default 0,
  oct_26 numeric(10,2) default 0,
  nov_26 numeric(10,2) default 0,
  dec_26 numeric(10,2) default 0,
  jan_27 numeric(10,2) default 0,
  feb_27 numeric(10,2) default 0,
  mar_27 numeric(10,2) default 0,
  submitted_at timestamptz default now(),
  created_at   timestamptz default now()
);

-- ============================================================
-- SUPPLY INPUT (PO entries)
-- ============================================================
create table public.supply_input (
  id             uuid default uuid_generate_v4() primary key,
  sku            text references public.master_sku(sku),
  brand          text not null,
  supplier       text,
  po_reference   text,
  receipt_date   date,
  receipt_wk     text,            -- e.g. 'WK22' — computed from receipt_date
  qty            integer not null default 0,
  status         text not null default 'Uncommit'
                 check (status in ('Commit','Uncommit')),
  unit_cost      numeric(10,2) default 0,
  remarks        text,
  created_by     uuid references public.profiles(id),
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- ============================================================
-- HISTORICAL DEMAND (B2B + B2C actuals)
-- ============================================================
create table public.historical_demand (
  id           uuid default uuid_generate_v4() primary key,
  brand        text not null,
  company      text,
  sku          text references public.master_sku(sku),
  channel      text check (channel in ('B2B','B2C')),
  iso_year     integer not null,
  iso_week     integer not null,
  wk_label     text not null,       -- e.g. 'WK17'
  qty          integer default 0,
  source       text default 'Packxpert WMS',
  created_at   timestamptz default now(),
  unique(sku, channel, iso_year, iso_week)
);

-- ============================================================
-- SKU WMS MAPPING (for Stock_Snapshot matching)
-- ============================================================
create table public.sku_wms_mapping (
  id           uuid default uuid_generate_v4() primary key,
  master_sku   text references public.master_sku(sku),
  wms_sku      text not null unique,
  brand        text not null,
  mapping_note text,
  created_at   timestamptz default now()
);

-- ============================================================
-- WEEK CALENDAR (4/4/5 rule, pre-computed)
-- ============================================================
create table public.week_calendar (
  id           uuid default uuid_generate_v4() primary key,
  wk_label     text not null unique,   -- 'WK20'
  year         integer not null,
  month        integer not null,
  month_label  text not null,          -- 'May\'26'
  wk_in_year   integer not null,
  wk_in_month  integer not null,
  monday_date  date not null,
  weeks_in_month integer not null      -- 4 or 5 (per 4/4/5 rule)
);

-- ============================================================
-- S&D COMPUTED VIEW
-- Computes weekly balance per SKU dynamically
-- ============================================================
create or replace view public.sd_view as
with
-- Latest stock snapshot per SKU
latest_stock as (
  select distinct on (master_sku)
    master_sku as sku,
    usable_qty as on_hand,
    report_date
  from public.stock_snapshot
  order by master_sku, report_date desc
),
-- Latest forecast per brand (most recent submission week)
latest_forecast as (
  select distinct on (brand)
    brand,
    submission_wk,
    apr_26, may_26, jun_26, jul_26, aug_26, sep_26,
    oct_26, nov_26, dec_26, jan_27, feb_27, mar_27
  from public.sales_forecast
  order by brand, submitted_at desc
),
-- Supply by SKU and week
supply_commit as (
  select sku, receipt_wk, sum(qty) as qty
  from public.supply_input
  where status = 'Commit'
  group by sku, receipt_wk
),
supply_uncommit as (
  select sku, receipt_wk, sum(qty) as qty
  from public.supply_input
  where status = 'Uncommit'
  group by sku, receipt_wk
)
select
  m.sku,
  m.description,
  m.brand,
  m.moq,
  m.uom,
  m.lead_time_wk,
  m.avg_selling_price,
  m.safety_stock,
  m.buffer_stock,
  m.status,
  coalesce(ls.on_hand, 0) as on_hand,
  ls.report_date as stock_date,
  lf.submission_wk as forecast_wk
from public.master_sku m
left join latest_stock ls on ls.sku = m.sku
left join latest_forecast lf on lf.brand = m.brand;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.profiles          enable row level security;
alter table public.user_brand_access enable row level security;
alter table public.master_sku        enable row level security;
alter table public.stock_snapshot    enable row level security;
alter table public.sales_forecast    enable row level security;
alter table public.supply_input      enable row level security;
alter table public.historical_demand enable row level security;
alter table public.sku_wms_mapping   enable row level security;
alter table public.week_calendar     enable row level security;

-- Profiles: users see their own
create policy "Users see own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Master SKU: visible to all authenticated users
create policy "Authenticated users read master_sku"
  on public.master_sku for select
  to authenticated using (true);

create policy "Supply chain and admin can write master_sku"
  on public.master_sku for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
      and role in ('admin', 'supply_chain')
    )
  );

-- Brand access: project owners see only their brands
create policy "Users read brand access"
  on public.user_brand_access for select
  using (user_id = auth.uid());

-- Stock snapshot: visible to authenticated, writable by supply chain
create policy "Authenticated read stock_snapshot"
  on public.stock_snapshot for select to authenticated using (true);

create policy "Supply chain write stock_snapshot"
  on public.stock_snapshot for all to authenticated
  using (exists (select 1 from public.profiles where id=auth.uid() and role in ('admin','supply_chain')));

-- Sales forecast: visible to brand owners
create policy "Users read own brand forecast"
  on public.sales_forecast for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin','supply_chain')
    ) or
    exists (
      select 1 from public.user_brand_access uba
      where uba.user_id = auth.uid() and uba.brand = sales_forecast.brand
    )
  );

-- Supply input: admin/supply_chain/buyer can write
create policy "Read supply_input for own brand"
  on public.supply_input for select to authenticated
  using (
    exists (select 1 from public.profiles where id=auth.uid() and role in ('admin','supply_chain','buyer'))
    or exists (select 1 from public.user_brand_access where user_id=auth.uid() and brand=supply_input.brand)
  );

create policy "Buyer write supply_input"
  on public.supply_input for all to authenticated
  using (exists (select 1 from public.profiles where id=auth.uid() and role in ('admin','supply_chain','buyer')));

-- Historical demand, week calendar, wms mapping: read-only for all authenticated
create policy "Authenticated read historical_demand"
  on public.historical_demand for select to authenticated using (true);
create policy "Authenticated read week_calendar"
  on public.week_calendar for select to authenticated using (true);
create policy "Authenticated read sku_wms_mapping"
  on public.sku_wms_mapping for select to authenticated using (true);

-- ============================================================
-- SEED: 4/4/5 Week Calendar (WK17 2026 → WK52 2027)
-- ============================================================
insert into public.week_calendar (wk_label, year, month, month_label, wk_in_year, wk_in_month, monday_date, weeks_in_month)
values
  ('WK17',2026,4,'Apr''26',17,4,'2026-04-20',4),
  ('WK18',2026,5,'May''26',18,1,'2026-04-27',4),
  ('WK19',2026,5,'May''26',19,2,'2026-05-04',4),
  ('WK20',2026,5,'May''26',20,3,'2026-05-11',4),
  ('WK21',2026,5,'May''26',21,4,'2026-05-18',4),
  ('WK22',2026,6,'Jun''26',22,1,'2026-05-25',5),
  ('WK23',2026,6,'Jun''26',23,2,'2026-06-01',5),
  ('WK24',2026,6,'Jun''26',24,3,'2026-06-08',5),
  ('WK25',2026,6,'Jun''26',25,4,'2026-06-15',5),
  ('WK26',2026,6,'Jun''26',26,5,'2026-06-22',5),
  ('WK27',2026,7,'Jul''26',27,1,'2026-06-29',4),
  ('WK28',2026,7,'Jul''26',28,2,'2026-07-06',4),
  ('WK29',2026,7,'Jul''26',29,3,'2026-07-13',4),
  ('WK30',2026,7,'Jul''26',30,4,'2026-07-20',4),
  ('WK31',2026,8,'Aug''26',31,1,'2026-07-27',5),
  ('WK32',2026,8,'Aug''26',32,2,'2026-08-03',5),
  ('WK33',2026,8,'Aug''26',33,3,'2026-08-10',5),
  ('WK34',2026,8,'Aug''26',34,4,'2026-08-17',5),
  ('WK35',2026,8,'Aug''26',35,5,'2026-08-24',5),
  ('WK36',2026,9,'Sep''26',36,1,'2026-08-31',5),
  ('WK37',2026,9,'Sep''26',37,2,'2026-09-07',5),
  ('WK38',2026,9,'Sep''26',38,3,'2026-09-14',5),
  ('WK39',2026,9,'Sep''26',39,4,'2026-09-21',5),
  ('WK40',2026,9,'Sep''26',40,5,'2026-09-28',5),
  ('WK41',2026,10,'Oct''26',41,1,'2026-10-05',4),
  ('WK42',2026,10,'Oct''26',42,2,'2026-10-12',4),
  ('WK43',2026,10,'Oct''26',43,3,'2026-10-19',4),
  ('WK44',2026,10,'Oct''26',44,4,'2026-10-26',4),
  ('WK45',2026,11,'Nov''26',45,1,'2026-11-02',4),
  ('WK46',2026,11,'Nov''26',46,2,'2026-11-09',4),
  ('WK47',2026,11,'Nov''26',47,3,'2026-11-16',4),
  ('WK48',2026,11,'Nov''26',48,4,'2026-11-23',4),
  ('WK49',2026,12,'Dec''26',49,1,'2026-11-30',5),
  ('WK50',2026,12,'Dec''26',50,2,'2026-12-07',5),
  ('WK51',2026,12,'Dec''26',51,3,'2026-12-14',5),
  ('WK52',2026,12,'Dec''26',52,4,'2026-12-21',5),
  ('WK01',2027,1,'Jan''27',1,1,'2026-12-28',4),
  ('WK02',2027,1,'Jan''27',2,2,'2027-01-04',4),
  ('WK03',2027,1,'Jan''27',3,3,'2027-01-11',4),
  ('WK04',2027,1,'Jan''27',4,4,'2027-01-18',4),
  ('WK05',2027,2,'Feb''27',5,1,'2027-01-25',4),
  ('WK06',2027,2,'Feb''27',6,2,'2027-02-01',4),
  ('WK07',2027,2,'Feb''27',7,3,'2027-02-08',4),
  ('WK08',2027,2,'Feb''27',8,4,'2027-02-15',4),
  ('WK09',2027,3,'Mar''27',9,1,'2027-02-22',5),
  ('WK10',2027,3,'Mar''27',10,2,'2027-03-01',5),
  ('WK11',2027,3,'Mar''27',11,3,'2027-03-08',5),
  ('WK12',2027,3,'Mar''27',12,4,'2027-03-15',5),
  ('WK13',2027,3,'Mar''27',13,5,'2027-03-22',5);

-- ============================================================
-- SEED: SkinDae Master SKU
-- ============================================================
insert into public.master_sku (sku, description, brand, company, mfg, moq, uom, lead_time_wk, avg_selling_price, safety_stock, buffer_stock, status)
values
  ('SDSDCA030','SkinDae, Cell Lift Ampoule, Bottle, 1s, 30ml',     'SkinDae','SKINDAE','DocLab',10000,'Bottle',11,190,  2700,2300,'Active'),
  ('SDSDCA05S','SkinDae, Cell Lift Ampoule Deluxe Sample, 3ml',    'SkinDae','SKINDAE','DocLab',10000,'Bottle',11,0,    2700,2300,'Active'),
  ('SDDLSC030','SkinDae, DocLab UV Cell Fusion Sunscreen, 30ml',   'SkinDae','SKINDAE','DocLab',3000, 'Bottle',8, 0,    100, 200, 'Active'),
  ('SDSDPD01S','SkinDae, Platinum Detox Mud Mask With Scrub, 1s',  'SkinDae','SKINDAE','DocLab',1000, 'Pack',  12,0,    0,   0,   'Active'),
  ('SDSDPM01S','SkinDae, Premium Mask, Pcs, 1s',                   'SkinDae','SKINDAE','DocLab',1000, 'Pcs',   4, 0,    0,   0,   'Active'),
  ('SDSDSH01S','SkinDae, Shipping Box, Box, 1s',                   'SkinDae','SKINDAE','DocLab',2000, 'Box',   8, 0,    200, 200, 'Active');

-- ============================================================
-- SEED: SKU WMS Mapping
-- ============================================================
insert into public.sku_wms_mapping (master_sku, wms_sku, brand, mapping_note)
values
  ('SDSDCA030','SDSDCA030','SkinDae','Exact match'),
  ('SDSDCA05S','SDSDCA05', 'SkinDae','WMS uses SDSDCA05 (no trailing S)'),
  ('SDDLSC030','SDDLSC030','SkinDae','Exact match'),
  ('SDSDPD01S','SDSDPD01S','SkinDae','Exact match'),
  ('SDSDPM01S','SDSDPM01', 'SkinDae','WMS uses SDSDPM01 (no trailing S)'),
  ('SDSDSH01S','SDSDSB01S','SkinDae','WMS uses SDSDSB01S');

-- ============================================================
-- TRIGGER: auto-update updated_at
-- ============================================================
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger on_master_sku_updated
  before update on public.master_sku
  for each row execute procedure public.handle_updated_at();

create trigger on_supply_input_updated
  before update on public.supply_input
  for each row execute procedure public.handle_updated_at();

-- ============================================================
-- TRIGGER: auto-create profile on signup
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
