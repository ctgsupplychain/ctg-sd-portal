import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

// Increase max body size for large WMS xlsx uploads
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Brand SKU prefix mapping — extend per brand
const SKU_BRAND_MAP: Record<string, string> = {
  SD: 'SkinDae',
  // NL: 'Naturelish',   // future
  // IP: 'IProcare',     // future
  // MJ: 'Mejorecare',   // future
  // BL: 'Bonlife',      // future
}

function resolveBrand(sku: string, wmsBrand: string | null): string {
  if (wmsBrand && wmsBrand.trim()) return wmsBrand.trim()
  // Fallback: derive from SKU prefix (first 2 chars)
  const prefix = sku.slice(0, 2).toUpperCase()
  return SKU_BRAND_MAP[prefix] ?? ''
}

// SkinDae SKU whitelist — expand per brand in future
const SKINDAE_SKUS = [
  'SDSDCA030',
  'SDSDCA05S',
  'SDDLSC030',
  'SDSDPD01S',
  'SDSDPM01S',
  'SDSDSH01S',
]

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check supply_chain role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'supply_chain') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Parse multipart form data
    let formData: FormData
    try {
      formData = await req.formData()
    } catch (formErr: any) {
      console.error('FormData parse error:', formErr)
      return NextResponse.json(
        { error: `Failed to parse uploaded file: ${formErr.message ?? 'Unknown error'}` },
        { status: 400 }
      )
    }

    const file = formData.get('file') as File
    const snapshotDate = formData.get('snapshot_date') as string

    if (!file || !snapshotDate) {
      return NextResponse.json({ error: 'Missing file or snapshot_date' }, { status: 400 })
    }

    // Parse Excel
    const arrayBuffer = await file.arrayBuffer()
    const workbook = XLSX.read(arrayBuffer, { type: 'array' })

    // Use first sheet (Overview)
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: 0 })

    if (!rows.length) {
      return NextResponse.json({ error: 'No data found in file' }, { status: 400 })
    }

    // Map column names from WMS report to DB columns
    const mapped = rows
      .filter(row => row['SKU'] && typeof row['SKU'] === 'string' && row['SKU'].trim())
      .map(row => {
        const sku = String(row['SKU']).trim()
        const wmsBrand = row['Brand'] ?? null
        return {
          snapshot_date:      snapshotDate,
          company_name:       row['Company Name']           ?? null,
          warehouse_code:     row['Warehouse Code']         ?? null,
          product_name_en:    row['Product Name English']   ?? null,
          product_name_local: row['Product Name Local']     ?? null,
          sku,
          mfupc:              row['Mfupc/Upc/Ean']          ?? null,
          base_uom:           row['Base Uom']               ?? null,
          atp:                Number(row['ATP'])             || 0,
          usable:             Number(row['Usable'])          || 0,
          unusable:           Number(row['Unusable'])        || 0,
          incoming:           Number(row['Incoming'])        || 0,
          picking:            Number(row['Picking'])         || 0,
          in_process:         Number(row['In-Process'])      || 0,
          problem_order:      Number(row['Problem Order'])   || 0,
          blocked_usable:     Number(row['Blocked Usable'])  || 0,
          blocked_unusable:   Number(row['Blocked Unusable'])|| 0,
          buffer:             Number(row['Buffer'])          || 0,
          in_transfer:        Number(row['In-transfer'])     || 0,
          in_stock_take:      Number(row['In-stock take'])   || 0,
          in_adjustment:      Number(row['In-adjustment'])   || 0,
          total_cbm:          Number(row['Total CBM'])       || 0,
          brand:              resolveBrand(sku, wmsBrand),
          product_category:   row['Product Category']       ?? null,
          uploaded_by:        user.email,
          uploaded_at:        new Date().toISOString(),
        }
      })

    // Deduplicate: if same SKU appears multiple times, keep first occurrence
    const seen = new Set<string>()
    const deduped = mapped.filter(row => {
      if (seen.has(row.sku)) return false
      seen.add(row.sku)
      return true
    })

    // Identify missing SkinDae SKUs
    const uploadedSkus = new Set(deduped.map(r => r.sku))
    const missingSkinDae = SKINDAE_SKUS.filter(s => !uploadedSkus.has(s))

    // Upsert — conflict on sku + snapshot_date
    const { error: upsertError, count } = await supabase
      .from('wms_inventory_snapshots')
      .upsert(deduped, {
        onConflict: 'sku,snapshot_date',
        count: 'exact',
      })

    if (upsertError) {
      console.error('Upsert error:', upsertError)
      return NextResponse.json({ error: upsertError.message }, { status: 500 })
    }

    // Sync descriptions from WMS to master_sku (only where blank)
    const descUpdates = deduped
      .filter(r => r.sku && r.product_name_en)
      .reduce((acc: Record<string, string>, r) => {
        if (!acc[r.sku]) acc[r.sku] = r.product_name_en
        return acc
      }, {})

    for (const [sku, description] of Object.entries(descUpdates)) {
      await supabase
        .from('master_sku')
        .update({ description })
        .eq('sku', sku)
        .is('description', null)
    }

    // Update where description differs from WMS
    for (const [sku, description] of Object.entries(descUpdates)) {
      await supabase
        .from('master_sku')
        .update({ description })
        .eq('sku', sku)
        .neq('description', description)
    }

    return NextResponse.json({
      success: true,
      total_rows: rows.length,
      upserted: count,
      duplicates_removed: mapped.length - deduped.length,
      missing_skindae_skus: missingSkinDae,
    })

  } catch (err: any) {
    console.error('Upload error:', err)
    return NextResponse.json({ error: err.message ?? 'Unknown error' }, { status: 500 })
  }
}
