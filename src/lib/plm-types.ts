export type PartCategory = 'FG' | 'SA' | 'PK' | 'RM' | 'WIP'
export type LifecycleStatus = 'Active' | 'NPI' | 'EOL' | 'Obsolete'
export type MpnStatus = 'Active' | 'Alternate' | 'Qualifying' | 'Obsolete'

export interface PriceTier {
  min_qty: number
  unit_price: number
  currency: string
}

export interface ManufacturerPart {
  id: string
  part_number: string
  supplier_id: string | null
  mpn: string | null
  status: MpnStatus
  is_preferred: boolean
  moq: number | null
  lead_time_wk: number | null
  nre_cost: number | null
  price_tiers: PriceTier[]
  notes: string | null
  // joined
  supplier_name?: string | null
  supplier_country?: string | null
}

export interface WhereUsedRow {
  parent_pn: string
  parent_desc: string
  parent_category: PartCategory
  qty_per: number
  bom_level: number
  is_fg: boolean
}

export interface Part {
  part_number: string
  project_id: string | null
  master_sku_ref: string | null
  description: string
  category: PartCategory
  brand: string | null
  uom: string
  lifecycle_status: LifecycleStatus
  current_revision: string
  mpn: string | null
  notes: string | null
}

export interface Supplier {
  id: string
  name: string
  country: string
  currency: string
  lead_time_wk: number | null
  payment_terms: string | null
  is_active: boolean
}

export interface PartSupplier {
  id: string
  part_number: string
  supplier_id: string
  is_preferred: boolean
  moq: number | null
  lead_time_wk: number | null
  nre_cost: number | null
  price_tiers: PriceTier[]
}

export interface BomLine {
  id: string
  parent_pn: string
  child_pn: string
  bom_level: number
  qty_per: number
  uom: string
  revision: string
  is_active: boolean
  notes: string | null
}

export interface BomRow {
  fg_part_number: string
  component_pn: string
  component_desc: string
  category: PartCategory
  bom_level: number
  qty_per_fg: number
  gross_requirement: number
  uom: string
  parent_component_pn?: string
  // joined
  current_revision?: string
  lifecycle_status?: LifecycleStatus
  part_notes?: string
  supplier_name?: string
  supplier_country?: string
  lead_time_wk?: number | null
  moq?: number | null
  price_tiers?: PriceTier[]
  nre_cost?: number | null
}

export interface PlmDocument {
  id: string
  part_number: string
  doc_type: string
  file_name: string
  file_url: string
  version: string
  is_current: boolean
  approved_by: string | null
  approved_at: string | null
  notes: string | null
  uploaded_at: string
}

export interface CostResult {
  component_pn: string
  qty_per_fg: number
  uom: string
  unit_price: number | null
  ext_mat: number | null
  ext_freight: number | null
  ext_tax: number | null
  ext_landed: number | null
  active_tier_idx: number
  child_order_qty: number
}
