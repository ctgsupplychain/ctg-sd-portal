'use client'
import { useState, useMemo } from 'react'
import clsx from 'clsx'
import type { SkuSdResult, WeekInfo } from '@/lib/sd-compute'
import { FLAG_DISPLAY } from '@/lib/sd-compute'

interface SDTableProps {
  skus: SkuSdResult[]
  weeks: WeekInfo[]
  currentWk: string
}

function fmt(n: number): string {
  if (n === 0) return '0'
  if (n < 0) return `(${Math.abs(n).toLocaleString()})`
  return n.toLocaleString()
}

function fmtRm(n: number): string {
  return n > 0 ? n.toLocaleString() : '—'
}

export default function SDTable({ skus, weeks, currentWk }: SDTableProps) {
  const [selectedSku, setSelectedSku] = useState(skus[0]?.sku.sku || '')
  const [search, setSearch] = useState('')

  // Sort by description A-Z
  const sortedSkus = useMemo(() =>
    [...skus].sort((a, b) =>
      (a.sku.description || '').localeCompare(b.sku.description || '')
    ), [skus])

  // Filter by search (partial match on SKU code or description)
  const filteredSkus = useMemo(() =>
    search.trim() === ''
      ? sortedSkus
      : sortedSkus.filter(s =>
          s.sku.sku.toLowerCase().includes(search.toLowerCase()) ||
          (s.sku.description || '').toLowerCase().includes(search.toLowerCase())
        ), [sortedSkus, search])

  const current = skus.find(s => s.sku.sku === selectedSku) || skus[0]
  if (!current) return null

  // Group weeks by month for header
  const monthSpans: { label: string; count: number; startIdx: number }[] = []
  let curMon = ''; let curStart = 0; let curCount = 0
  weeks.forEach((w, i) => {
    if (w.monthLabel !== curMon) {
      if (curMon) monthSpans.push({ label: curMon, count: curCount, startIdx: curStart })
      curMon = w.monthLabel; curStart = i; curCount = 1
    } else { curCount++ }
  })
  if (curMon) monthSpans.push({ label: curMon, count: curCount, startIdx: curStart })

  const flag = FLAG_DISPLAY[current.flag]

  return (
    <div className="flex flex-col gap-3">
      {/* SKU selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium text-[#344054]">Select SKU</span>

        {/* Search input */}
        <input
          type="text"
          placeholder="Search SKU or description..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="text-sm px-3 py-1.5 border border-[#D0D5DD] rounded-lg bg-white text-[#101828] focus:outline-none focus:ring-2 focus:ring-[#048A81] w-56"
        />

        {/* Dropdown */}
        <select
          value={selectedSku}
          onChange={e => setSelectedSku(e.target.value)}
          className="text-sm px-3 py-1.5 border border-[#D0D5DD] rounded-lg bg-white text-[#101828] focus:outline-none focus:ring-2 focus:ring-[#048A81] min-w-64"
        >
          {filteredSkus.length === 0 && (
            <option disabled>No results</option>
          )}
          {filteredSkus.map(s => (
            <option key={s.sku.sku} value={s.sku.sku}>
              {s.sku.sku} — {(s.sku.description || '').slice(0, 45)}
            </option>
          ))}
        </select>

        <span className="text-xs text-[#667085] bg-[#F2F4F7] px-2.5 py-1 rounded-full">
          {current.sku.uom || 'Unit'} · MOQ {(current.sku.moq || 0).toLocaleString()} · LT {current.sku.leadTimeWk || 0} wks
        </span>
        <span className="ml-auto text-sm font-semibold" style={{ color: flag.color }}>
          {flag.emoji} {flag.label}
        </span>
        <span className="text-sm text-[#667085]">WoC: <b>{current.weeksOfCover}</b> wks</span>
      </div>

      {/* Table */}
      <div className="border border-[#EAECF0] rounded-xl overflow-hidden overflow-x-auto">
        <table className="text-xs border-collapse" style={{ minWidth: `${100 + weeks.length * 70}px` }}>
          <thead>
            {/* Month row */}
            <tr>
              <th className="bg-[#F9FAFB] border-b border-r border-[#EAECF0] px-3 py-2 text-left text-[#667085] font-medium w-28 sticky left-0 z-10">Row</th>
              {monthSpans.map(span => (
                <th
                  key={span.label}
                  colSpan={span.count}
                  className="bg-[#048A81] text-white text-center px-2 py-1.5 font-semibold border-r border-white/20 text-xs tracking-wide"
                >
                  {span.label}
                </th>
              ))}
            </tr>
            {/* Week row */}
            <tr>
              <th className="bg-[#F9FAFB] border-b border-r border-[#EAECF0] px-3 py-2 sticky left-0 z-10"></th>
              {weeks.map(w => (
                <th
                  key={w.label}
                  className={clsx(
                    'text-center px-2 py-1.5 font-semibold text-xs border-b border-r border-[#EAECF0] min-w-[68px]',
                    w.label === currentWk
                      ? 'bg-[#FEF3C7] text-[#92400E]'
                      : 'bg-[#2E4057] text-white'
                  )}
                >
                  <div>{w.label}</div>
                  <div className="font-normal text-[10px] opacity-70">{w.mondayDate.slice(5)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <SDRow label="Forecast RM'000" values={current.weeks.map(w => fmtRm(w.forecastRm))} weeks={weeks} currentWk={currentWk} rowStyle="fcast" />
            <SDRow label="Forecast Qty" values={current.weeks.map(w => fmt(w.forecastQty))} weeks={weeks} currentWk={currentWk} rowStyle="qty" />
            <SDRow label="Supply (Commit)" values={current.weeks.map(w => fmt(w.supplyCommit))} weeks={weeks} currentWk={currentWk} rowStyle="commit" />
            <SDRow label="Supply (Uncommit)" values={current.weeks.map(w => fmt(w.supplyUncommit))} weeks={weeks} currentWk={currentWk} rowStyle="uncommit" />
            <SDRow label="Balance" values={current.weeks.map(w => fmt(w.balance))} weeks={weeks} currentWk={currentWk} rowStyle="balance" balanceValues={current.weeks.map(w => w.balance)} />
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-[10px] text-[#667085]">
        {[
          { color: '#1A2535', label: 'Balance' },
          { color: '#1849A9', label: 'Supply commit' },
          { color: '#B42318', label: 'Negative balance' },
          { color: '#FEC84B', label: 'Current week', opacity: '0.7' },
        ].map(l => (
          <span key={l.label} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: l.color, opacity: l.opacity }}></span>
            {l.label}
          </span>
        ))}
      </div>
    </div>
  )
}

type RowStyle = 'fcast' | 'qty' | 'commit' | 'uncommit' | 'balance'

function SDRow({ label, values, weeks, currentWk, rowStyle, balanceValues }: {
  label: string
  values: string[]
  weeks: WeekInfo[]
  currentWk: string
  rowStyle: RowStyle
  balanceValues?: number[]
}) {
  const rowBg: Record<RowStyle, string> = {
    fcast:    'bg-[#F5F5F5]',
    qty:      'bg-[#F0FAF0]',
    commit:   'bg-[#EFF6FF]',
    uncommit: 'bg-[#FFF7ED]',
    balance:  'bg-[#1A2535]',
  }
  const labelColor: Record<RowStyle, string> = {
    fcast:    'text-[#667085]',
    qty:      'text-[#667085]',
    commit:   'text-[#667085]',
    uncommit: 'text-[#667085]',
    balance:  'text-[#9DB4CC]',
  }
  const cellColor: Record<RowStyle, string> = {
    fcast:    'text-[#344054]',
    qty:      'text-[#344054]',
    commit:   'text-[#1849A9] font-medium',
    uncommit: 'text-[#B45309]',
    balance:  'text-white font-semibold',
  }

  return (
    <tr>
      <td className={clsx('px-3 py-1.5 font-medium text-xs border-b border-r border-[#EAECF0] sticky left-0 z-10 w-28', rowBg[rowStyle], labelColor[rowStyle])}>
        {label}
      </td>
      {weeks.map((w, i) => {
        const isCurrent = w.label === currentWk
        const isNeg = rowStyle === 'balance' && balanceValues && balanceValues[i] < 0
        return (
          <td
            key={w.label}
            className={clsx(
              'text-center px-1.5 py-1.5 border-b border-r border-[#EAECF0] text-xs tabular-nums',
              rowBg[rowStyle],
              cellColor[rowStyle],
              isCurrent && rowStyle !== 'balance' && 'bg-[#FFFBEB]',
              isCurrent && rowStyle === 'balance' && 'bg-[#2E3D50]',
              isNeg && '!text-[#FDA29B]'
            )}
          >
            {values[i]}
          </td>
        )
      })}
    </tr>
  )
}
