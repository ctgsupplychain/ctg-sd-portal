'use client'

import { useState, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
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

      // Parse xlsx client-side to avoid serverless timeout on large files
      const arrayBuffer = await file.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: 0 })

      if (!rows.length) {
        setError('No data found in the uploaded file.')
        return
      }

      const res = await fetch('/api/inventory-upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rows, snapshot_date: snapshotDate }),
      })

      let json: any
      try {
        json = await res.json()
      } catch {
        const text = await res.text().catch(() => 'No response body')
        setError(`Server error (${res.status}): ${text.slice(0, 200)}`)
        return
      }

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
        <div className="w-px h-4 bg-[#E4DDD3]" />
        <h1 className="text-sm font-semibold text-[#1F2937]">WMS Inventory Upload</h1>
      </div>
      <p className="text-sm text-[#4B5563] mb-8">
        Upload the daily WMS inventory report (.xlsx). Data will be saved to the inventory snapshot database.
      </p>

      <div className="mb-6">
        <label className="block text-sm font-medium text-[#1F2937] mb-1">
          Snapshot Date
        </label>
        <input
          type="date"
          value={snapshotDate}
          onChange={e => setSnapshotDate(e.target.value)}
          className="border border-[#E4DDD3] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E5C56]"
        />
        <p className="text-xs text-[#4B5563] mt-1">Defaults to today. Adjust if uploading a backdated report.</p>
      </div>

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
          dragging ? 'border-[#0E5C56] bg-[#DCEAE8]' : 'border-[#E4DDD3] bg-[#F4F2EE] hover:border-[#0E5C56]'
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
            <p className="text-sm font-medium text-[#0E5C56]">{file.name}</p>
            <p className="text-xs text-[#4B5563] mt-1">{(file.size / 1024).toFixed(1)} KB</p>
          </div>
        ) : (
          <div>
            <p className="text-sm text-[#4B5563]">Drag &amp; drop your WMS .xlsx file here</p>
            <p className="text-xs text-[#4B5563] mt-1">or click to browse</p>
          </div>
        )}
      </div>

      <button
        onClick={handleUpload}
        disabled={!file || !snapshotDate || loading}
        className="mt-6 w-full bg-[#0E5C56] hover:bg-[#0A4A45] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
      >
        {loading ? 'Parsing & uploading...' : 'Upload & Save'}
      </button>

      {error && (
        <div className="mt-4 bg-[#FAEAEA] border border-[#F5C6C4] rounded-lg px-4 py-3">
          <p className="text-sm text-[#C5453F]">{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-4 bg-[#DCEAE8] border border-[#DCEAE8] rounded-lg px-4 py-4 space-y-2">
          <p className="text-sm font-medium text-[#0E5C56]">Upload successful</p>
          <div className="text-sm text-[#0E5C56] space-y-1">
            <p>Total rows in file: <span className="font-medium">{result.total_rows}</span></p>
            <p>Records upserted: <span className="font-medium">{result.upserted}</span></p>
            {result.duplicates_removed > 0 && (
              <p>Duplicates removed: <span className="font-medium">{result.duplicates_removed}</span></p>
            )}
          </div>
          {result.missing_skindae_skus.length > 0 && (
            <div className="mt-3 bg-[#FEF3E2] border border-[#F9DEB8] rounded-md px-3 py-2">
              <p className="text-xs font-medium text-yellow-800 mb-1">SkinDae SKUs not found in this report:</p>
              <ul className="text-xs text-[#E8A33D] space-y-0.5">
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
