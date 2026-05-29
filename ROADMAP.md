# CTG PLM — Roadmap

Build priority: **PLM BOM → PO Trigger → Compliance → ECO**
Built phase by phase. Each phase ships to `ctg-sd-portal.vercel.app/plm`.

---

## Phase 1 — BOM Core  ✅ LIVE

- Multi-level BOM viewer (L0–L4), indented tree
- Cost rollup: FG MOQ drives child-component price-tier auto-selection
- Cost breakdown: material / inbound freight / SST / MVA / total landed
- Supplier GM estimation (OEM charge vs material rollup)
- Per-component document attachment (basic)
- S&D integration: `parts` ↔ `master_sku`, project link (`PROJ_CTG005`)
- Sidebar nav inside S&D portal + "Back to Portal"
- UI standardised to S&D design system

---

## Phase 2 — Multi-MPN + Tabbed Part Detail  ◀ NEXT

The architectural upgrade. One internal part, multiple Manufacturer Parts (MPNs).

- **Item ↔ MPN model**: internal PN keeps one title block; multiple MPNs hang off it via the AML
- Per-MPN attributes: manufacturer PN, drawing, spec sheet, price tiers, MOQ, lead time, status (Active / Alternate / Qualifying / Obsolete), preferred flag
- Per-MPN document attachments (drawing_A vs drawing_B)
- New table: `manufacturer_parts`; `plm_documents` gains optional `mpn_id`
- BOM references internal PN only — stays stable across supplier swaps
- **Tabbed part-detail layout**: Title Block · BOM · Cost Rollup · Suppliers (AML) · Where Used · Documents
- **Where Used** — reverse lookup: "which FGs use this component?"

---

## Phase 3 — PO Trigger  (separate scoping chat)

- BOM explosion: forecast qty x BOM = component requirements per period
- MOQ netting + preferred-MPN selection
- Hand off component requirements to S&D purchase flow (PR / PO)
- Boundary TBD: PLM owns explosion + AML; PO document lives in S&D

---

## Phase 4 — Compliance

- NPD deliverables: test reports, spec sheets, patented logo artwork, halal/GMP certs
- Attach at part level and MPN level
- Cert expiry tracking + alerts (flag before lapse)

---

## Phase 5 — ECO / Change Control

- Engineering Change Orders: who / what / when / why
- Approval chain (SC -> QA -> approver)
- Revision control + rollback; approved ECO can increment revision

---

_Last updated: 2026-05-29 · Phase 1 live, Phase 2 next._
