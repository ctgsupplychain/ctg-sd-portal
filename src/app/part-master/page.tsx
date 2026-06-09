'use client'

import { useState, useEffect, useRef } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import { Upload, Download, RefreshCw, Check, X, AlertTriangle } from 'lucide-react'
import BackToSD from '@/components/layout/BackToSD'

// ── types ─────────────────────────────────────────────────────────────────────

interface PartRow {
  part_number: string
  description: string
  category: string
  uom: string
  on_hand_qty: number
  project_id: string | null
  brand: string | null
  // from part_supplier (preferred)
  supplier_name: string | null
  moq: number | null
  spq: number | null
  lead_time_wk: number | null
  part_supplier_id: string | null  // so we can upsert
}

type EditingCell = { partNumber: string; field: string } | null

const EDITABLE_FIELDS: Record<string, { label: string; type: 'number' | 'text' }> = {
  on_hand_qty:  { label: 'On Hand', type: 'number' },
  moq:          { label: 'MOQ',     type: 'number' },
  spq:          { label: 'SPQ',     type: 'number' },
  lead_time_wk: { label: 'LT (wk)', type: 'number' },
  supplier_name:{ label: 'Supplier',type: 'text'   },
}

const CAT_COLORS: Record<string, string> = {
  RM:  'bg-orange-50 text-orange-700 border-orange-200',
  PK:  'bg-blue-50 text-blue-700 border-blue-200',
  SA:  'bg-purple-50 text-purple-700 border-purple-200',
  WIP: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  FG:  'bg-green-50 text-green-700 border-green-200',
}

// ── component ─────────────────────────────────────────────────────────────────

