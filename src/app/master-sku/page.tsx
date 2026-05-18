'use client'

import { useState, useEffect, useMemo } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import { Upload, Search, RefreshCw, Download } from 'lucide-react'
import BackToSD from '@/components/layout/BackToSD'

interface MasterSku {
  sku: string
  description: string
  brand: string
  avg_selling_price: number
  moq: number
  lead_time_wk: number
  status: string
  uom?: string
  safety_stock?: number
  buffer_stock?: number
  demand_source?: string
  remarks?: string
}

export default function MasterSkuPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()

  const [skus,      setSkus]      = useState<MasterSku[]>([])
  const [loading,   setLoading]   = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [search,    setSearch]    = useState('')
  const [brand,     setBrand]     = useState('All')
  const [status,    setStatus]    = useState('All')

  useEffect(() => { loadSkus() }, [])

  async function loadSkus() {
    setLoading(true); setError(null)
    const { data, error: err } = await supabase
      .from('master_sku')
      .select('sku, description, brand, avg_selling_price, moq, lead_time_wk, status, uom, safety_stock, buffer_stock, demand_source, remarks')
      .order('brand').order('sku')
    if (err) { setError(err.message); setLoading(false); return }
    setSkus(data ?? [])
    setLoading(false)
  }

  async function handleExport() {
    setExporting(true)
    try {
      const XLSX = await import('xlsx')

      // Row 1: title, Row 2: instructions, Row 3: headers, Row 4+: data
      // This matches the template format the API route parses (range: 2 = skip first 2 rows)
      const title = [['CTG Master SKU Upload Template']]
      const instructions = [['Fill in fields below. SKU * and Brand * are required for new SKUs. Blank cells keep existing values on update.']]
      const headers = [['SKU *', 'Brand *', 'Description', 'UOM', 'MOQ', 'Lead Time (wks)', 'ASP (RM)', 'Safety Stock', 'Buffer Stock', 'Status', 'Category', 'Notes']]
      const dataRows = skus.map(s => [
        s.sku,
        s.brand,
        s.description ?? '',
        s.uom ?? '',
        s.moq ?? '',
        s.lead_time_wk ?? '',
        Number(s.avg_selling_price) > 0 ? Number(s.avg_selling_price) : '',
        s.safety_stock ?? '',
        s.buffer_stock ?? '',
        s.status ?? 'Active',
        s.demand_source ?? '',
        s.remarks ?? '',
      ])

      const wsData = [...title, ...instructions, ...headers, ...dataRows]
      const ws = XLSX.utils.aoa_to_sheet(wsData)

      // Column widths
      ws['!cols'] = [
        { wch: 18 }, { wch: 14 }, { wch: 40 }, { wch: 8 },
        { wch: 10 }, { wch: 16 }, { wch: 10 }, { wch: 14 },
        { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 20 },
      ]

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Master SKU')

      const date = new Date().toLocaleDateString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' }).replace(/\//g, '')
      XLSX.writeFile(wb, `CTG_Master_SKU_Export_${date}.xlsx`)
    } catch (e: any) {
      setError('Export failed: ' + e.message)
    } finally {
      setExporting(false)
    }
  }

  const brands   = useMemo(() => ['All', ...Array.from(new Set(skus.map(s => s.brand)))], [skus])
  const statuses = ['All', 'Active', 'Inactive']

  const filtered = useMemo(() => skus.filter(s => {
    const q = search.toLowerCase()
    return (
      (!search || s.sku.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q)) &&
      (brand  === 'All' || s.brand  === brand) &&
      (status === 'All' || s.status === status)
    )
  }), [skus, search, brand, status])

  const totalActive = skus.filter(s => s.status === 'Active').length
  const withAsp     = skus.filter(s => Number(s.avg_selling_price) > 0).length
  const withoutAsp  = skus.filter(s => Number(s.avg_selling_price) === 0).length

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">

      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <BackToSD />
          <div className="w-px h-4 bg-gray-200" />
          <h1 className="text-sm font-semibold text-gray-900">Master SKU</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadSkus}
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 px-3 py-1.5 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
          >
            <RefreshCw size={12} /> Refresh
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || skus.length === 0}
            className="inline-flex items-center gap-1.5 text-xs text-gray-600 px-3 py-1.5 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            <Download size={12} /> {exporting ? 'Exporting...' : 'Export'}
          </button>
          <button
            onClick={() => router.push('/master-sku/upload')}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-white px-3 py-1.5 bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors"
          >
            <Upload size={12} /> Update / Upload SKUs
          </button>
        </div>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Total SKUs', value: skus.length,  sub: 'all brands' },
          { label: 'Active',     value: totalActive,  sub: `${skus.length - totalActive} inactive` },
          { label: 'With ASP',   value: withAsp,      sub: 'GSheet forecast tier' },
          { label: 'No ASP',     value: withoutAsp,   sub: 'Statistical model tier' },
        ].map(m => (
          <div key={m.label} className="bg-gray-50 rounded-lg px-4 py-3">
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1">{m.label}</p>
            <p className="text-xl font-semibold text-gray-900">{m.value}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{m.sub}</p>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search SKU or description..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-teal-400"
          />
        </div>
        <select value={brand}  onChange={e => setBrand(e.target.value)}  className="text-xs px-2 py-1.5 border border-gray-200 rounded-lg bg-white text-gray-600 focus:outline-none focus:border-teal-400">
          {brands.map(b   => <option key={b}>{b}</option>)}
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)} className="text-xs px-2 py-1.5 border border-gray-200 rounded-lg bg-white text-gray-600 focus:outline-none focus:border-teal-400">
          {statuses.map(s => <option key={s}>{s}</option>)}
        </select>
        <span className="text-xs text-gray-400 whitespace-nowrap">{filtered.length} SKUs</span>
      </div>

      {/* Table */}
      {error ? (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</div>
      ) : loading ? (
        <div className="text-sm text-gray-400 text-center py-16">Loading...</div>
      ) : (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['SKU', 'Brand', 'ASP (RM)', 'MOQ', 'Lead time', 'Forecast tier', 'Status'].map((h, i) => (
                  <th key={h} className={`px-4 py-2.5 font-medium text-gray-500 uppercase tracking-wide text-[10px] ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const asp  = Number(s.avg_selling_price)
                const tier = asp > 0 ? 'GSheet' : 'Statistical'
                return (
                  <tr key={s.sku} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-[11px] text-gray-700">{s.sku}</span>
                      <p className="text-[11px] text-gray-400 mt-0.5 leading-tight max-w-[280px]">{s.description}</p>
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-gray-600">{s.brand}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">
                      {asp > 0 ? <span className="text-gray-800">{asp.toFixed(2)}</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-gray-600">
                      {s.moq > 0 ? s.moq.toLocaleString() : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-gray-600">{s.lead_time_wk} wk</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full ${tier === 'GSheet' ? 'bg-teal-50 text-teal-700' : 'bg-gray-100 text-gray-500'}`}>{tier}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full ${s.status === 'Active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'}`}>{s.status}</span>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-xs text-gray-400">No SKUs match your filters</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-gray-400 mt-3">
        Live from Supabase · Export downloads in upload template format — edit and re-upload to apply changes · Blank cells on upload preserve existing values
      </p>
    </div>
  )
}


export default function MasterSkuPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()

  const [skus,    setSkus]    = useState<MasterSku[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [search,  setSearch]  = useState('')
  const [brand,   setBrand]   = useState('All')
  const [status,  setStatus]  = useState('All')

  useEffect(() => { loadSkus() }, [])

  async function loadSkus() {
    setLoading(true); setError(null)
    const { data, error: err } = await supabase
      .from('master_sku')
      .select('sku, description, brand, avg_selling_price, moq, lead_time_wk, status, uom')
      .order('brand').order('sku')
    if (err) { setError(err.message); setLoading(false); return }
    setSkus(data ?? [])
    setLoading(false)
  }

  const brands   = useMemo(() => ['All', ...Array.from(new Set(skus.map(s => s.brand)))], [skus])
  const statuses = ['All', 'Active', 'Inactive']

  const filtered = useMemo(() => skus.filter(s => {
    const q = search.toLowerCase()
    return (
      (!search || s.sku.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q)) &&
      (brand  === 'All' || s.brand  === brand) &&
      (status === 'All' || s.status === status)
    )
  }), [skus, search, brand, status])

  const totalActive = skus.filter(s => s.status === 'Active').length
  const withAsp     = skus.filter(s => Number(s.avg_selling_price) > 0).length
  const withoutAsp  = skus.filter(s => Number(s.avg_selling_price) === 0).length

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">

      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <BackToSD />
          <div className="w-px h-4 bg-gray-200" />
          <h1 className="text-sm font-semibold text-gray-900">Master SKU</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadSkus}
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 px-3 py-1.5 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
          >
            <RefreshCw size={12} /> Refresh
          </button>
          <button
            onClick={() => router.push('/master-sku/upload')}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-white px-3 py-1.5 bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors"
          >
            <Upload size={12} /> Update / Upload SKUs
          </button>
        </div>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Total SKUs', value: skus.length,  sub: 'all brands' },
          { label: 'Active',     value: totalActive,  sub: `${skus.length - totalActive} inactive` },
          { label: 'With ASP',   value: withAsp,      sub: 'GSheet forecast tier' },
          { label: 'No ASP',     value: withoutAsp,   sub: 'Statistical model tier' },
        ].map(m => (
          <div key={m.label} className="bg-gray-50 rounded-lg px-4 py-3">
            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1">{m.label}</p>
            <p className="text-xl font-semibold text-gray-900">{m.value}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{m.sub}</p>
          </div>
        ))}
      </div>

      {/* Filter bar — all in one row */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search SKU or description..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-7 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-teal-400"
          />
        </div>
        <select
          value={brand}
          onChange={e => setBrand(e.target.value)}
          className="text-xs px-2 py-1.5 border border-gray-200 rounded-lg bg-white text-gray-600 focus:outline-none focus:border-teal-400"
        >
          {brands.map(b => <option key={b}>{b}</option>)}
        </select>
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          className="text-xs px-2 py-1.5 border border-gray-200 rounded-lg bg-white text-gray-600 focus:outline-none focus:border-teal-400"
        >
          {statuses.map(s => <option key={s}>{s}</option>)}
        </select>
        <span className="text-xs text-gray-400 whitespace-nowrap">{filtered.length} SKUs</span>
      </div>

      {/* Table */}
      {error ? (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</div>
      ) : loading ? (
        <div className="text-sm text-gray-400 text-center py-16">Loading...</div>
      ) : (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['SKU', 'Brand', 'ASP (RM)', 'MOQ', 'Lead time', 'Forecast tier', 'Status'].map((h, i) => (
                  <th
                    key={h}
                    className={`px-4 py-2.5 font-medium text-gray-500 uppercase tracking-wide text-[10px] ${i === 0 ? 'text-left' : 'text-right'}`}
                  >{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const asp  = Number(s.avg_selling_price)
                const tier = asp > 0 ? 'GSheet' : 'Statistical'
                return (
                  <tr key={s.sku} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-[11px] text-gray-700">{s.sku}</span>
                      <p className="text-[11px] text-gray-400 mt-0.5 leading-tight max-w-[240px]">{s.description}</p>
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-gray-600">{s.brand}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">
                      {asp > 0 ? <span className="text-gray-800">{asp.toFixed(2)}</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-gray-600">
                      {s.moq > 0 ? s.moq.toLocaleString() : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-gray-600">{s.lead_time_wk} wk</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full ${
                        tier === 'GSheet' ? 'bg-teal-50 text-teal-700' : 'bg-gray-100 text-gray-500'
                      }`}>{tier}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`inline-block text-[10px] font-medium px-2 py-0.5 rounded-full ${
                        s.status === 'Active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'
                      }`}>{s.status}</span>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-xs text-gray-400">No SKUs match your filters</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-gray-400 mt-3">
        Live from Supabase · Refresh to reload · "Update / Upload SKUs" to add or modify records
      </p>
    </div>
  )
}
