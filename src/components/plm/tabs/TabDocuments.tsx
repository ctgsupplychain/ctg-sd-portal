'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { PlmDocument } from '@/lib/plm-types'
import { Upload, FileText, Download } from 'lucide-react'

const FILE_STYLE: Record<string, { bg: string; color: string }> = {
  pdf: { bg: '#FEF2F2', color: '#dc2626' },
  ai:  { bg: '#FFFBEB', color: '#d97706' },
  dwg: { bg: '#EFF6FF', color: '#2563eb' },
  png: { bg: '#F0FDF4', color: '#16a34a' },
}

export default function TabDocuments({ pn }: { pn: string }) {
  const [docs, setDocs] = useState<PlmDocument[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('plm_documents').select('*').eq('part_number', pn)
      .order('uploaded_at', { ascending: false })
      .then(({ data }) => { setDocs((data ?? []) as PlmDocument[]); setLoading(false) })
  }, [pn])

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
        <button onClick={() => alert('Connect Supabase Storage to enable uploads')}
          className="flex items-center gap-1.5 text-xs text-[#048A81] border border-[#048A81]/30 rounded-lg px-3 py-1.5 hover:bg-[#F0FDF9] transition-colors">
          <Upload size={13} /> Upload
        </button>
      </div>

      {docs.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#EAECF0] p-8 flex flex-col items-center gap-2">
          <FileText size={28} className="text-[#D0D5DD]" />
          <div className="text-sm text-[#344054] font-medium">No documents yet</div>
          <div className="text-xs text-[#667085]">Upload spec sheet, drawing or artwork</div>
        </div>
      ) : (
        <div className="space-y-2">
          {current.map(d => <DocRow key={d.id} doc={d} />)}
          {archived.length > 0 && (
            <>
              <div className="text-xs text-[#667085] uppercase tracking-wider pt-3">Archived</div>
              {archived.map(d => <DocRow key={d.id} doc={d} archived />)}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function DocRow({ doc, archived }: { doc: PlmDocument; archived?: boolean }) {
  const ext = (doc.file_name.split('.').pop() ?? 'file').toLowerCase()
  const style = FILE_STYLE[ext] ?? { bg: '#F9FAFB', color: '#667085' }
  return (
    <div onClick={() => window.open(doc.file_url, '_blank')}
      className="flex items-center gap-3 p-3 bg-white border border-[#EAECF0] rounded-xl cursor-pointer hover:border-[#048A81]/40 hover:bg-[#F0FDF9] transition-all"
      style={{ opacity: archived ? 0.55 : 1 }}>
      <div className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-semibold font-mono uppercase flex-shrink-0"
        style={{ background: style.bg, color: style.color }}>{ext}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-[#344054] truncate">{doc.file_name}</div>
        <div className="text-xs text-[#667085] font-mono mt-0.5">v{doc.version} · {doc.doc_type} · {new Date(doc.uploaded_at).toLocaleDateString('en-MY')}</div>
      </div>
      <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
        style={archived ? { background: '#F2F4F7', color: '#667085' } : { background: '#F0FDF9', color: '#048A81' }}>
        {archived ? 'Archived' : 'Current'}
      </span>
      <Download size={14} className="text-[#D0D5DD] flex-shrink-0" />
    </div>
  )
}
