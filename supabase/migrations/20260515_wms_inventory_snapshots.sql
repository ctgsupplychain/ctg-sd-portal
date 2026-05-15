-- WMS Daily Inventory Snapshots
-- Mirrors the WMS daily report exactly
-- Upsert on sku + snapshot_date

create table if not exists public.wms_inventory_snapshots (
  id                bigserial primary key,
  snapshot_date     date not null,
  company_name      text,
  warehouse_code    text,
  product_name_en   text,
  product_name_local text,
  sku               text not null,
  mfupc             text,
  base_uom          text,
  atp               integer default 0,
  usable            integer default 0,
  unusable          integer default 0,
  incoming          integer default 0,
  picking           integer default 0,
  in_process        integer default 0,
  problem_order     integer default 0,
  blocked_usable    integer default 0,
  blocked_unusable  integer default 0,
  buffer            integer default 0,
  in_transfer       integer default 0,
  in_stock_take     integer default 0,
  in_adjustment     integer default 0,
  total_cbm         numeric(12, 6) default 0,
  brand             text,
  product_category  text,
  uploaded_by       text,
  uploaded_at       timestamptz default now(),

  constraint wms_inventory_snapshots_sku_date_unique unique (sku, snapshot_date)
);

create index if not exists idx_wms_snapshots_sku_date
  on public.wms_inventory_snapshots (sku, snapshot_date desc);

create index if not exists idx_wms_snapshots_brand
  on public.wms_inventory_snapshots (brand, snapshot_date desc);

alter table public.wms_inventory_snapshots enable row level security;

create policy "supply_chain can read inventory snapshots"
  on public.wms_inventory_snapshots
  for select
  using (
    auth.jwt() ->> 'role' = 'supply_chain'
  );

create policy "supply_chain can upsert inventory snapshots"
  on public.wms_inventory_snapshots
  for insert
  with check (
    auth.jwt() ->> 'role' = 'supply_chain'
  );

create policy "supply_chain can update inventory snapshots"
  on public.wms_inventory_snapshots
  for update
  using (
    auth.jwt() ->> 'role' = 'supply_chain'
  );
