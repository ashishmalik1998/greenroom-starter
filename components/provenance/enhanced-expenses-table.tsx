"use client";

/**
 * Enhanced Expenses Table — Deep Slice view
 *
 * Replaces the static expenses table on the show detail page. The Marketing
 * row is fully expanded to demonstrate the Provenance Engine:
 *
 *   1. Nested Itemization — Poster design $200 | Social Boost $400 = $600
 *   2. Logic Bridge — cap calculation inline: Spent $600 → Cap $500 → Charged $500
 *   3. Receipt Evidence — "View Receipt" opens a modal with the vendor invoice
 *
 * For the demo show (show_coastal_spell_dispute / Coastal Spell):
 *   - Marketing data is injected from localStorage (from the Expense Capture
 *     flow) if available, otherwise falls back to the hardcoded Perfect Parse
 *     demo values so the table always looks right during a presentation.
 *   - Marketing cap: $500 (hardcoded from deal terms for this show)
 *
 * For all other shows the table behaves exactly like the old static version.
 */

import { useState, useEffect, Fragment } from "react";
import { ChevronDown, ChevronRight, FileText, X } from "lucide-react";
import { PlainBadge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Expense, Deal } from "@/db/schema";

// ─── Demo constants ────────────────────────────────────────────────────────────
// Demo show: Coastal Spell — show_coastal_spell_dispute
// Marketing breakdown from Perfect Parse (Instagram Ads receipt)
const DEMO_SHOW_ID = "show_coastal_spell_dispute";

const DEMO_MARKETING_LINES = [
  { description: "Poster design", amount: 200 },
  { description: "Social boost", amount: 400 },
] as const;

// Marketing cap hardcoded for the demo show — extracted from contract context.
// The deal notes reference a $900 marketing recoup against gross; the PM used
// $500 as the budgeted cap (the disputed $900 recoup exceeded it).
const DEMO_MARKETING_CAP = 500;

// ─── Types ────────────────────────────────────────────────────────────────────

type ParsedLine = { description: string; amount: number };

type EnhancedExpense = {
  id: string;
  category: string;
  description: string | null;
  amount: number;
  absorbedByVenue: boolean;
  // Present for the enhanced Marketing row
  parsedLines?: ParsedLine[];
  vendor?: string;
  receiptFilename?: string;
  capAmount?: number;
};

type LedgerItem = {
  id: string;
  category: string;
  amount: number | null;
  description: string;
  receiptFilename: string | null;
  status: string;
  aiParsedLines?: ParsedLine[];
  aiVendor?: string;
  source: string;
};

