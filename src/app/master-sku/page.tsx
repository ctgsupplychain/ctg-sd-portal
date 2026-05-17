'use client'

import { useState, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle, PlusCircle, RefreshCw } from 'lucide-react'
import BackToSD from '@/components/layout/BackToSD'

interface UploadResult {
  success: boolean
  total_rows: number
  inserted: number
  updated: number
  skipped: number
  inserted_skus: string[]
  updated_skus: string[]
  skipped_details: string[]
}

export default function MasterSkuPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastUploaded, setLastUploaded] = useState<string | null>(null)

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

      const res = await fetch('/api/master-sku', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Upload failed')
      setResult(json)
      setLastUploaded(new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' }))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <div className="flex items-center gap-3 mb-6">
        <BackToSD />
        <div className="w-px h-4 bg-gray-200" />
        <h1 className="text-sm font-semibold text-gray-900">Master SKU Upload</h1>
      </div>
      <p className="text-sm text-gray-500 mb-8">
        Upload to add new SKUs or update existing ones. Upserts on SKU code — blank fields keep existing values.
      </p>

      {/* Download template */}
      <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-teal-800">Need the template?</p>
          <p className="text-xs text-teal-600 mt-0.5">Download the Master SKU Upload Template</p>
        </div>
        <a
          href="/templates/CTG_Master_SKU_Template.xlsx"
          className="text-xs font-medium text-teal-700 border border-teal-300 px-3 py-1.5 rounded-lg hover:bg-teal-100 transition-colors flex items-center gap-1.5"
        >
          <FileSpreadsheet size={13} /> Download Template
        </a>
      </div>

      {lastUploaded && <p className="text-xs text-gray-400 mb-4">Last uploaded: {lastUploaded}</p>}

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById('sku-file-input')?.click()}
        className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
          dragging ? 'border-teal-500 bg-teal-50' : 'border-gray-300 bg-gray-50 hover:border-teal-400'
        }`}
      >
        <input id="sku-file-input" type="file" accept=".xlsx" className="hidden" onChange={handleFileChange} />
        {file ? (
          <div>
            <FileSpreadsheet size={24} className="mx-auto mb-2 text-teal-600" />
            <p className="text-sm font-medium text-teal-700">{file.name}</p>
            <p className="text-xs text-gray-400 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
          </div>
        ) : (
          <div>
            <Upload size={24} className="mx-auto mb-2 text-gray-400" />
            <p className="text-sm text-gray-500">Drag & drop your Master SKU .xlsx file here</p>
            <p className="text-xs text-gray-400 mt-1">or click to browse</p>
          </div>
        )}
      </div>

      <button
        onClick={handleUpload}
        disabled={!file || loading}
        className="mt-5 w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
      >
        {loading ? 'Processing...' : 'Upload & Save'}
      </button>

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex gap-2">
          <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-4 space-y-3">
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-4 space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle size={16} className="text-green-600" />
              <p className="text-sm font-medium text-green-800">Upload successful</p>
            </div>
            <div className="text-sm text-green-700 space-y-1">
              <p>Total rows: <span className="font-medium">{result.total_rows}</span></p>
              <p className="flex items-center gap-1.5">
                <PlusCircle size={13} className="text-green-600" />
                New SKUs inserted: <span className="font-medium">{result.inserted}</span>
              </p>
              <p className="flex items-center gap-1.5">
                <RefreshCw size={13} className="text-green-600" />
                Existing SKUs updated: <span className="font-medium">{result.updated}</span>
              </p>
              {result.skipped > 0 && (
                <p className="text-yellow-700">Skipped: <span className="font-medium">{result.skipped}</span></p>
              )}
            </div>
          </div>

          {result.inserted_skus?.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
              <p className="text-xs font-medium text-blue-800 mb-1">New SKUs added:</p>
              <p className="text-xs text-blue-700">{result.inserted_skus.join(', ')}</p>
            </div>
          )}

          {result.skipped_details?.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3">
              <p className="text-xs font-medium text-yellow-800 mb-1">Skipped:</p>
              <ul className="text-xs text-yellow-700 space-y-0.5">
                {result.skipped_details.map((s, i) => <li key={i}>• {s}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
