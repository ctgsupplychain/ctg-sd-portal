'use client'

import { useState, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import BackToSD from '@/components/layout/BackToSD'

interface UploadResult {
  success: boolean
  total_rows: number
  upserted: number
  duplicates_removed: number
  missing_skindae_skus: string[]
}

export default function InventoryUploadPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()

  const [file, setFile] = useState<File | null>(null)
  const [snapshotDate, setSnapshotDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  )
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped && dropped.name.endsWith('.xlsx')) {
      setFile(dropped)
      setResult(null)
      setError(null)
    } else {
      setError('Please upload an .xlsx file.')
    }
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected) {
      setFile(selected)
      setResult(null)
      setError(null)
    }
  }

  const handleUpload = async () => {
    if (!file || !snapshotDate) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }

      const formData = new FormData()
      formData.append('file', file)
      formData.append('snapshot_date', snapshotDate)

      const res = await fetch('/api/inventory-upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      })

      const json = await res.json()

      if (!res.ok) {
        setError(json.error ?? 'Upload failed.')
      } else {
        setResult(json)
      }
    } catch (err: any) {
      setError(err.message ?? 'Unexpected error.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <div className="flex items-center gap-3 mb-6">
        <BackToSD />
        <div className="w-px h-4 bg-gray-200" />
        <h1 className="text-sm font-semibold text-gray-900">WMS Inventory Upload</h1>
      </div>
      <p className="text-sm text-gray-500 mb-8">
        Upload the daily WMS inventory report (.xlsx). Data will be saved to the inventory snapshot database.
      </p>

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Snapshot Date
        </label>
        <input
          type="date"
          value={snapshotDate}
          onChange={e => setSnapshotDate(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
        <p className="text-xs text-gray-400 mt-1">Defaults to today. Adjust if uploading a backdated report.</p>
      </div>

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
          dragging ? 'border-teal-500 bg-teal-50' : 'border-gray-300 bg-gray-50 hover:border-teal-400'
        }`}
        onClick={() => document.getElementById('file-input')?.click()}
      >
        <input
          id="file-input"
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={handleFileChange}
        />
        {file ? (
          <div>
            <p className="text-sm font-medium text-teal-700">{file.name}</p>
            <p className="text-xs text-gray-400 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-500">Drag & drop your WMS .xlsx file here</p>
            <p className="text-xs text-gray-400 mt-1">or click to browse</p>
          </div>
        )}
      </div>

      <button
        onClick={handleUpload}
        disabled={!file || !snapshotDate || loading}
        className="mt-6 w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
      >
        {loading ? 'Uploading...' : 'Upload & Save'}
      </button>

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-4 bg-green-50 border border-green-200 rounded-lg px-4 py-4 space-y-2">
          <p className="text-sm font-medium text-green-800">Upload successful</p>
          <div className="text-sm text-green-700 space-y-1">
            <p>Total rows in file: <span className="font-medium">{result.total_rows}</span></p>
            <p>Records upserted: <span className="font-medium">{result.upserted}</span></p>
            {result.duplicates_removed > 0 && (
              <p>Duplicates removed: <span className="font-medium">{result.duplicates_removed}</span></p>
            )}
          </div>
          {result.missing_skindae_skus.length > 0 && (
            <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-md px-3 py-2">
              <p className="text-xs font-medium text-yellow-800 mb-1">SkinDae SKUs not found in this report:</p>
              <ul className="text-xs text-yellow-700 space-y-0.5">
                {result.missing_skindae_skus.map(sku => (
                  <li key={sku}>• {sku}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
