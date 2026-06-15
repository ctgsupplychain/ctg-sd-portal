'use client'
import { useRouter } from 'next/navigation'
import { Part } from '@/lib/plm-types'
import { ArrowLeft } from 'lucide-react'
import clsx from 'clsx'

interface Props {
  parts: Part[]
  selected: Part | null
  onSelect: (p: Part) => void
  loading: boolean
}

const BRAND_COLORS: Record<string, string> = {
  Naturelish: '#0E5C56',
  Bonlife:    '#6366f1',
  Mejorecare: '#8b5cf6',
  KATA:       '#f59e0b',
  iProcare:   '#10b981',
  SwissMed:   '#4B5563',
  GoHerb:     '#f97316',
}

function brandColor(brand: string | null): string {
  return BRAND_COLORS[brand ?? ''] ?? '#4B5563'
}

export default function Sidebar({ parts, selected, onSelect, loading }: Props) {
  const router = useRouter()

  const grouped = parts.reduce<Record<string, Part[]>>((acc, p) => {
    const key = p.brand ?? 'Other'
    acc[key] = acc[key] ?? []
    acc[key].push(p)
    return acc
  }, {})

  return (
    <div className="w-52 min-w-52 flex flex-col h-full" style={{ background: "#1F2937" }}>
      {/* Header */}
      <div className="px-4 py-5 border-b border-white/10">
        <div className="text-white font-semibold text-sm tracking-wide">CTG PLM</div>
        <div className="text-white/40 text-xs mt-0.5">Product Lifecycle Mgmt</div>
      </div>

      {/* Back to S&D */}
      <div className="px-3 pt-3 pb-1">
        <button
          onClick={() => router.push('/dashboard')}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-white/50 hover:text-white hover:bg-white/8 transition-all text-xs font-medium border border-white/10 hover:border-white/20"
        >
          <ArrowLeft size={13} />
          <span>Back to Portal</span>
        </button>
      </div>

      {/* Section label */}
      <div className="px-4 pt-3 pb-1 text-white/30 text-xs uppercase tracking-widest font-medium">
        BOM Viewer
      </div>

      {/* SKU list */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="px-4 py-4 text-white/30 text-xs">Loading…</div>
        )}
        {Object.entries(grouped).map(([brand, brandParts]) => (
          <div key={brand}>
            <div className="px-4 py-1.5 text-white/30 text-xs uppercase tracking-widest font-medium flex items-center gap-2">
              <span
                className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: brandColor(brand) }}
              />
              {brand}
            </div>
            {brandParts.map(p => {
              const isSelected = selected?.part_number === p.part_number
              return (
                <button
                  key={p.part_number}
                  onClick={() => onSelect(p)}
                  className={clsx(
                    'w-full text-left px-4 py-2 border-l-2 transition-all',
                    isSelected
                      ? 'bg-white/8 border-[#0E5C56]'
                      : 'border-transparent hover:bg-white/5 hover:border-white/20'
                  )}
                >
                  <div className={clsx(
                    'text-xs font-mono mb-0.5',
                    isSelected ? 'text-[#0E5C56]' : 'text-white/40'
                  )}>
                    {p.part_number}
                  </div>
                  <div className={clsx(
                    'text-xs leading-tight',
                    isSelected ? 'text-white font-medium' : 'text-white/50'
                  )}>
                    {p.description}
                  </div>
                  {p.master_sku_ref && (
                    <div className="text-white/25 text-xs font-mono mt-0.5">{p.master_sku_ref}</div>
                  )}
                </button>
              )
            })}
          </div>
        ))}
        {!loading && parts.length === 0 && (
          <div className="px-4 py-4 text-white/30 text-xs">No active FG parts.</div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-white/10 text-white/25 text-xs">
        {parts.length} FG SKU{parts.length !== 1 ? 's' : ''} · ap-southeast-1
      </div>
    </div>
  )
}
