'use client'

import { useState, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle, PlusCircle, RefreshCw, ArrowLeft } from 'lucide-react'

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

export default function MasterSkuUploadPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()

  const [file,         setFile]         = useState<File | null>(null)
  const [dragging,     setDragging]     = useState(false)
  const [loading,      setLoading]      = useState(false)
  const [result,       setResult]       = useState<UploadResult | null>(null)
  const [error,        setError]        = useState<string | null>(null)
  const [lastUploaded, setLastUploaded] = useState<string | null>(null)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped?.name.endsWith('.xlsx')) { setFile(dropped); setResult(null); setError(null) }
    else setError('Please upload an .xlsx file.')
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

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/master-sku')}
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-[#E4DDD3] rounded-lg bg-[#F4F2EE] hover:bg-[#E4DDD3] transition-colors" style={{ color: "#4B5563" }}
        >
          <ArrowLeft size={13} /> Back to Master SKU
        </button>
        <div className="w-px h-4 bg-[#E4DDD3]" />
        <h1 className="text-sm font-semibold text-[#1F2937]">Update / Upload SKUs</h1>
      </div>

      <p className="text-sm text-[#4B5563] mb-8">
        Upload to add new SKUs or update existing ones. Upserts on SKU code — blank fields keep existing values.
      </p>

      {/* Download template */}
      <div className="bg-[#DCEAE8] border border-[#DCEAE8] rounded-xl px-4 py-3 mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-[#0E5C56]">Need the template?</p>
          <p className="text-xs text-[#0E5C56] mt-0.5">Download the Master SKU Upload Template</p>
        </div>
        <a
          href="/templates/CTG_Master_SKU_Template.xlsx"
          className="text-xs font-medium text-[#0E5C56] border border-[#0E5C56] px-3 py-1.5 rounded-lg hover:bg-[#DCEAE8] transition-colors flex items-center gap-1.5"
        >
          <FileSpreadsheet size={13} /> Download Template
        </a>
      </div>

      {lastUploaded && <p className="text-xs text-[#4B5563] mb-4">Last uploaded: {lastUploaded}</p>}

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById('sku-file-input')?.click()}
        className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
          dragging ? 'border-[#0E5C56] bg-[#DCEAE8]' : 'border-[#E4DDD3] bg-[#F4F2EE] hover:border-[#0E5C56]'
        }`}
      >
        <input id="sku-file-input" type="file" accept=".xlsx" className="hidden" onChange={handleFileChange} />
        {file ? (
          <div>
            <FileSpreadsheet size={24} className="mx-auto mb-2 text-[#0E5C56]" />
            <p className="text-sm font-medium text-[#0E5C56]">{file.name}</p>
            <p className="text-xs text-[#4B5563] mt-1">{(file.size / 1024).toFixed(1)} KB</p>
          </div>
        ) : (
          <div>
            <Upload size={24} className="mx-auto mb-2 text-[#4B5563]" />
            <p className="text-sm text-[#4B5563]">Drag & drop your Master SKU .xlsx file here</p>
            <p className="text-xs text-[#4B5563] mt-1">or click to browse</p>
          </div>
        )}
      </div>

      <button
        onClick={handleUpload}
        disabled={!file || loading}
        className="mt-5 w-full bg-[#0E5C56] hover:bg-[#0A4A45] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
      >
        {loading ? 'Processing...' : 'Upload & Save'}
      </button>

      {error && (
        <div className="mt-4 bg-[#FAEAEA] border border-[#F5C6C4] rounded-lg px-4 py-3 flex gap-2">
          <AlertCircle size={16} className="text-[#C5453F] flex-shrink-0 mt-0.5" />
          <p className="text-sm text-[#C5453F]">{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-4 space-y-3">
          <div className="bg-[#DCEAE8] border border-[#DCEAE8] rounded-lg px-4 py-4 space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle size={16} className="text-[#2F9E68]" />
              <p className="text-sm font-medium text-[#0E5C56]">Upload successful</p>
            </div>
            <div className="text-sm text-[#0E5C56] space-y-1">
              <p>Total rows: <span className="font-medium">{result.total_rows}</span></p>
              <p className="flex items-center gap-1.5">
                <PlusCircle size={13} className="text-[#2F9E68]" />
                New SKUs inserted: <span className="font-medium">{result.inserted}</span>
              </p>
              <p className="flex items-center gap-1.5">
                <RefreshCw size={13} className="text-[#2F9E68]" />
                Existing SKUs updated: <span className="font-medium">{result.updated}</span>
              </p>
              {result.skipped > 0 && (
                <p className="text-[#E8A33D]">Skipped: <span className="font-medium">{result.skipped}</span></p>
              )}
            </div>
          </div>
          {result.inserted_skus?.length > 0 && (
            <div className="bg-[#DCEAE8] border border-[#DCEAE8] rounded-lg px-4 py-3">
              <p className="text-xs font-medium text-[#0E5C56] mb-1">New SKUs added:</p>
              <p className="text-xs text-[#0E5C56]">{result.inserted_skus.join(', ')}</p>
            </div>
          )}
          {result.skipped_details?.length > 0 && (
            <div className="bg-[#FEF3E2] border border-[#F9DEB8] rounded-lg px-4 py-3">
              <p className="text-xs font-medium text-yellow-800 mb-1">Skipped:</p>
              <ul className="text-xs text-[#E8A33D] space-y-0.5">
                {result.skipped_details.map((s, i) => <li key={i}>• {s}</li>)}
              </ul>
            </div>
          )}
          <button
            onClick={() => router.push('/master-sku')}
            className="w-full text-xs text-[#0E5C56] border border-[#DCEAE8] py-2 rounded-lg hover:bg-[#DCEAE8] transition-colors"
          >
            ← Back to Master SKU list
          </button>
        </div>
      )}
    </div>
  )
}
