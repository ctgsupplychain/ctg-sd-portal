'use client'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { PlmDocument } from '@/lib/plm-types'
import { Upload, FileText, Download, Loader2, X } from 'lucide-react'

const DOC_TYPES = ['spec_sheet', 'drawing', 'test_report', 'cert', 'other'] as const
type DocType = typeof DOC_TYPES[number]

const FILE_STYLE: Record<string, { bg: string; color: string }> = {
  pdf: { bg: '#FEF2F2', color: '#dc2626' },
  ai:  { bg: '#FFFBEB', color: '#d97706' },
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

  if (loading) return <div className="text-sm text-[#667085] p-4">Loading documents…</div>

  const current = docs.filter(d => d.is_current)
  const archived = docs.filter(d => !d.is_current)

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-[#101828]">Documents</h2>
          <p className="text-xs text-[#667085] mt-0.5">Drawings, spec sheets, artwork attached to {pn}.</p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-1.5 text-xs text-[#048A81] border border-[#048A81]/30 rounded-lg px-3 py-1.5 hover:bg-[#F0FDF9] transition-colors">
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
        <div className="bg-white rounded-xl border border-[#EAECF0] p-8 flex flex-col items-center gap-2">
          <FileText size={28} className="text-[#D0D5DD]" />
          <div className="text-sm text-[#344054] font-medium">No documents yet</div>
          <div className="text-xs text-[#667085]">Upload spec sheet, drawing or artwork</div>
        </div>
      ) : (
        <div className="space-y-2">
          {current.map(d => <DocRow key={d.id} doc={d} pn={pn} />)}
          {archived.length > 0 && (
            <>
              <div className="text-xs text-[#667085] uppercase tracking-wider pt-3">Archived</div>
              {archived.map(d => <DocRow key={d.id} doc={d} pn={pn} archived />)}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Upload Modal ─────────────────────────────────────────────────────────────

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EAECF0]">
          <h3 className="text-sm font-semibold text-[#101828]">Upload Document</h3>
          <button onClick={onClose} className="text-[#667085] hover:text-[#344054]"><X size={16} /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#344054] mb-1">File</label>
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-[#D0D5DD] rounded-xl p-5 flex flex-col items-center gap-2 cursor-pointer hover:border-[#048A81]/50 hover:bg-[#F0FDF9] transition-colors">
              <Upload size={20} className="text-[#D0D5DD]" />
              <span className="text-xs text-[#667085]">
                {file ? file.name : 'Click to choose file (PDF, DWG, PNG, AI…)'}
              </span>
            </div>
            <input ref={fileRef} type="file" className="hidden"
              onChange={e => setFile(e.target.files?.[0] ?? null)} />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#344054] mb-1">Document type</label>
            <select
              value={docType}
              onChange={e => setDocType(e.target.value as DocType)}
              className="w-full text-xs border border-[#D0D5DD] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#048A81]/30">
              {DOC_TYPES.map(t => (
                <option key={t} value={t}>{t.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#344054] mb-1">Version</label>
            <input
              type="text"
              value={version}
              onChange={e => setVersion(e.target.value)}
              placeholder="e.g. v1.0, Rev A"
              className="w-full text-xs border border-[#D0D5DD] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#048A81]/30" />
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
          )}
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-[#EAECF0]">
          <button onClick={onClose} disabled={uploading}
            className="flex-1 text-xs border border-[#D0D5DD] rounded-lg py-2 text-[#344054] hover:bg-[#F9FAFB] transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={!file || uploading}
            className="flex-1 text-xs bg-[#048A81] text-white rounded-lg py-2 flex items-center justify-center gap-1.5 hover:bg-[#037068] transition-colors disabled:opacity-50">
            {uploading ? <><Loader2 size={13} className="animate-spin" /> Uploading…</> : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Doc Row ──────────────────────────────────────────────────────────────────

function DocRow({ doc, pn, archived }: { doc: PlmDocument; pn: string; archived?: boolean }) {
  const ext = (doc.file_name.split('.').pop() ?? 'file').toLowerCase()
  const style = FILE_STYLE[ext] ?? { bg: '#F9FAFB', color: '#667085' }

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
      className="flex items-center gap-3 p-3 bg-white border border-[#EAECF0] rounded-xl cursor-pointer hover:border-[#048A81]/40 hover:bg-[#F0FDF9] transition-all"
      style={{ opacity: archived ? 0.55 : 1 }}>
      <div className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-semibold font-mono uppercase flex-shrink-0"
        style={{ background: style.bg, color: style.color }}>{ext}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-[#344054] truncate">{doc.file_name}</div>
        <div className="text-xs text-[#667085] font-mono mt-0.5">
          v{doc.version} · {doc.doc_type} · {new Date(doc.uploaded_at).toLocaleDateString('en-MY')}
        </div>
      </div>
      <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
        style={archived ? { background: '#F2F4F7', color: '#667085' } : { background: '#F0FDF9', color: '#048A81' }}>
        {archived ? 'Archived' : 'Current'}
      </span>
      <Download size={14} className="text-[#D0D5DD] flex-shrink-0" />
    </div>
  )
}