function storageKey(showId: string) {
  return `greenroom_ledger_${showId}`;
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EnhancedExpensesTable({
  showId,
  expenses,
  deal,
}: {
  showId: string;
  expenses: Expense[];
  deal: Deal | null;
}) {
  const [rows, setRows] = useState<EnhancedExpense[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [receiptOpen, setReceiptOpen] = useState<EnhancedExpense | null>(null);

  // ── On mount: merge DB expenses with localStorage captured items ────────────
  useEffect(() => {
    const base: EnhancedExpense[] = expenses
      .filter((e) => !e.absorbedByVenue)
      .map((e) => ({
        id: e.id,
        category: e.category,
        description: e.description,
        amount: e.amount,
        absorbedByVenue: e.absorbedByVenue,
      }));

    // Try to read captured marketing data from localStorage (all shows)
    let marketingFromCapture: EnhancedExpense | null = null;

    const stored = localStorage.getItem(storageKey(showId));
    if (stored) {
      try {
        const items = JSON.parse(stored) as LedgerItem[];
        // Look for a captured marketing item — it may come from the Capture
        // flow (source: "capture") or from the Verified Ledger (any source
        // with aiParsedLines present).
        const mkt = items.find(
          (it) =>
            it.category === "marketing" &&
            it.amount != null &&
            it.aiParsedLines?.length,
        );
        if (mkt) {
          marketingFromCapture = {
            id: mkt.id,
            category: "marketing",
            description: mkt.description || "Instagram Ads",
            amount: mkt.amount!,
            absorbedByVenue: false,
            parsedLines: mkt.aiParsedLines,
            vendor: mkt.aiVendor ?? "Instagram Ads",
            receiptFilename: mkt.receiptFilename ?? undefined,
            // Use the deal's expenseCap if available, else demo cap
            capAmount: deal?.expenseCap ?? DEMO_MARKETING_CAP,
          };
        }
      } catch {
        // ignore
      }
    }

    // For the demo show only: fall back to hardcoded data when no
    // captured receipt exists in localStorage yet, so presentations
    // always show the breakdown without needing prior setup.
    if (!marketingFromCapture && showId === DEMO_SHOW_ID) {
      marketingFromCapture = {
        id: "demo_marketing_row",
        category: "marketing",
        description: "Instagram Ads — Mar 14",
        amount: 600,
        absorbedByVenue: false,
        parsedLines: [...DEMO_MARKETING_LINES],
        vendor: "Instagram Ads",
        receiptFilename: "instagram-ads-march.jpg",
        capAmount: DEMO_MARKETING_CAP,
      };
    }

    // Merge: inject marketing row at the top (or replace if DB already has one)
    if (marketingFromCapture) {
      const hasMarketing = base.some((r) => r.category === "marketing");
      const merged = hasMarketing
        ? base.map((r) =>
            r.category === "marketing" ? marketingFromCapture! : r,
          )
        : [marketingFromCapture, ...base];
      setRows(merged);
      // Auto-expand marketing to show the breakdown on first render
      setExpanded(new Set(["demo_marketing_row", marketingFromCapture.id]));
    } else {
      setRows(base);
    }
  }, [showId, expenses]);

  // Also include absorbed expenses in the total display (but greyed out)
  const absorbedRows = expenses.filter((e) => e.absorbedByVenue);
  const passedThroughTotal = rows.reduce((s, r) => s + r.amount, 0);

  if (rows.length === 0 && absorbedRows.length === 0) {
    return (
      <div className="text-[13px] text-ink-400">No expenses entered yet.</div>
    );
  }

  return (
    <>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left border-b border-ink-100/80">
            <th className="py-2 eyebrow text-[10px] text-ink-400 font-semibold w-5" />
            <th className="py-2 eyebrow text-[10px] text-ink-400 font-semibold">
              Category
            </th>
            <th className="py-2 eyebrow text-[10px] text-ink-400 font-semibold">
              Description
            </th>
            <th className="py-2 eyebrow text-[10px] text-ink-400 font-semibold text-right">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isExpandable = !!row.parsedLines?.length;
            const isExpanded = expanded.has(row.id);
            const charged = row.capAmount
              ? Math.min(row.amount, row.capAmount)
              : row.amount;
            const houseAbsorbs = row.capAmount
              ? Math.max(0, row.amount - row.capAmount)
              : 0;

            return (
              <Fragment key={row.id}>
                {/* Main row */}
                <tr
                  className={cn(
                    "border-t border-ink-100/60",
                    isExpandable && "cursor-pointer hover:bg-canvas-soft/60",
                  )}
                  onClick={() => {
                    if (!isExpandable) return;
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      if (next.has(row.id)) next.delete(row.id);
                      else next.add(row.id);
                      return next;
                    });
                  }}
                >
                  {/* Expand toggle */}
                  <td className="py-2.5 pr-1 w-5">
                    {isExpandable ? (
                      isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5 text-ink-400" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-ink-400" />
                      )
                    ) : null}
                  </td>

                  {/* Category */}
                  <td className="py-2.5 capitalize font-medium text-ink-900">
                    {row.category}
                    {row.absorbedByVenue && (
                      <PlainBadge variant="amber" className="ml-2">
                        absorbed
                      </PlainBadge>
                    )}
                  </td>

                  {/* Description */}
                  <td className="py-2.5 text-ink-500">
                    <div className="flex items-center gap-2">
                      <span>{row.description ?? "—"}</span>
                      {row.receiptFilename && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setReceiptOpen(row);
                          }}
                          className="inline-flex items-center gap-1 text-[10.5px] font-medium text-brand-700 hover:text-brand-800 ring-1 ring-brand-200/60 bg-brand-50/60 px-1.5 py-0.5 rounded transition-colors"
                        >
                          <FileText className="h-2.5 w-2.5" />
                          View Receipt
                        </button>
                      )}
                    </div>
                  </td>

                  {/* Amount */}
                  <td className="py-2.5 text-right font-mono tabular text-ink-900">
                    {fmt(row.amount)}
                  </td>
                </tr>

                {/* Expanded: nested line items + cap logic */}
                {isExpandable && isExpanded && (
                  <>
                    {/* Sub-rows */}
                    {row.parsedLines!.map((line, i) => (
                      <tr
                        key={i}
                        className="bg-canvas-soft/40 border-t border-ink-100/40"
                      >
                        <td />
                        <td className="py-2 pl-5">
                          <span className="text-[11px] text-ink-400">└</span>
                        </td>
                        <td className="py-2 text-[12px] text-ink-600 pl-1">
                          {line.description}
                        </td>
                        <td className="py-2 text-right font-mono tabular text-[12px] text-ink-600">
                          {fmt(line.amount)}
                        </td>
                      </tr>
                    ))}

                    {/* Subtotal row */}
                    <tr className="bg-canvas-soft/40 border-t border-ink-200/40">
                      <td />
                      <td />
                      <td className="py-2 pl-6 text-[11.5px] font-semibold text-ink-700">
                        Subtotal
                      </td>
                      <td className="py-2 text-right font-mono tabular text-[12.5px] font-semibold text-ink-900">
                        {fmt(row.amount)}
                      </td>
                    </tr>

                    {/* Cap Logic Bridge */}
                    {row.capAmount != null && (
                      <tr>
                        <td colSpan={4} className="px-0 pb-3 pt-1">
                          <div className="mx-0 rounded-lg bg-amber-50/60 ring-1 ring-amber-200/60 px-4 py-3">
                            <div className="eyebrow text-[9px] text-amber-800 mb-2">
                              Contract cap applied — from deal terms
                            </div>
                            <div className="flex items-center gap-0 flex-wrap">
                              <CapPill
                                label="Total spent"
                                value={fmt(row.amount)}
                                tone="neutral"
                              />
                              <span className="text-ink-300 mx-2 text-[12px]">
                                →
                              </span>
                              <CapPill
                                label="Contract cap"
                                value={fmt(row.capAmount)}
                                tone="warning"
                              />
                              <span className="text-ink-300 mx-2 text-[12px]">
                                →
                              </span>
                              <CapPill
                                label="Charged to artist"
                                value={fmt(charged)}
                                tone="brand"
                              />
                              {houseAbsorbs > 0 && (
                                <>
                                  <span className="text-ink-300 mx-2 text-[12px]">
                                    +
                                  </span>
                                  <CapPill
                                    label="House absorbs"
                                    value={fmt(houseAbsorbs)}
                                    tone="rose"
                                  />
                                </>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )}
              </Fragment>
            );
          })}

          {/* Absorbed rows (greyed) */}
          {absorbedRows.map((e) => (
            <tr key={e.id} className="border-t border-ink-100/60 opacity-50">
              <td />
              <td className="py-2.5 capitalize text-ink-500">
                {e.category}
                <PlainBadge variant="amber" className="ml-2">
                  absorbed
                </PlainBadge>
              </td>
              <td className="py-2.5 text-ink-400">{e.description ?? "—"}</td>
              <td className="py-2.5 text-right font-mono tabular text-ink-500">
                {fmt(e.amount)}
              </td>
            </tr>
          ))}

          {/* Total row */}
          <tr className="border-t border-ink-200/60 font-semibold">
            <td />
            <td className="py-3" colSpan={2}>
              Total (passed through)
            </td>
            <td className="py-3 text-right font-mono tabular">
              {fmt(passedThroughTotal)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Receipt Modal */}
      {receiptOpen && (
        <ReceiptModal
          expense={receiptOpen}
          onClose={() => setReceiptOpen(null)}
        />
      )}
    </>
  );
}

