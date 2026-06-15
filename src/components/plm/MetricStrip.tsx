'use client'
import { fmtMYR } from '@/lib/plm-cost'

interface Props {
  totMat: number
  totFreight: number
  totTax: number
  totLanded: number
  freightPct: number
  taxPct: number
  fgCharge: number | null
  supplierGM: number | null
}

export default function MetricStrip({ totMat, totFreight, totTax, totLanded, freightPct, taxPct }: Props) {
  const metrics = [
    { label: 'Material Cost',     value: fmtMYR(totMat),          sub: 'components only',          accent: true },
    { label: 'Inbound Cost',      value: fmtMYR(totFreight),       sub: `${freightPct}% of material`, accent: false },
    { label: 'Tax (SST)',         value: fmtMYR(totTax),           sub: `${taxPct}% on landed`,      accent: false },
    { label: 'MVA',               value: 'RM 1.20',                sub: 'OEM assembly charge',       accent: false, warn: true },
    { label: 'Total Landed Cost', value: fmtMYR(totLanded + 1.20), sub: 'to us, per FG unit',       accent: false, bold: true },
  ]

  return (
    <div className="grid border-b border-[#E4DDD3] bg-white" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
      {metrics.map((m, i) => (
        <div
          key={i}
          className="px-5 py-4"
          style={{ borderRight: i < metrics.length - 1 ? '1px solid #E4DDD3' : 'none' }}
        >
          <div className="text-[10px] font-medium text-[#4B5563] uppercase tracking-wider mb-1.5">
            {m.label}
          </div>
          <div
            className="text-xl font-semibold font-mono"
            style={{
              color: m.accent ? '#0E5C56' : m.warn ? '#d97706' : m.bold ? '#1F2937' : '#1F2937'
            }}
          >
            {m.value}
          </div>
          <div className="text-xs text-[#4B5563] mt-0.5">{m.sub}</div>
        </div>
      ))}
    </div>
  )
}
