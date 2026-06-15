'use client'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { PlmDocument } from '@/lib/plm-types'
import { Upload, FileText, Download, Loader2, X } from 'lucide-react'

const DOC_TYPES = ['spec_sheet', 'drawing', 'test_report', 'cert', 'rfq', 'other'] as const
type DocType = typeof DOC_TYPES[number]

const FILE_STYLE: Record<string, { bg: string; color: string }> = {
  pdf: { bg: '#FEF2F2', color: '#dc2626' },
  ai:  { bg: '#FEF3E2', color: '#E8A33D' },
  dwg: { bg: '#EFF6FF', color: '#2563eb' },
  png: { bg: '#F0FDF4', color: '#16a34a' },
}

export default function TabDocuments({ pn }: { pn: string }) {
  const [docs, setDocs] = useState<PlmDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)

  const fetchDocs = async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('plm_documents')
      .select('*')
      .eq('part_number', pn)
      .order('uploaded_at', { ascending: false })
    setDocs((data ?? []) as PlmDocument[])
    setLoading(false)
  }

  useEffect(() => { fetchDocs() }, [pn])

  if (loading) return <div className="text-sm text-[#4B5563] p-4">Loading documents...</div>

  const current = docs.filter(d => d.is_current)
  const archived = docs.filter(d => !d.is_current)

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-[#1F2937]">Documents</h2>
          <p className="text-xs text-[#4B5563] mt-0.5">Drawings, spec sheets, artwork attached to {pn}.</p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-1.5 text-xs text-[#0E5C56] border border-[#0E5C56]/30 rounded-lg px-3 py-1.5 hover:bg-[#DCEAE8] transition-colors">
          <Upload size={13} /> Upload
        </button>
      </div>

      {showUpload && (
        <UploadModal
          pn={pn}
          onClose={() => setShowUpload(false)}
          onUploaded={() => { setShowUpload(false); fetchDocs() }}
        />
      )}

      {docs.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E4DDD3] p-8 flex flex-col items-center gap-2">
          <FileText size={28} className="text-[#E4DDD3]" />
          <div className="text-sm text-[#1F2937] font-medium">No documents yet</div>
          <div className="text-xs text-[#4B5563]">Upload spec sheet, drawing or artwork</div>
        </div>
      ) : (
        <div className="space-y-2">
          {current.map(d => <DocRow key={d.id} doc={d} pn={pn} />)}
          {archived.length > 0 && (
            <>
              <div className="text-xs text-[#4B5563] uppercase tracking-wider pt-3">Archived</div>
              {archived.map(d => <DocRow key={d.id} doc={d} pn={pn} archived />)}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// -- Upload Modal -------------------------------------------------------------

function UploadModal({ pn, onClose, onUploaded }: {
  pn: string
  onClose: () => void
  onUploaded: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [docType, setDocType] = useState<DocType>('spec_sheet')
  const [version, setVersion] = useState('v1.0')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const handleSubmit = async () => {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const supabase = createClient()
      const storagePath = `${pn}/${Date.now()}_${file.name}`

      const { error: uploadErr } = await supabase.storage
        .from('plm-documents')
        .upload(storagePath, file, { upsert: false })
      if (uploadErr) throw new Error(uploadErr.message)

      await supabase
        .from('plm_documents')
        .update({ is_current: false })
        .eq('part_number', pn)
        .eq('doc_type', docType)
        .eq('is_current', true)

      const { error: insertErr } = await supabase.from('plm_documents').insert({
        part_number: pn,
        doc_type: docType,
        file_name: file.name,
        file_url: storagePath,
        version,
        is_current: true,
      })
      if (insertErr) throw new Error(insertErr.message)

      onUploaded()
    } catch (e: any) {
      setError(e.message ?? 'Upload failed')
      setUploading(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const dropped = e.dataTransfer.files?.[0]
    if (dropped) setFile(dropped)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E4DDD3]">
          <h3 className="text-sm font-semibold text-[#1F2937]">Upload Document</h3>
          <button onClick={onClose} className="text-[#4B5563] hover:text-[#1F2937]">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">

          {/* File picker -- click or drag-and-drop */}
          <div>
            <label className="block text-xs font-medium text-[#1F2937] mb-1">File</label>
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragEnter={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={e => { e.preventDefault(); setDragging(false) }}
              onDrop={handleDrop}
              className="border-2 border-dashed rounded-xl p-5 flex flex-col items-center gap-2 cursor-pointer transition-colors"
              style={{
                borderColor: dragging ? '#0E5C56' : file ? '#0E5C56' : '#E4DDD3',
                background: dragging ? '#DCEAE8' : file ? '#DCEAE8' : 'transparent',
              }}>
              <Upload
                size={20}
                style={{ color: dragging || file ? '#0E5C56' : '#E4DDD3' }}
              />
              {file ? (
                <div className="text-center">
                  <div className="text-xs font-medium text-[#0E5C56]">{file.name}</div>
                  <div className="text-[10px] text-[#4B5563] mt-0.5">
                    {(file.size / 1024).toFixed(0)} KB &mdash; click to change
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <div className="text-xs text-[#4B5563]">
                    Drag &amp; drop or{' '}
                    <span className="text-[#0E5C56] font-medium">click to choose</span>
                  </div>
                  <div className="text-[10px] text-[#4B5563] mt-0.5">PDF, DWG, PNG, AI...</div>
                </div>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {/* Doc type */}
          <div>
            <label className="block text-xs font-medium text-[#1F2937] mb-1">Document type</label>
            <select
              value={docType}
              onChange={e => setDocType(e.target.value as DocType)}
              className="w-full text-xs border border-[#E4DDD3] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0E5C56]/30">
              {DOC_TYPES.map(t => (
                <option key={t} value={t}>
                  {t.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </option>
              ))}
            </select>
          </div>

          {/* Version */}
          <div>
            <label className="block text-xs font-medium text-[#1F2937] mb-1">Version</label>
            <input
              type="text"
              value={version}
              onChange={e => setVersion(e.target.value)}
              placeholder="e.g. v1.0, Rev A"
              className="w-full text-xs border border-[#E4DDD3] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0E5C56]/30"
            />
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
          )}
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-[#E4DDD3]">
          <button
            onClick={onClose}
            disabled={uploading}
            className="flex-1 text-xs border border-[#E4DDD3] rounded-lg py-2 text-[#1F2937] hover:bg-[#F4F2EE] transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!file || uploading}
            className="flex-1 text-xs bg-[#0E5C56] text-white rounded-lg py-2 flex items-center justify-center gap-1.5 hover:bg-[#037068] transition-colors disabled:opacity-50">
            {uploading ? (
              <><Loader2 size={13} className="animate-spin" /> Uploading...</>
            ) : (
              'Upload'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// -- Doc Row ------------------------------------------------------------------

const ROW_CLS = 'flex items-center gap-3 p-3 bg-white border border-[#E4DDD3] rounded-xl cursor-pointer transition-all'
const ROW_HOVER = 'hover:border-[#0E5C56]/40 hover:bg-[#DCEAE8]'

function DocRow({ doc, pn, archived }: { doc: PlmDocument; pn: string; archived?: boolean }) {
  const ext = (doc.file_name.split('.').pop() ?? 'file').toLowerCase()
  const style = FILE_STYLE[ext] ?? { bg: '#F4F2EE', color: '#4B5563' }

  const openDoc = async () => {
    const supabase = createClient()
    const { data, error } = await supabase.storage
      .from('plm-documents')
      .createSignedUrl(doc.file_url, 3600)
    if (error || !data?.signedUrl) {
      alert('Could not generate download link. Please try again.')
      return
    }
    window.open(data.signedUrl, '_blank')
  }

  return (
    <div
      onClick={openDoc}
      className={`${ROW_CLS} ${ROW_HOVER}`}
      style={{ opacity: archived ? 0.55 : 1 }}>
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-semibold font-mono uppercase flex-shrink-0"
        style={{ background: style.bg, color: style.color }}>
        {ext}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-[#1F2937] truncate">{doc.file_name}</div>
        <div className="text-xs text-[#4B5563] font-mono mt-0.5">
          v{doc.version} &middot; {doc.doc_type} &middot;{' '}
          {new Date(doc.uploaded_at).toLocaleDateString('en-MY')}
        </div>
      </div>
      <span
        className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
        style={archived
          ? { background: '#E4DDD3', color: '#4B5563' }
          : { background: '#DCEAE8', color: '#0E5C56' }}>
        {archived ? 'Archived' : 'Current'}
      </span>
      <Download size={14} className="text-[#E4DDD3] flex-shrink-0" />
    </div>
  )
}
