'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Part } from '@/lib/plm-types'
import BomViewer from '@/components/plm/BomViewer'
import Sidebar from '@/components/plm/Sidebar'

export default function PlmPage() {
  const [fgParts, setFgParts] = useState<Part[]>([])
  const [selected, setSelected] = useState<Part | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    supabase
      .from('parts')
      .select('*')
      .eq('category', 'FG')
      .eq('lifecycle_status', 'Active')
      .order('part_number')
      .then(({ data }) => {
        const parts = (data ?? []) as Part[]
        setFgParts(parts)
        if (parts.length > 0) setSelected(parts[0])
        setLoading(false)
      })
  }, [])

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
      <Sidebar
        parts={fgParts}
        selected={selected}
        onSelect={setSelected}
        loading={loading}
      />
      <div style={{ flex: 1, overflow: 'auto' }}>
        {selected
          ? <BomViewer fg={selected} />
          : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--muted)', fontSize: 14 }}>
              {loading ? 'Loading…' : 'No FG parts found. Add a part to get started.'}
            </div>
        }
      </div>
    </div>
  )
}
