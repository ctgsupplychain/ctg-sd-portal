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
    {
      label: 'Material Cost',
      value: fmtMYR(totMat),
      color: 'var(--accent)',
      sub: 'components only',
    },
    {
      label: 'Inbound Cost',
      value: fmtMYR(totFreight),
      color: freightPct > 0 ? 'var(--warn)' : 'var(--muted)',
      sub: `${freightPct}% of material`,
    },
    {
      label: 'Tax (SST)',
      value: fmtMYR(totTax),
      color: taxPct > 0 ? 'var(--text)' : 'var(--muted)',
      sub: `${taxPct}% on landed`,
    },
    {
      label: 'MVA',
      value: 'RM 1.20',
      color: 'var(--warn)',
      sub: 'OEM assembly charge',
    },
    {
      label: 'Total Landed Cost',
      value: fmtMYR(totLanded + 1.20),
      color: 'var(--text)',
      sub: 'to us, per FG unit',
    },
  ]

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(5, 1fr)',
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg1)',
      flexShrink: 0,
    }}>
      {metrics.map((m, i) => (
        <div key={i} style={{
          padding: '12px 18px',
          borderRight: i < metrics.length - 1 ? '1px solid var(--border)' : 'none',
        }}>
          <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'monospace', marginBottom: 4 }}>
            {m.label}
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, fontFamily: 'monospace', color: m.color }}>
            {m.value}
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{m.sub}</div>
        </div>
      ))}
    </div>
  )
}
