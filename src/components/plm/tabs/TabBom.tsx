'use client'
import { Part } from '@/lib/plm-types'
import BomViewer from '@/components/plm/BomViewer'

// The BOM tab reuses the full BomViewer (multi-level table, cost rollup controls,
// per-component doc drawer). On the part-detail page it renders inside the tab body.
export default function TabBom({ fg }: { fg: Part }) {
  return (
    <div className="-m-4 h-full">
      <BomViewer fg={fg} embedded />
    </div>
  )
}
