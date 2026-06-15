'use client'

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle, Search, RefreshCw, Check, X } from 'lucide-react'
import BackToSD from '@/components/layout/BackToSD'

interface UploadResult {
  success: boolean
  total_rows: number
  upserted: number
  skipped: number
  invalid_skus: string[]
}

interface PurchaseOrder {
  id: number
  po_number: string
  sku: string
  brand: string | null
  supplier_name: string | null
  qty: number
  qty_shipped: number | null
  balance_qty: number | null
  unit_price: number | null
  delivery_date: string | null
  receipt_wk: string | null
  status: string
  commit_status: string | null
  notes: string | null
  updated_at: string | null
}

type EditingCell = { id: number; field: string } | null

const STATUS_OPTIONS = ['Open', 'Received', 'Cancelled', 'Closed']

// Editable cell renderer
function EditableCell({
  id, field, value, align = 'right', display, inputType = 'text', selectOptions,
  editingCell, saveError, inputRef, editValue, setEditValue, handleKeyDown, commitEdit, cancelEdit, startEdit,
}: {
  id: number
  field: string
  value: string | number | null
  align?: 'left' | 'right'
  display: React.ReactNode
  inputType?: string
  selectOptions?: string[]
  editingCell: { id: number; field: string } | null
  saveError: { id: number; msg: string } | null
  inputRef: React.RefObject<HTMLInputElement | HTMLSelectElement>
  editValue: string
  setEditValue: (v: string) => void
  handleKeyDown: (e: React.KeyboardEvent) => void
  commitEdit: () => void
  cancelEdit: () => void
  startEdit: (id: number, field: string, value: string | number | null) => void
}) {
  const isEditing = editingCell?.id === id && editingCell?.field === field
  const hasError = saveError?.id === id

  if (isEditing) {
    return (
      <td className="px-2 py-1.5">
        <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
          {selectOptions ? (
            <select
              ref={inputRef as React.RefObject<HTMLSelectElement>}
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="text-xs border border-[#0E5C56] rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-teal-400"
            >
              {selectOptions.map(o => <option key={o}>{o}</option>)}
            </select>
          ) : (
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              type={inputType === 'number' ? 'text' : inputType}
              inputMode={inputType === 'number' ? 'numeric' : inputType === 'decimal' ? 'decimal' : undefined}
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-24 text-xs border border-[#0E5C56] rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-teal-400 text-right"
            />
          )}
          <button onClick={commitEdit} className="text-[#0E5C56] hover:text-[#0E5C56]"><Check size={12} /></button>
          <button onClick={cancelEdit} className="text-[#4B5563] hover:text-[#4B5563]"><X size={12} /></button>
        </div>
      </td>
    )
  }

  return (
    <td
      className={`px-3 py-2.5 cursor-pointer group ${align === 'right' ? 'text-right' : ''} ${hasError ? 'bg-[#FAEAEA]' : 'hover:bg-[#DCEAE8]'}`}
      onClick={() => startEdit(id, field, value)}
      title="Click to edit"
    >
      <span className="group-hover:underline group-hover:decoration-dashed group-hover:decoration-teal-400 group-hover:underline-offset-2">
        {display}
      </span>
    </td>
  )
}


export default function SupplyInputPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()

  // Upload state
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastUploaded, setLastUploaded] = useState<string | null>(null)

  // List state
  const [pos, setPos] = useState<PurchaseOrder[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

  // Inline edit state
  const [editingCell, setEditingCell] = useState<EditingCell>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<{ id: number; msg: string } | null>(null)
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null)

  useEffect(() => { loadPos() }, [])
  useEffect(() => {
    if (editingCell && inputRef.current) inputRef.current.focus()
  }, [editingCell])

  async function loadPos() {
    setListLoading(true); setListError(null)
    const { data, error: err } = await supabase
      .from('purchase_orders')
      .select('id, po_number, sku, brand, supplier_name, qty, qty_shipped, balance_qty, unit_price, delivery_date, receipt_wk, status, commit_status, notes, updated_at')
      .order('updated_at', { ascending: false })
      .limit(1000)
    if (err) { setListError(err.message); setListLoading(false); return }
    setPos(data ?? [])
    setListLoading(false)
  }

  function startEdit(id: number, field: string, currentValue: string | number | null) {
    if (saving) return
    setSaveError(null)
    setEditingCell({ id, field })
    setEditValue(currentValue == null ? '' : String(currentValue))
  }

  function cancelEdit() {
    setEditingCell(null)
    setEditValue('')
  }

  async function commitEdit() {
    if (!editingCell) return
    const { id, field } = editingCell
    const original = pos.find(p => p.id === id)
    if (!original) return cancelEdit()

    let parsed: string | number | null = editValue.trim()
    if (field === 'qty' || field === 'qty_shipped') parsed = parseInt(editValue) || 0
    else if (field === 'unit_price') parsed = parseFloat(editValue) || 0
    else if (field === 'delivery_date') parsed = parsed || null

    const originalVal = (original as any)[field]
    if (String(parsed ?? '') === String(originalVal ?? '')) return cancelEdit()

    // Optimistic update
    setPos(prev => prev.map(p => p.id === id ? { ...p, [field]: parsed } : p))
    setEditingCell(null)
    setSaving(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/supply-input', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ id, [field]: parsed }),
      })
      if (!res.ok) {
        const err = await res.json()
        setPos(prev => prev.map(p => p.id === id ? { ...p, [field]: originalVal } : p))
        setSaveError({ id, msg: err.error || 'Save failed' })
      } else {
        // Refresh row to pick up server-recomputed fields (balance_qty, receipt_wk, etc.)
        loadPos()
      }
    } catch (e: any) {
      setPos(prev => prev.map(p => p.id === id ? { ...p, [field]: originalVal } : p))
      setSaveError({ id, msg: e.message || 'Save failed' })
    } finally {
      setSaving(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commitEdit()
    if (e.key === 'Escape') cancelEdit()
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped?.name.endsWith('.xlsx')) {
      setFile(dropped); setResult(null); setError(null)
    } else {
      setError('Please upload an .xlsx file.')
    }
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected) { setFile(selected); setResult(null); setError(null) }
  }

  const handleUpload = async () => {
    if (!file) return
    setLoading(true); setError(null); setResult(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/supply-input', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Upload failed')

      setResult(json)
      setLastUploaded(new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' }))
      loadPos()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const statuses = ['All', ...STATUS_OPTIONS]

  const filtered = useMemo(() => pos.filter(p => {
    const q = search.toLowerCase()
    return (
      (!search || p.po_number.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.supplier_name ?? '').toLowerCase().includes(q)) &&
      (statusFilter === 'All' || p.status === statusFilter)
    )
  }), [pos, search, statusFilter])

  const openCount = pos.filter(p => p.status === 'Open').length
  const delayedCount = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    return pos.filter(p => p.status === 'Open' && p.delivery_date && p.delivery_date < today && (p.balance_qty ?? p.qty) > 0).length
  }, [pos])

  function isDelayed(p: PurchaseOrder) {
    const today = new Date().toISOString().split('T')[0]
    return p.status === 'Open' && !!p.delivery_date && p.delivery_date < today && (p.balance_qty ?? p.qty) > 0
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="flex items-center gap-3 mb-6">
        <BackToSD />
        <div className="w-px h-4 bg-[#E4DDD3]" />
        <h1 className="text-sm font-semibold text-[#1F2937]">Supply Input â Open POs</h1>
      </div>
      <p className="text-sm text-[#4B5563] mb-8">
        Upload the weekly Open PO file (.xlsx). Records are upserted by PO Number + SKU. Missing POs are kept as-is.
        Click any cell below to edit a record directly.
      </p>

      {/* Upload section */}
      <div className="bg-[#DCEAE8] border border-[#DCEAE8] rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-[#0E5C56]">Need the template?</p>
          <p className="text-xs text-[#0E5C56] mt-0.5">Download and fill in the CTG PO Upload Template</p>
        </div>
        <a
          href="/templates/CTG_PO_Upload_Template.xlsx"
          className="text-xs font-medium text-[#0E5C56] border border-[#0E5C56] px-3 py-1.5 rounded-lg hover:bg-[#DCEAE8] transition-colors flex items-center gap-1.5"
        >
          <FileSpreadsheet size={13} /> Download Template
        </a>
      </div>

      {lastUploaded && (
        <p className="text-xs text-[#4B5563] mb-3">Last uploaded: {lastUploaded}</p>
      )}

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById('po-file-input')?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
          dragging ? 'border-[#0E5C56] bg-[#DCEAE8]' : 'border-[#E4DDD3] bg-[#F4F2EE] hover:border-[#0E5C56]'
        }`}
      >
        <input id="po-file-input" type="file" accept=".xlsx" className="hidden" onChange={handleFileChange} />
        {file ? (
          <div>
            <FileSpreadsheet size={22} className="mx-auto mb-2 text-[#0E5C56]" />
            <p className="text-sm font-medium text-[#0E5C56]">{file.name}</p>
            <p className="text-xs text-[#4B5563] mt-1">{(file.size / 1024).toFixed(1)} KB</p>
          </div>
        ) : (
          <div>
            <Upload size={22} className="mx-auto mb-2 text-[#4B5563]" />
            <p className="text-sm text-[#4B5563]">Drag & drop your PO .xlsx file here</p>
            <p className="text-xs text-[#4B5563] mt-1">or click to browse</p>
          </div>
        )}
      </div>

      <button
        onClick={handleUpload}
        disabled={!file || loading}
        className="mt-4 w-full bg-[#0E5C56] hover:bg-[#0A4A45] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
      >
        {loading ? 'Uploading...' : 'Upload & Save'}
      </button>

      {error && (
        <div className="mt-4 bg-[#FAEAEA] border border-[#F5C6C4] rounded-lg px-4 py-3 flex gap-2">
          <AlertCircle size={16} className="text-[#C5453F] flex-shrink-0 mt-0.5" />
          <p className="text-sm text-[#C5453F]">{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-4 bg-[#DCEAE8] border border-[#DCEAE8] rounded-lg px-4 py-4 space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="text-[#2F9E68]" />
            <p className="text-sm font-medium text-[#0E5C56]">Upload successful</p>
          </div>
          <div className="text-sm text-[#0E5C56] space-y-1">
            <p>Total rows in file: <span className="font-medium">{result.total_rows}</span></p>
            <p>Records upserted: <span className="font-medium">{result.upserted}</span></p>
            {result.skipped > 0 && (
              <p>Rows skipped (invalid SKU): <span className="font-medium">{result.skipped}</span></p>
            )}
          </div>
          {result.invalid_skus?.length > 0 && (
            <div className="mt-2 bg-[#FEF3E2] border border-[#F9DEB8] rounded-md px-3 py-2">
              <p className="text-xs font-medium text-yellow-800 mb-1">Unrecognized SKUs (not saved):</p>
              <ul className="text-xs text-[#E8A33D] space-y-0.5">
                {result.invalid_skus.map(sku => <li key={sku}>â¢ {sku}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* âââââââââââââ PO List âââââââââââââ */}
      <div className="mt-10">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-sm font-semibold text-[#1F2937]">Current Open POs</h2>
          <button
            onClick={loadPos}
            className="inline-flex items-center gap-1.5 text-xs text-[#4B5563] px-3 py-1.5 border border-[#E4DDD3] rounded-lg bg-white hover:bg-[#F4F2EE] transition-colors"
          >
            <RefreshCw size={12} /> Refresh
          </button>
        </div>

        {/* Summary metrics */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: 'Total POs', value: pos.length, sub: 'all statuses' },
            { label: 'Open', value: openCount, sub: 'awaiting receipt' },
            { label: 'Delayed', value: delayedCount, sub: 'past delivery date, not yet received' },
          ].map(m => (
            <div key={m.label} className="bg-[#F4F2EE] rounded-lg px-4 py-3">
              <p className="text-[10px] font-medium text-[#4B5563] uppercase tracking-wide mb-1">{m.label}</p>
              <p className={`text-xl font-semibold ${m.label === 'Delayed' && m.value > 0 ? 'text-[#C5453F]' : 'text-[#1F2937]'}`}>{m.value}</p>
              <p className="text-[11px] text-[#4B5563] mt-0.5">{m.sub}</p>
            </div>
          ))}
        </div>

        {saveError && (
          <div className="flex items-center justify-between mb-3 px-4 py-2.5 bg-[#FAEAEA] border border-[#F5C6C4] rounded-lg text-xs text-[#C5453F]">
            <span>Failed to save PO #{saveError.id}: {saveError.msg}</span>
            <button onClick={() => setSaveError(null)}><X size={12} /></button>
          </div>
        )}

        {/* Filter bar */}
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#4B5563] pointer-events-none" />
            <input
              type="text"
              placeholder="Search PO number, SKU, or supplier..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-7 pr-3 py-1.5 text-xs border border-[#E4DDD3] rounded-lg bg-white focus:outline-none focus:border-[#0E5C56]"
            />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="text-xs px-2 py-1.5 border border-[#E4DDD3] rounded-lg bg-white text-[#4B5563] focus:outline-none focus:border-[#0E5C56]">
            {statuses.map(s => <option key={s}>{s}</option>)}
          </select>
          <span className="text-xs text-[#4B5563] whitespace-nowrap">{filtered.length} POs</span>
        </div>

        {listError ? (
          <div className="text-sm text-[#C5453F] bg-[#FAEAEA] border border-[#F5C6C4] rounded-lg px-4 py-3">{listError}</div>
        ) : listLoading ? (
          <div className="text-sm text-[#4B5563] text-center py-16">Loading...</div>
        ) : (
          <div className="border border-[#E4DDD3] rounded-xl overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#F4F2EE] border-b border-[#E4DDD3]">
                  {['PO Number', 'SKU', 'Supplier', 'Qty', 'Shipped', 'Balance', 'Unit Price', 'Delivery Date', 'Receipt Wk', 'Status'].map((h, i) => (
                    <th key={h} className={`px-3 py-2.5 font-medium text-[#4B5563] uppercase tracking-wide text-[10px] whitespace-nowrap ${i < 3 ? 'text-left' : 'text-right'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const delayed = isDelayed(p)
                  return (
                    <tr key={p.id} className={`border-b border-[#E4DDD3] last:border-0 transition-colors ${delayed ? 'bg-[#FAEAEA]/40' : ''}`}>
                      {/* PO Number â read only */}
                      <td className="px-3 py-2.5">
                        <span className="font-mono text-[11px] text-[#1F2937]">{p.po_number}</span>
                        {delayed && (
                          <span className="ml-2 inline-block text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-[#FAEAEA] text-[#C5453F] align-middle">Delayed</span>
                        )}
                      </td>
                      {/* SKU â read only */}
                      <td className="px-3 py-2.5">
                        <span className="font-mono text-[11px] text-[#1F2937]">{p.sku}</span>
                        {p.brand && <p className="text-[10px] text-[#4B5563] mt-0.5">{p.brand}</p>}
                      </td>
                      {/* Supplier â editable */}
                      <EditableCell
                        id={p.id} field="supplier_name" value={p.supplier_name} align="left"
                        display={<span className="text-xs text-[#4B5563]">{p.supplier_name || 'â'}</span>}
                      
                editingCell={editingCell} saveError={saveError} inputRef={inputRef as React.RefObject<HTMLInputElement | HTMLSelectElement>} editValue={editValue} setEditValue={setEditValue} handleKeyDown={handleKeyDown} commitEdit={commitEdit} cancelEdit={cancelEdit} startEdit={startEdit}
                      />
                      {/* Qty â editable */}
                      <EditableCell
                        id={p.id} field="qty" value={p.qty} inputType="number"
                        display={<span className="text-xs text-[#1F2937]">{p.qty?.toLocaleString()}</span>}
                editingCell={editingCell} saveError={saveError} inputRef={inputRef as React.RefObject<HTMLInputElement | HTMLSelectElement>} editValue={editValue} setEditValue={setEditValue} handleKeyDown={handleKeyDown} commitEdit={commitEdit} cancelEdit={cancelEdit} startEdit={startEdit}
                      />
                      {/* Qty Shipped â editable */}
                      <EditableCell
                        id={p.id} field="qty_shipped" value={p.qty_shipped} inputType="number"
                        display={<span className="text-xs text-[#4B5563]">{(p.qty_shipped ?? 0).toLocaleString()}</span>}
                editingCell={editingCell} saveError={saveError} inputRef={inputRef as React.RefObject<HTMLInputElement | HTMLSelectElement>} editValue={editValue} setEditValue={setEditValue} handleKeyDown={handleKeyDown} commitEdit={commitEdit} cancelEdit={cancelEdit} startEdit={startEdit}
                      />
                      {/* Balance â read only (server computed) */}
                      <td className="px-3 py-2.5 text-right">
                        <span className={`text-xs font-medium ${(p.balance_qty ?? 0) > 0 ? 'text-amber-600' : 'text-[#4B5563]'}`}>
                          {(p.balance_qty ?? p.qty)?.toLocaleString()}
                        </span>
                      </td>
                      {/* Unit price â editable */}
                      <EditableCell
                        id={p.id} field="unit_price" value={p.unit_price} inputType="number"
                        display={<span className="font-mono text-xs text-[#1F2937]">{Number(p.unit_price ?? 0).toFixed(2)}</span>}
                editingCell={editingCell} saveError={saveError} inputRef={inputRef as React.RefObject<HTMLInputElement | HTMLSelectElement>} editValue={editValue} setEditValue={setEditValue} handleKeyDown={handleKeyDown} commitEdit={commitEdit} cancelEdit={cancelEdit} startEdit={startEdit}
                      />
                      {/* Delivery date â editable */}
                      <EditableCell
                        id={p.id} field="delivery_date" value={p.delivery_date} inputType="date"
                        display={
                          p.delivery_date
                            ? <span className={`text-xs ${delayed ? 'text-[#C5453F] font-medium' : 'text-[#4B5563]'}`}>{p.delivery_date}</span>
                            : <span className="text-[#4B5563] text-xs">â</span>
                        }
                      
                editingCell={editingCell} saveError={saveError} inputRef={inputRef as React.RefObject<HTMLInputElement | HTMLSelectElement>} editValue={editValue} setEditValue={setEditValue} handleKeyDown={handleKeyDown} commitEdit={commitEdit} cancelEdit={cancelEdit} startEdit={startEdit}
                      />
                      {/* Receipt week â read only (derived) */}
                      <td className="px-3 py-2.5 text-right">
                        <span className="text-xs text-[#4B5563]">{p.receipt_wk || 'â'}</span>
                      </td>
                      {/* Status â editable */}
                      <EditableCell
                        id={p.id} field="status" value={p.status}
                        selectOptions={STATUS_OPTIONS}
                        display={
                          <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full ${
                            p.status === 'Open' ? 'bg-[#FEF3E2] text-[#E8A33D]'
                            : p.status === 'Received' ? 'bg-[#DCEAE8] text-[#0E5C56]'
                            : 'bg-[#E4DDD3] text-[#4B5563]'
                          }`}>{p.status}</span>
                        }
                      
                editingCell={editingCell} saveError={saveError} inputRef={inputRef as React.RefObject<HTMLInputElement | HTMLSelectElement>} editValue={editValue} setEditValue={setEditValue} handleKeyDown={handleKeyDown} commitEdit={commitEdit} cancelEdit={cancelEdit} startEdit={startEdit}
                      />
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={10} className="px-4 py-12 text-center text-xs text-[#4B5563]">No POs match your filters</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[11px] text-[#4B5563] mt-3">
          Click Supplier, Qty, Shipped, Unit Price, Delivery Date, or Status to edit inline Â· Enter to save Â· Esc to cancel Â·
          Balance and Receipt Week are recalculated automatically Â· Bulk changes via Upload above
        </p>
      </div>
    </div>
  )
}