export default function PartMasterPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()

  const [parts, setParts]       = useState<PartRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [search, setSearch]     = useState('')
  const [catFilter, setCatFilter] = useState('All')
  const [projectFilter, setProjectFilter] = useState('All')

  const [editingCell, setEditingCell] = useState<EditingCell>(null)
  const [editValue, setEditValue]     = useState<string>('')
  const [saving, setSaving]           = useState(false)
  const [saveError, setSaveError]     = useState<{ pn: string; msg: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadParts() }, [])
  useEffect(() => {
    if (editingCell && inputRef.current) inputRef.current.focus()
  }, [editingCell])

  // ── data load ───────────────────────────────────────────────────────────────

  async function loadParts() {
    setLoading(true); setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    // Fetch all parts with their preferred supplier info
    const { data: partsData, error: pErr } = await supabase
      .from('parts')
      .select('part_number, description, category, uom, on_hand_qty, project_id, brand')
      .order('project_id').order('category').order('part_number')

    if (pErr) { setError(pErr.message); setLoading(false); return }

    const { data: psData } = await supabase
      .from('part_supplier')
      .select('id, part_number, moq, spq, lead_time_wk')
      .eq('is_preferred', true)

    // Join supplier names
    const { data: supplierData } = await supabase
      .from('plm_suppliers')
      .select('id, name')

    const psMap = new Map<string, any>()
    psData?.forEach(ps => psMap.set(ps.part_number, ps))

    const supMap = new Map<string, string>()
    supplierData?.forEach(s => supMap.set(s.id, s.name))

    // Get supplier_id from part_supplier
    const { data: psFullData } = await supabase
      .from('part_supplier')
      .select('id, part_number, moq, spq, lead_time_wk, supplier_id, is_preferred')
      .eq('is_preferred', true)

    const psFull = new Map<string, any>()
    psFullData?.forEach(ps => psFull.set(ps.part_number, ps))

    const rows: PartRow[] = (partsData || []).map(p => {
      const ps = psFull.get(p.part_number)
      return {
        part_number:      p.part_number,
        description:      p.description,
        category:         p.category,
        uom:              p.uom,
        on_hand_qty:      p.on_hand_qty ?? 0,
        project_id:       p.project_id,
        brand:            p.brand,
        supplier_name:    ps?.supplier_id ? supMap.get(ps.supplier_id) ?? null : null,
        moq:              ps?.moq ?? null,
        spq:              ps?.spq ?? null,
        lead_time_wk:     ps?.lead_time_wk ?? null,
        part_supplier_id: ps?.id ?? null,
      }
    })

    setParts(rows)
    setLoading(false)
  }

  // ── inline edit ─────────────────────────────────────────────────────────────

  function startEdit(pn: string, field: string, currentValue: any) {
    if (saving) return
    setSaveError(null)
    setEditingCell({ partNumber: pn, field })
    setEditValue(String(currentValue ?? ''))
  }

  function cancelEdit() { setEditingCell(null); setEditValue('') }

  async function commitEdit() {
    if (!editingCell) return
    const { partNumber: pn, field } = editingCell
    const part = parts.find(p => p.part_number === pn)
    if (!part) return

    setSaving(true)
    let err: any = null

    const numVal = field !== 'supplier_name' ? parseFloat(editValue) : null

    if (field === 'on_hand_qty') {
      // Update parts table directly
      const { error: e } = await supabase
        .from('parts')
        .update({ on_hand_qty: isNaN(numVal!) ? 0 : numVal })
        .eq('part_number', pn)
      err = e
    } else if (field === 'supplier_name') {
      // Lookup or create supplier, then upsert part_supplier
      // For simplicity: just find supplier by name
      const { data: supRows } = await supabase
        .from('plm_suppliers')
        .select('id, name')
        .ilike('name', editValue.trim())
        .limit(1)
      if (!supRows || supRows.length === 0) {
        setSaveError({ pn, msg: `Supplier "${editValue}" not found in PLM suppliers. Add it in PLM first.` })
        setSaving(false); return
      }
      const supId = supRows[0].id
      if (part.part_supplier_id) {
        const { error: e } = await supabase
          .from('part_supplier')
          .update({ supplier_id: supId, updated_at: new Date().toISOString() })
          .eq('id', part.part_supplier_id)
        err = e
      } else {
        const { error: e } = await supabase
          .from('part_supplier')
          .insert({ part_number: pn, supplier_id: supId, is_preferred: true })
        err = e
      }
    } else {
      // moq, spq, lead_time_wk → part_supplier
      const val = isNaN(numVal!) ? null : numVal
      if (part.part_supplier_id) {
        const { error: e } = await supabase
          .from('part_supplier')
          .update({ [field]: val, updated_at: new Date().toISOString() })
          .eq('id', part.part_supplier_id)
        err = e
      } else {
        // No preferred supplier row yet — insert one with null supplier_id
        const { error: e } = await supabase
          .from('part_supplier')
          .insert({ part_number: pn, [field]: val, is_preferred: true, supplier_id: null })
        err = e
      }
    }

    if (err) {
      setSaveError({ pn, msg: err.message })
      setSaving(false); return
    }

    // Optimistic update
    setParts(prev => prev.map(p => {
      if (p.part_number !== pn) return p
      return { ...p, [field]: field !== 'supplier_name' ? (isNaN(numVal!) ? null : numVal) : editValue }
    }))

    setEditingCell(null); setEditValue(''); setSaving(false)
  }

  // ── CSV upload ───────────────────────────────────────────────────────────────

  async function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setUploadMsg(null)

    const text = await file.text()
    const lines = text.trim().split('\n')
    const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z_]/g, ''))

    const reqFields = ['part_number']
    if (!reqFields.every(f => header.includes(f))) {
      setUploadMsg('CSV must include: part_number column')
      setUploading(false); return
    }

    let updated = 0; let skipped = 0
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim())
      const row: Record<string, string> = {}
      header.forEach((h, idx) => { row[h] = cols[idx] || '' })

      const pn = row['part_number']
      if (!pn) { skipped++; continue }

      // Update parts.on_hand_qty if present
      if (row['on_hand_qty'] !== undefined && row['on_hand_qty'] !== '') {
        const qty = parseFloat(row['on_hand_qty'])
        await supabase.from('parts').update({ on_hand_qty: isNaN(qty) ? 0 : qty }).eq('part_number', pn)
      }

      // Update part_supplier fields
      const psFields: Record<string, any> = {}
      if (row['moq'] !== undefined && row['moq'] !== '')          psFields.moq = parseFloat(row['moq']) || null
      if (row['spq'] !== undefined && row['spq'] !== '')          psFields.spq = parseFloat(row['spq']) || null
      if (row['lead_time_wk'] !== undefined && row['lead_time_wk'] !== '') psFields.lead_time_wk = parseInt(row['lead_time_wk']) || null

      if (Object.keys(psFields).length > 0) {
        const part = parts.find(p => p.part_number === pn)
        if (part?.part_supplier_id) {
          await supabase.from('part_supplier').update({ ...psFields, updated_at: new Date().toISOString() }).eq('id', part.part_supplier_id)
        } else {
          await supabase.from('part_supplier').insert({ part_number: pn, ...psFields, is_preferred: true, supplier_id: null })
        }
      }
      updated++
    }

    setUploadMsg(`Updated ${updated} parts${skipped > 0 ? `, ${skipped} skipped` : ''}.`)
    setUploading(false)
    await loadParts()
    if (fileRef.current) fileRef.current.value = ''
  }

  // ── CSV export ───────────────────────────────────────────────────────────────

  function exportCsv() {
    const headers = ['part_number', 'description', 'category', 'uom', 'project_id', 'on_hand_qty', 'supplier_name', 'moq', 'spq', 'lead_time_wk']
    const rows = filtered.map(p => headers.map(h => (p as any)[h] ?? '').join(','))
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'part-master.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  // ── filtering ────────────────────────────────────────────────────────────────

  const projects = [...new Set(parts.map(p => p.project_id).filter(Boolean))] as string[]
  const cats = [...new Set(parts.map(p => p.category))]

  const filtered = parts.filter(p => {
    const matchSearch = search.trim() === '' ||
      p.part_number.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase()) ||
      (p.supplier_name || '').toLowerCase().includes(search.toLowerCase())
    const matchCat = catFilter === 'All' || p.category === catFilter
    const matchProj = projectFilter === 'All' || p.project_id === projectFilter
    return matchSearch && matchCat && matchProj
  })

  const missingCount = parts.filter(p =>
    p.category !== 'FG' && p.category !== 'SA' && (p.lead_time_wk == null || p.moq == null)
  ).length

  // ── render ───────────────────────────────────────────────────────────────────

  function CellEditor({ pn, field, value }: { pn: string; field: string; value: any }) {
    const isEditing = editingCell?.partNumber === pn && editingCell?.field === field
    const fieldDef = EDITABLE_FIELDS[field]

    if (isEditing) {
      return (
        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            type={fieldDef.type}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit() }}
            className="w-20 text-xs border border-[#6941C6] rounded px-1.5 py-0.5 text-center outline-none focus:ring-1 focus:ring-[#6941C6]"
          />
          <button onClick={commitEdit} className="text-green-600 hover:text-green-700"><Check size={12} /></button>
          <button onClick={cancelEdit} className="text-[#98A2B3] hover:text-[#667085]"><X size={12} /></button>
        </div>
      )
    }

    const isEmpty = value == null || value === '' || value === 0
    return (
      <button
        onClick={() => startEdit(pn, field, value)}
        className={`text-xs tabular-nums hover:bg-[#F2F4F7] rounded px-1.5 py-0.5 transition-colors w-full text-center ${
          isEmpty ? 'text-[#D0D5DD] italic' : 'text-[#344054]'
        }`}
      >
        {isEmpty ? '—' : field === 'on_hand_qty' ? Number(value).toLocaleString() : value}
      </button>
    )
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <div className="max-w-screen-2xl mx-auto px-6 py-6">
        <BackToSD />

        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-[#101828]">Part Master</h1>
            <p className="text-sm text-[#667085] mt-0.5">
              Component lead times, MOQ, SPQ and on-hand stock — used for BOM-driven MRP on S&D.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {missingCount > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-3 py-1.5">
                <AlertTriangle size={12} />
                {missingCount} components missing LT or MOQ
              </div>
            )}
            <label className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border cursor-pointer transition-colors ${
              uploading ? 'bg-[#F2F4F7] text-[#98A2B3] border-[#EAECF0]' : 'bg-white text-[#344054] border-[#EAECF0] hover:bg-[#F9FAFB]'
            }`}>
              <Upload size={13} />
              {uploading ? 'Uploading…' : 'Mass Upload CSV'}
              <input ref={fileRef} type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" disabled={uploading} />
            </label>
            <button onClick={exportCsv} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-[#EAECF0] bg-white text-[#344054] hover:bg-[#F9FAFB]">
              <Download size={13} /> Export CSV
            </button>
            <button onClick={loadParts} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-[#EAECF0] bg-white text-[#344054] hover:bg-[#F9FAFB]">
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>

        {/* Upload feedback */}
        {uploadMsg && (
          <div className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5">
            {uploadMsg}
          </div>
        )}

        {/* CSV format hint */}
        <div className="mb-4 text-xs text-[#667085] bg-[#F2F4F7] rounded-lg px-4 py-2.5">
          CSV columns: <span className="font-mono text-[#344054]">part_number, on_hand_qty, moq, spq, lead_time_wk</span>
          &nbsp;— only include columns you want to update.
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4">
          <input
            type="text"
            placeholder="Search part number, description, supplier…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="text-sm border border-[#EAECF0] rounded-lg px-3 py-2 w-72 outline-none focus:border-[#6941C6] bg-white"
          />
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
            className="text-sm border border-[#EAECF0] rounded-lg px-3 py-2 bg-white outline-none focus:border-[#6941C6]">
            <option value="All">All Categories</option>
            {cats.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}
            className="text-sm border border-[#EAECF0] rounded-lg px-3 py-2 bg-white outline-none focus:border-[#6941C6]">
            <option value="All">All Projects</option>
            {projects.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <span className="text-xs text-[#98A2B3] ml-auto">{filtered.length} parts</span>
        </div>

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        {/* Table */}
        <div className="bg-white rounded-xl border border-[#EAECF0] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-[#EAECF0] bg-[#F9FAFB]">
                  {['Part Number', 'Description', 'Cat', 'UOM', 'Project', 'On Hand', 'Supplier', 'MOQ', 'SPQ', 'LT (wk)'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#667085] uppercase tracking-wide whitespace-nowrap border-r border-[#EAECF0] last:border-r-0">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} className="px-4 py-8 text-center text-sm text-[#98A2B3]">Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={10} className="px-4 py-8 text-center text-sm text-[#98A2B3]">No parts found.</td></tr>
                ) : filtered.map((p, idx) => {
                  const catStyle = CAT_COLORS[p.category] || 'bg-gray-50 text-gray-600 border-gray-200'
                  const hasSaveError = saveError?.pn === p.part_number
                  return (
                    <>
                      <tr
                        key={p.part_number}
                        className={`border-b border-[#EAECF0] hover:bg-[#F9FAFB] transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-[#FAFAFA]'}`}
                      >
                        <td className="px-4 py-2.5 font-mono text-xs text-[#344054] font-medium border-r border-[#EAECF0] whitespace-nowrap">
                          {p.part_number}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-[#667085] border-r border-[#EAECF0] max-w-[220px]">
                          {p.description}
                        </td>
                        <td className="px-4 py-2.5 border-r border-[#EAECF0]">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${catStyle}`}>{p.category}</span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-[#667085] border-r border-[#EAECF0]">{p.uom}</td>
                        <td className="px-4 py-2.5 text-xs text-[#667085] border-r border-[#EAECF0] whitespace-nowrap">{p.project_id ?? '—'}</td>
                        {/* Editable: On Hand */}
                        <td className="px-2 py-2.5 border-r border-[#EAECF0] text-center">
                          <CellEditor pn={p.part_number} field="on_hand_qty" value={p.on_hand_qty} />
                        </td>
                        {/* Editable: Supplier */}
                        <td className="px-2 py-2.5 border-r border-[#EAECF0] min-w-[140px]">
                          <CellEditor pn={p.part_number} field="supplier_name" value={p.supplier_name} />
                        </td>
                        {/* Editable: MOQ */}
                        <td className="px-2 py-2.5 border-r border-[#EAECF0] text-center">
                          <CellEditor pn={p.part_number} field="moq" value={p.moq} />
                        </td>
                        {/* Editable: SPQ */}
                        <td className="px-2 py-2.5 border-r border-[#EAECF0] text-center">
                          <CellEditor pn={p.part_number} field="spq" value={p.spq} />
                        </td>
                        {/* Editable: LT */}
                        <td className="px-2 py-2.5 text-center">
                          <CellEditor pn={p.part_number} field="lead_time_wk" value={p.lead_time_wk} />
                        </td>
                      </tr>
                      {hasSaveError && (
                        <tr key={`err-${p.part_number}`} className="bg-red-50">
                          <td colSpan={10} className="px-4 py-1.5 text-xs text-red-600">{saveError!.msg}</td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-xs text-[#98A2B3] mt-3">
          Click any cell in On Hand, Supplier, MOQ, SPQ, or LT to edit inline. Press Enter to save, Esc to cancel.
        </p>
      </div>
    </div>
  )
}