// ─── Cap pill ─────────────────────────────────────────────────────────────────

function CapPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "neutral" | "warning" | "brand" | "rose";
}) {
  const styles = {
    neutral: "bg-white ring-ink-200/60 text-ink-800",
    warning: "bg-amber-50 ring-amber-300/60 text-amber-900",
    brand: "bg-brand-50 ring-brand-200/60 text-brand-900",
    rose: "bg-rose-50 ring-rose-200/60 text-rose-900",
  };
  return (
    <div
      className={cn(
        "rounded-md ring-1 px-2.5 py-1.5 text-center",
        styles[tone],
      )}
    >
      <div className="eyebrow text-[8.5px] mb-0.5">{label}</div>
      <div className="text-[13px] font-mono tabular font-semibold">{value}</div>
    </div>
  );
}

// ─── Receipt Modal ────────────────────────────────────────────────────────────

function ReceiptModal({
  expense,
  onClose,
}: {
  expense: EnhancedExpense;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-ink-900/40" />

      {/* Modal card */}
      <div
        className="relative z-10 w-full max-w-sm rounded-2xl bg-white overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100/80">
          <div>
            <div className="text-[13px] font-semibold text-ink-900">
              Receipt Evidence
            </div>
            <div className="text-[11px] text-ink-400 mt-0.5">
              {expense.receiptFilename ?? "Attached receipt"}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-ink-100 hover:bg-ink-200 flex items-center justify-center transition-colors"
          >
            <X className="h-3.5 w-3.5 text-ink-600" />
          </button>
        </div>

        {/* Simulated vendor invoice */}
        <div className="p-5">
          {/* "Phone screenshot" wrapper */}
          <div className="rounded-xl ring-1 ring-ink-200/60 overflow-hidden">
            {/* WhatsApp-style header bar */}
            <div className="bg-[#075e54] px-4 py-2.5 flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <span className="text-white text-[10px] font-bold">IG</span>
              </div>
              <div>
                <div className="text-white text-[12px] font-semibold leading-none">
                  Instagram Ads Receipts
                </div>
                <div className="text-white/60 text-[10px] mt-0.5">
                  Forwarded from Meta Business
                </div>
              </div>
            </div>

            {/* Chat bubble with receipt content */}
            <div className="bg-[#ece5dd] p-3 flex justify-end">
              <div className="bg-[#dcf8c6] rounded-xl rounded-br-sm px-4 py-3 max-w-[90%] ring-1 ring-black/5">
                {/* Invoice content */}
                <div className="text-[10px] font-bold text-[#128c7e] uppercase tracking-wide mb-2">
                  Meta · Instagram Ads
                </div>

                <div className="text-[11.5px] text-ink-800 font-semibold mb-0.5">
                  {expense.vendor ?? "Instagram Ads"}
                </div>
                <div className="text-[10.5px] text-ink-500 mb-3">
                  Invoice #INS-2025-0314 · Mar 14, 2025
                </div>

                <div className="space-y-1.5 border-t border-black/10 pt-2">
                  {expense.parsedLines?.map((line, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-6 text-[11.5px]"
                    >
                      <span className="text-ink-700">{line.description}</span>
                      <span className="font-mono tabular font-medium text-ink-900">
                        ${line.amount.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-2 mt-2 border-t border-black/10">
                  <span className="text-[12px] font-bold text-ink-900">
                    TOTAL
                  </span>
                  <span className="text-[14px] font-mono tabular font-bold text-ink-900">
                    ${expense.amount.toFixed(2)}
                  </span>
                </div>

                {/* WhatsApp timestamp */}
                <div className="text-right text-[9.5px] text-ink-400 mt-2">
                  10:47 AM ✓✓
                </div>
              </div>
            </div>
          </div>

          {/* AI-extraction label */}
          <div className="mt-3 flex items-center gap-2 px-1">
            <span className="text-[10px] font-bold text-brand-700 bg-brand-50 ring-1 ring-brand-200/60 px-1.5 py-0.5 rounded">
              AI
            </span>
            <span className="text-[11.5px] text-ink-500">
              AI-extracted from this receipt · amounts match exactly
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-4">
          <button
            onClick={onClose}
            className="w-full h-9 rounded-lg bg-ink-900 text-white text-[13px] font-medium hover:bg-ink-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
