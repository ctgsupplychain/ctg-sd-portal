'use client'
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import type { ComponentMrpResult } from '@/lib/bom-mrp'
import type { WeekInfo } from '@/lib/sd-compute'

interface ComponentSDProps {
  results: ComponentMrpResult[]
  weeks: WeekInfo[]
  currentWk: string
  fgSku: string
  fgDescription: string
}

const CAT_COLORS: Record<string, string> = {
  RM: 'bg-orange-50 text-orange-700 border-orange-200',
  PK: 'bg-blue-50 text-blue-700 border-blue-200',
  SA: 'bg-purple-50 text-purple-700 border-purple-200',
  WIP: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  FG: 'bg-green-50 text-green-700 border-green-200',
}

const FLAG_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  OVERDUE: { bg: 'bg-red-600',    text: 'text-white',         label: 'OVERDUE' },
  URGENT:  { bg: 'bg-orange-500', text: 'text-white',         label: 'URGENT'  },
  PLAN:    { bg: 'bg-yellow-400', text: 'text-yellow-900',    label: 'PLAN PO' },
  OK:      { bg: 'bg-green-100',  text: 'text-green-800',     label: 'OK'      },
}

function fmt(n: number): string {
  if (n === 0) return '—'
  return n.toLocaleString()
}

export default function ComponentSD({ results, weeks, currentWk, fgSku, fgDescription }: ComponentSDProps) {
  const [view, setView] = useState<'gross' | 'net' | 'po'>('gross')
  const [collapsed, setCollapsed] = useState(false)

  // Month spans for header
  const monthSpans = useMemo(() => {
    const spans: { label: string; count: number }[] = []
    let cur = ''
    let count = 0
    weeks.forEach(w => {
      if (w.monthLabel !== cur) {
        if (cur) spans.push({ label: cur, count })
        cur = w.monthLabel; count = 1
      } else count++
    })
    if (cur) spans.push({ label: cur, count })
    return spans
  }, [weeks])

  if (results.length === 0) return (
    <div className="bg-white rounded-xl border border-[#EAECF0] p-5 mt-4">
      <p className="text-sm text-[#98A2B3]">No BOM components found for {fgSku}. Add BOM lines in PLM to enable MRP.</p>
    </div>
  )

  // Summary bar counts
  const overdueCount  = results.filter(r => r.earliestPoReleaseFlag === 'OVERDUE').length
  const urgentCount   = results.filter(r => r.earliestPoReleaseFlag === 'URGENT').length
  const planCount     = results.filter(r => r.earliestPoReleaseFlag === 'PLAN').length
  const missingLtCount = results.filter(r => r.component.leadTimeWk == null).length

  return (
    <div className="bg-white rounded-xl border border-[#EAECF0] mt-4 overflow-hidden">

      {/* ── Header bar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#EAECF0] bg-[#F9FAFB]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCollapsed(c => !c)}
            className="text-[#667085] hover:text-[#344054] transition-colors"
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d={collapsed ? 'M4 6l4 4 4-4' : 'M4 10l4-4 4 4'}
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
              />
            </svg>
          </button>
          <span className="text-sm font-semibold text-[#101828]">BOM Component Orders</span>
          <span className="text-xs text-[#667085]">{fgSku} — {fgDescription}</span>
          <span className="text-xs bg-[#F2F4F7] text-[#344054] px-2 py-0.5 rounded-full border border-[#EAECF0]">
            {results.length} components
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Alert chips */}
          {overdueCount > 0 && (
            <span className="text-xs font-medium bg-red-600 text-white px-2 py-0.5 rounded-full">
              {overdueCount} Overdue
            </span>
          )}
          {urgentCount > 0 && (
            <span className="text-xs font-medium bg-orange-500 text-white px-2 py-0.5 rounded-full">
              {urgentCount} Urgent
            </span>
          )}
          {planCount > 0 && (
            <span className="text-xs font-medium bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded-full">
              {planCount} Plan PO
            </span>
          )}
          {missingLtCount > 0 && (
            <span className="text-xs font-medium bg-[#F2F4F7] text-[#667085] px-2 py-0.5 rounded-full border border-[#EAECF0]">
              {missingLtCount} missing LT
            </span>
          )}

          {/* View toggle */}
          <div className="flex items-center border border-[#EAECF0] rounded-lg overflow-hidden ml-2">
            {(['gross', 'net', 'po'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={clsx(
                  'px-3 py-1 text-xs font-medium transition-colors',
                  view === v
                    ? 'bg-[#101828] text-white'
                    : 'bg-white text-[#667085] hover:bg-[#F9FAFB]'
                )}
              >
                {v === 'gross' ? 'Gross Req' : v === 'net' ? 'Net Req' : 'Planned PO'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!collapsed && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              {/* Month grouping row */}
              <tr className="bg-[#F9FAFB]">
                <th className="sticky left-0 z-10 bg-[#F9FAFB] border-b border-r border-[#EAECF0] px-3 py-2 text-left text-[10px] font-semibold text-[#667085] uppercase tracking-wide min-w-[220px]">
                  Component
                </th>
                <th className="border-b border-r border-[#EAECF0] px-2 py-2 text-center text-[10px] font-semibold text-[#667085] whitespace-nowrap min-w-[60px]">
                  Qty/FG
                </th>
                <th className="border-b border-r border-[#EAECF0] px-2 py-2 text-center text-[10px] font-semibold text-[#667085] whitespace-nowrap min-w-[50px]">
                  LT(wk)
                </th>
                <th className="border-b border-r border-[#EAECF0] px-2 py-2 text-center text-[10px] font-semibold text-[#667085] whitespace-nowrap min-w-[50px]">
                  MOQ
                </th>
                <th className="border-b border-r border-[#EAECF0] px-2 py-2 text-center text-[10px] font-semibold text-[#667085] whitespace-nowrap min-w-[50px]">
                  SPQ
                </th>
                <th className="border-b border-r border-[#EAECF0] px-2 py-2 text-center text-[10px] font-semibold text-[#667085] whitespace-nowrap min-w-[60px]">
                  On Hand
                </th>
                {monthSpans.map(span => (
                  <th
                    key={span.label}
                    colSpan={span.count}
                    className="border-b border-r border-[#EAECF0] px-2 py-2 text-center text-[10px] font-semibold text-[#667085] uppercase tracking-wide"
                  >
                    {span.label}
                  </th>
                ))}
                <th className="border-b border-[#EAECF0] px-2 py-2 text-center text-[10px] font-semibold text-[#667085] whitespace-nowrap min-w-[100px]">
                  PO Release Wk
                </th>
              </tr>
              {/* Week label row */}
              <tr className="bg-[#F9FAFB]">
                <th className="sticky left-0 z-10 bg-[#F9FAFB] border-b border-r border-[#EAECF0]" />
                <th className="border-b border-r border-[#EAECF0]" />
                <th className="border-b border-r border-[#EAECF0]" />
                <th className="border-b border-r border-[#EAECF0]" />
                <th className="border-b border-r border-[#EAECF0]" />
                <th className="border-b border-r border-[#EAECF0]" />
                {weeks.map(w => (
                  <th
                    key={w.label}
                    className={clsx(
                      'border-b border-r border-[#EAECF0] px-1 py-1 text-center text-[10px] font-medium whitespace-nowrap min-w-[48px]',
                      w.label === currentWk ? 'text-[#6941C6] font-bold' : 'text-[#98A2B3]'
                    )}
                  >
                    {w.label.replace(/^WK/, 'W')}
                  </th>
                ))}
                <th className="border-b border-[#EAECF0]" />
              </tr>
            </thead>
            <tbody>
              {results.map((r, idx) => {
                const comp = r.component
                const catStyle = CAT_COLORS[comp.category] || 'bg-gray-50 text-gray-600 border-gray-200'
                const flagStyle = r.earliestPoReleaseFlag ? FLAG_STYLES[r.earliestPoReleaseFlag] : null
                const missingLt = comp.leadTimeWk == null
                const missingMoq = comp.moq == null

                return (
                  <tr
                    key={comp.partNumber}
                    className={clsx(
                      'border-b border-[#EAECF0] hover:bg-[#F9FAFB] transition-colors',
                      idx % 2 === 0 ? 'bg-white' : 'bg-[#FAFAFA]'
                    )}
                  >
                    {/* Component info cell */}
                    <td className="sticky left-0 z-10 bg-inherit border-r border-[#EAECF0] px-3 py-2.5">
                      <div className="flex items-start gap-2">
                        <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0 mt-0.5', catStyle)}>
                          {comp.category}
                        </span>
                        <div>
                          <div className="font-mono text-[11px] text-[#344054] font-medium">{comp.partNumber}</div>
                          <div className="text-[11px] text-[#667085] leading-tight mt-0.5">{comp.description}</div>
                          {comp.supplier && (
                            <div className="text-[10px] text-[#98A2B3] mt-0.5">{comp.supplier}</div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Qty/FG */}
                    <td className="border-r border-[#EAECF0] px-2 py-2.5 text-center text-[#344054] font-medium tabular-nums">
                      {r.extendedQtyPerFg % 1 === 0 ? r.extendedQtyPerFg : r.extendedQtyPerFg.toFixed(2)}
                    </td>

                    {/* Lead time */}
                    <td className={clsx(
                      'border-r border-[#EAECF0] px-2 py-2.5 text-center tabular-nums',
                      missingLt ? 'text-orange-500 font-medium' : 'text-[#344054]'
                    )}>
                      {missingLt ? '—' : comp.leadTimeWk}
                    </td>

                    {/* MOQ */}
                    <td className={clsx(
                      'border-r border-[#EAECF0] px-2 py-2.5 text-center tabular-nums',
                      missingMoq ? 'text-orange-500 font-medium' : 'text-[#344054]'
                    )}>
                      {comp.moq != null ? comp.moq.toLocaleString() : '—'}
                    </td>

                    {/* SPQ */}
                    <td className="border-r border-[#EAECF0] px-2 py-2.5 text-center text-[#667085] tabular-nums">
                      {comp.spq != null && comp.spq !== comp.moq ? comp.spq.toLocaleString() : '—'}
                    </td>

                    {/* On Hand */}
                    <td className="border-r border-[#EAECF0] px-2 py-2.5 text-center text-[#344054] tabular-nums">
                      {comp.onHandQty > 0 ? comp.onHandQty.toLocaleString() : '—'}
                    </td>

                    {/* Weekly cells */}
                    {r.weeks.map(wkRow => {
                      const value = view === 'gross'
                        ? wkRow.grossReq
                        : view === 'net'
                        ? wkRow.netReq
                        : wkRow.plannedOrderQty

                      const isCurrentWk = wkRow.wkLabel === currentWk
                      const hasPoRelease = view === 'po' && wkRow.poReleaseWk === wkRow.wkLabel
                      const poFlag = wkRow.poReleaseFlag

                      return (
                        <td
                          key={wkRow.wkLabel}
                          title={
                            view === 'po' && wkRow.plannedOrderQty > 0
                              ? `Release PO by ${wkRow.poReleaseWk ?? '?'} · ${wkRow.poReleaseFlag ?? ''}`
                              : undefined
                          }
                          className={clsx(
                            'border-r border-[#EAECF0] px-1 py-2.5 text-center tabular-nums text-[11px]',
                            isCurrentWk && 'border-l-2 border-l-[#6941C6]',
                            value === 0
                              ? 'text-[#D0D5DD]'
                              : view === 'po' && poFlag === 'OVERDUE'
                              ? 'bg-red-50 text-red-700 font-semibold'
                              : view === 'po' && poFlag === 'URGENT'
                              ? 'bg-orange-50 text-orange-700 font-semibold'
                              : view === 'po' && poFlag === 'PLAN'
                              ? 'bg-yellow-50 text-yellow-700'
                              : 'text-[#344054]'
                          )}
                        >
                          {value > 0 ? value.toLocaleString() : '—'}
                        </td>
                      )
                    })}

                    {/* Earliest PO Release */}
                    <td className="px-2 py-2.5 text-center">
                      {missingLt ? (
                        <span className="text-[10px] text-orange-500 font-medium">Set LT</span>
                      ) : flagStyle ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full', flagStyle.bg, flagStyle.text)}>
                            {flagStyle.label}
                          </span>
                          {r.earliestPoReleaseWk && (
                            <span className="text-[10px] text-[#98A2B3]">{r.earliestPoReleaseWk}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[#D0D5DD] text-[10px]">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      {!collapsed && (
        <div className="px-5 py-2.5 border-t border-[#EAECF0] bg-[#F9FAFB] flex items-center gap-4 text-[10px] text-[#667085]">
          <span className="font-medium">View:</span>
          <span><strong>Gross Req</strong> = FG demand × qty/FG</span>
          <span><strong>Net Req</strong> = Gross − on-hand (rolling)</span>
          <span><strong>Planned PO</strong> = Net req rounded to MOQ multiple</span>
          <span className="ml-auto">PO Release = demand week − lead time</span>
        </div>
      )}
    </div>
  )
}
