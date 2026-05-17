-- ============================================================
-- CTG Supply Chain — Demand Forecasting Module
-- Migration: sales_history + demand_forecast tables
-- ============================================================

-- ============================================================
-- SALES HISTORY
-- Raw weekly demand actuals (B2B + B2C) per SKU
-- Dedup key: sku + channel + iso_year + iso_week
-- ============================================================
create table if not exists public.sales_history (
  id              bigserial primary key,
  brand           text not null,
  company         text,
  sku             text not null references public.master_sku(sku),
  channel         text not null check (channel in ('B2B', 'B2C')),
  iso_year        integer not null,
  iso_week        integer not null,
  week_start_date date not null,        -- Monday of that ISO week
  qty             integer not null default 0,
  order_count     integer default 0,    -- number of distinct orders in that week
  source          text default 'WMS Upload',
  uploaded_by     text,
  uploaded_at     timestamptz default now(),

  constraint sales_history_sku_channel_week_unique
    unique (sku, channel, iso_year, iso_week)
);

create index if not exists idx_sales_history_sku_week
  on public.sales_history (sku, iso_year, iso_week);

create index if not exists idx_sales_history_brand
  on public.sales_history (brand, iso_year, iso_week);

-- ============================================================
-- DEMAND FORECAST
-- Statistical forecast output: 26 weeks per SKU
-- Regenerated on each upload; versioned by generated_at
-- ============================================================
create table if not exists public.demand_forecast (
  id              bigserial primary key,
  sku             text not null references public.master_sku(sku),
  brand           text not null,
  iso_year        integer not null,
  iso_week        integer not null,
  week_start_date date not null,
  wk_label        text not null,        -- e.g. 'WK22' — matches week_calendar
  forecast_qty    integer not null default 0,
  lower_bound     integer default 0,    -- 80% confidence lower
  upper_bound     integer default 0,    -- 80% confidence upper
  model_used      text default 'holt_winters',  -- 'holt_winters' | 'wma' | 'avg'
  history_weeks   integer default 0,    -- number of history weeks used
  generated_at    timestamptz default now(),

  constraint demand_forecast_sku_week_unique
    unique (sku, iso_year, iso_week)
);

create index if not exists idx_demand_forecast_sku_week
  on public.demand_forecast (sku, iso_year, iso_week);

-- ============================================================
-- RLS POLICIES
-- ============================================================
alter table public.sales_history    enable row level security;
alter table public.demand_forecast  enable row level security;

-- sales_history: supply_chain can read/write; all authenticated can read
create policy "Authenticated read sales_history"
  on public.sales_history for select
  to authenticated using (true);

create policy "Supply chain write sales_history"
  on public.sales_history for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'supply_chain')
    )
  );

-- demand_forecast: read-only for all authenticated; write only supply_chain
create policy "Authenticated read demand_forecast"
  on public.demand_forecast for select
  to authenticated using (true);

create policy "Supply chain write demand_forecast"
  on public.demand_forecast for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'supply_chain')
    )
  );

-- ============================================================
-- SKU WMS MAPPING
-- Maps WMS Seller Sku codes → master_sku when they differ
-- e.g. 'SDSDCA05' → 'SDSDCA05S', 'SDSDPM01' → 'SDSDPM01S'
-- Maintained manually; consulted during every upload parse
-- ============================================================
create table if not exists public.sku_wms_mapping (
  id          bigserial primary key,
  wms_sku     text not null unique,
  master_sku  text not null references public.master_sku(sku),
  brand       text,
  note        text,
  created_at  timestamptz default now()
);

-- Seed known SkinDae mappings
insert into public.sku_wms_mapping (wms_sku, master_sku, brand, note) values
  ('SDSDCA05',  'SDSDCA05S',  'SkinDae', 'WMS omits trailing S'),
  ('SDSDPM01',  'SDSDPM01S',  'SkinDae', 'WMS omits trailing S'),
  ('SDSDSB01S', 'SDSDSH01S',  'SkinDae', 'WMS uses SB prefix, master uses SH')
on conflict (wms_sku) do nothing;

alter table public.sku_wms_mapping enable row level security;

create policy "Authenticated read sku_wms_mapping"
  on public.sku_wms_mapping for select
  to authenticated using (true);

create policy "Supply chain write sku_wms_mapping"
  on public.sku_wms_mapping for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'supply_chain')
    )
  );
