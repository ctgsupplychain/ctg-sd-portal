'use client'

import { useState, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle } from 'lucide-react'

interface UploadResult {
  success: boolean
  total_rows: number
  upserted: number
  skipped: number
  invalid_skus: string[]
}

export default function SupplyInputPage() {
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

      const res = await fetch('/api/supply-input', {
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
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">Supply Input — PO Upload</h1>
      <p className="text-sm text-gray-500 mb-8">
        Upload the weekly Open PO file (.xlsx). Records are upserted by PO Number + SKU. Missing POs are kept as-is.
      </p>

      {/* Download template link */}
      <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-teal-800">Need the template?</p>
          <p className="text-xs text-teal-600 mt-0.5">Download and fill in the CTG PO Upload Template</p>
        </div>
        <a
          href="/templates/CTG_PO_Upload_Template.xlsx"
          className="text-xs font-medium text-teal-700 border border-teal-300 px-3 py-1.5 rounded-lg hover:bg-teal-100 transition-colors flex items-center gap-1.5"
        >
          <FileSpreadsheet size={13} /> Download Template
        </a>
      </div>

      {lastUploaded && (
        <p className="text-xs text-gray-400 mb-4">Last uploaded: {lastUploaded}</p>
      )}

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById('po-file-input')?.click()}
        className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
          dragging ? 'border-teal-500 bg-teal-50' : 'border-gray-300 bg-gray-50 hover:border-teal-400'
        }`}
      >
        <input id="po-file-input" type="file" accept=".xlsx" className="hidden" onChange={handleFileChange} />
        {file ? (
          <div>
            <FileSpreadsheet size={24} className="mx-auto mb-2 text-teal-600" />
            <p className="text-sm font-medium text-teal-700">{file.name}</p>
            <p className="text-xs text-gray-400 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
          </div>
        ) : (
          <div>
            <Upload size={24} className="mx-auto mb-2 text-gray-400" />
            <p className="text-sm text-gray-500">Drag & drop your PO .xlsx file here</p>
            <p className="text-xs text-gray-400 mt-1">or click to browse</p>
          </div>
        )}
      </div>

      <button
        onClick={handleUpload}
        disabled={!file || loading}
        className="mt-5 w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
      >
        {loading ? 'Uploading...' : 'Upload & Save'}
      </button>

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex gap-2">
          <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-4 bg-green-50 border border-green-200 rounded-lg px-4 py-4 space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="text-green-600" />
            <p className="text-sm font-medium text-green-800">Upload successful</p>
          </div>
          <div className="text-sm text-green-700 space-y-1">
            <p>Total rows in file: <span className="font-medium">{result.total_rows}</span></p>
            <p>Records upserted: <span className="font-medium">{result.upserted}</span></p>
            {result.skipped > 0 && (
              <p>Rows skipped (invalid SKU): <span className="font-medium">{result.skipped}</span></p>
            )}
          </div>
          {result.invalid_skus?.length > 0 && (
            <div className="mt-2 bg-yellow-50 border border-yellow-200 rounded-md px-3 py-2">
              <p className="text-xs font-medium text-yellow-800 mb-1">Unrecognized SKUs (not saved):</p>
              <ul className="text-xs text-yellow-700 space-y-0.5">
                {result.invalid_skus.map(sku => <li key={sku}>• {sku}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
