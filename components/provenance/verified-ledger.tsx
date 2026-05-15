"use client";

/**
 * Component 1: Verified Expense Ledger
 *
 * Replaces the flat expense total with an itemized, receipt-linked ledger.
 * Each line item tracks its receipt and verification status. AI extraction
 * is simulated: when a receipt filename is entered, the component waits 1.5s
 * then shows a hardcoded extracted amount with an "AI-extracted · confirm to
 * apply" badge.
 *
 * Cap logic: reads expenseCap and hospitalityCap from the deal and shows live
 * running totals, split between "Artist share" (within cap) and "House
 * absorbs" (overage).
 *
 * State is persisted in localStorage keyed by showId so that pre-captured
 * receipts from Component 3 (ExpenseCapture) appear here automatically.
 */

import { useState, useEffect, useCallback } from "react";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Upload,
  Check,
  X,
  Loader2,
  FileText,
  Eye,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Expense, Deal } from "@/db/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ParsedLine = { description: string; amount: number };

export type LedgerLineItem = {
  id: string;
  category: ExpenseCategory;
  description: string;
  amount: number | null;
  receiptFilename: string | null;
  status: "unverified" | "extracted" | "verified";
  aiExtractedAmount: number | null;
  /** Present when AI returned itemized line items from the receipt. */
  aiParsedLines?: ParsedLine[];
  /** Vendor name extracted by AI. */
  aiVendor?: string;
  source: "db" | "capture" | "manual";
};

type ExpenseCategory =
  | "marketing"
  | "hospitality"
  | "sound"
  | "lights"
  | "production"
  | "security"
  | "backline";

// ─── Simulated AI extraction amounts (hardcoded for demo) ────────────────────
// These values are shown after a 1.5s "scanning" delay when a receipt
// filename is entered. Labeled clearly as AI-extracted in the UI.
const AI_EXTRACTED_AMOUNTS: Record<ExpenseCategory, number> = {
  marketing: 600, // overridden by MARKETING_PERFECT_PARSE below
  hospitality: 145,
  sound: 125,
  lights: 80,
  production: 195,
  security: 300,
  backline: 75,
};

// ─── Perfect Parse: hardcoded for the Marketing category demo ────────────────
// When any receipt is uploaded against a Marketing line item, bypass the
// generic single-amount extraction and return this structured JSON object
// instead. This makes the demo show a "Perfect Parse" — vendor + itemized
// line items that sum to the total — so the settlement logic demo can focus
// on the number tracing rather than the OCR plumbing.
//
// Trigger: category === "marketing" (any filename)
// Vendor: Instagram Ads | Poster design $200 | Social boost $400 | Total $600
const MARKETING_PERFECT_PARSE = {
  vendor: "Instagram Ads",
  lines: [
    { description: "Poster design", amount: 200 },
    { description: "Social boost", amount: 400 },
  ],
  total: 600,
} as const;

// ─── Category config ──────────────────────────────────────────────────────────

type CategoryConfig = {
  label: string;
  icon: string;
};

const CATEGORIES: Record<ExpenseCategory, CategoryConfig> = {
  marketing: { label: "Marketing", icon: "M" },
  hospitality: { label: "Hospitality", icon: "H" },
  sound: { label: "Sound", icon: "S" },
  lights: { label: "Lights", icon: "L" },
  production: { label: "Production", icon: "P" },
  security: { label: "Security", icon: "Sc" },
  backline: { label: "Backline", icon: "B" },
};

const CATEGORY_ORDER: ExpenseCategory[] = [
  "marketing",
  "hospitality",
  "sound",
  "lights",
  "production",
  "security",
  "backline",
];

function storageKey(showId: string) {
  return `greenroom_ledger_${showId}`;
}

function formatMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

// ─── Map DB expense records to ledger items ───────────────────────────────────

function dbExpenseToItem(e: Expense): LedgerLineItem {
  return {
    id: e.id,
    category: (e.category as ExpenseCategory) in CATEGORIES
      ? (e.category as ExpenseCategory)
      : "production",
    description: e.description ?? e.category,
    amount: e.amount,
    receiptFilename: null,
    status: "verified",
    aiExtractedAmount: null,
    source: "db",
  };
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({
  status,
  isPerfectParse = false,
}: {
  status: LedgerLineItem["status"];
  isPerfectParse?: boolean;
}) {
  if (status === "verified") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200/80">
        <Check className="h-2.5 w-2.5" />
        Verified
      </span>
    );
  }
  if (status === "extracted" && isPerfectParse) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-brand-50 text-brand-800 ring-1 ring-inset ring-brand-200/80">
        <span className="font-bold text-[9px] text-brand-700">AI</span>
        Perfect Parse · confirm to apply
      </span>
    );
  }
  if (status === "extracted") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200/80">
        <span className="font-bold text-[9px]">AI</span>
        AI-extracted · confirm to apply
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-ink-100 text-ink-500 ring-1 ring-inset ring-ink-200/80">
      No receipt
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function VerifiedExpenseLedger({
  showId,
  deal,
  initialExpenses,
}: {
  showId: string;
  deal: Deal;
  initialExpenses: Expense[];
}) {
  const [items, setItems] = useState<LedgerLineItem[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<
    Set<ExpenseCategory>
  >(new Set(["hospitality", "sound"]));
  const [scanningItems, setScanningItems] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);

  // ── Load from localStorage, seeding from DB expenses if fresh ──────────────
  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem(storageKey(showId));
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as LedgerLineItem[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setItems(parsed);
          return;
        }
      } catch {
        // fall through to seed from DB
      }
    }
    // Seed from DB expenses
    const seeded = initialExpenses
      .filter((e) => !e.absorbedByVenue)
      .map(dbExpenseToItem);
    setItems(seeded);
    localStorage.setItem(storageKey(showId), JSON.stringify(seeded));
  }, [showId, initialExpenses]);

  const persist = useCallback(
    (next: LedgerLineItem[]) => {
      setItems(next);
      localStorage.setItem(storageKey(showId), JSON.stringify(next));
    },
    [showId]
  );

  // ── Category helpers ────────────────────────────────────────────────────────

  function toggleCategory(cat: ExpenseCategory) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  function addLineItem(cat: ExpenseCategory) {
    const newItem: LedgerLineItem = {
      id: `item_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      category: cat,
      description: "",
      amount: null,
      receiptFilename: null,
      status: "unverified",
      aiExtractedAmount: null,
      source: "manual",
    };
    persist([...items, newItem]);
    setExpandedCategories((prev) => new Set([...prev, cat]));
  }

  function updateItem(id: string, patch: Partial<LedgerLineItem>) {
    persist(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function removeItem(id: string) {
    persist(items.filter((it) => it.id !== id));
  }

  // ── AI extraction simulation ────────────────────────────────────────────────

  function handleReceiptChange(itemId: string, filename: string) {
    if (!filename) {
      updateItem(itemId, { receiptFilename: null, status: "unverified", aiExtractedAmount: null });
      return;
    }

    updateItem(itemId, { receiptFilename: filename });

    // Simulate 1.5s scanning delay
    setScanningItems((prev) => new Set([...prev, itemId]));
    setTimeout(() => {
      setScanningItems((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
      const item = items.find((it) => it.id === itemId);
      if (!item) return;

      if (item.category === "marketing") {
        // Perfect Parse — return the hardcoded Instagram Ads itemized result
        updateItem(itemId, {
          receiptFilename: filename,
          status: "extracted",
          aiExtractedAmount: MARKETING_PERFECT_PARSE.total,
          amount: MARKETING_PERFECT_PARSE.total,
          aiParsedLines: [...MARKETING_PERFECT_PARSE.lines],
          aiVendor: MARKETING_PERFECT_PARSE.vendor,
        });
      } else {
        const aiAmount = AI_EXTRACTED_AMOUNTS[item.category];
        updateItem(itemId, {
          receiptFilename: filename,
          status: "extracted",
          aiExtractedAmount: aiAmount,
          amount: aiAmount,
        });
      }
    }, 1500);
  }

  function confirmExtraction(itemId: string) {
    updateItem(itemId, { status: "verified" });
  }

  // ── Cap calculations ────────────────────────────────────────────────────────

  const expenseCap = deal.expenseCap;
  const hospitalityCap = deal.hospitalityCap;

  function categoryTotal(cat: ExpenseCategory): number {
    return items
      .filter((it) => it.category === cat && it.amount != null)
      .reduce((sum, it) => sum + (it.amount ?? 0), 0);
  }

  const totalExpenses = CATEGORY_ORDER.reduce(
    (sum, cat) => sum + categoryTotal(cat),
    0
  );

  const artistShare = expenseCap != null ? Math.min(totalExpenses, expenseCap) : totalExpenses;
  const houseAbsorbs = expenseCap != null ? Math.max(0, totalExpenses - expenseCap) : 0;

  const hospTotal = categoryTotal("hospitality");
  const hospOverage = hospitalityCap != null ? Math.max(0, hospTotal - hospitalityCap) : 0;

  if (!mounted) return null;

  return (
    <Card accent="brand">
      <CardHeader>
        <div>
          <CardTitle>Verified Expense Ledger</CardTitle>
          <p className="text-[12px] text-ink-500 mt-0.5 leading-relaxed">
            Itemized receipts per category. Upload a receipt to trigger AI
            extraction — confirm to lock the amount.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className="text-[20px] font-mono tabular font-semibold text-ink-900">
            {formatMoney(totalExpenses)}
          </span>
          {expenseCap != null && (
            <span className="text-[11px] text-ink-400">
              cap {formatMoney(expenseCap)}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {/* Category sections */}
        {CATEGORY_ORDER.map((cat) => {
          const config = CATEGORIES[cat];
          const catItems = items.filter((it) => it.category === cat);
          const catTotal = categoryTotal(cat);
          const isExpanded = expandedCategories.has(cat);
          const cap =
            cat === "hospitality" ? hospitalityCap : null;
          const capPct = cap != null && cap > 0 ? (catTotal / cap) * 100 : null;
          const catOverage = cap != null ? Math.max(0, catTotal - cap) : 0;
          const hasOverage = catOverage > 0;

          return (
            <div key={cat} className="border-t border-ink-100/80 first:border-t-0">
              {/* Category header row */}
              <button
                onClick={() => toggleCategory(cat)}
                className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-canvas-soft/60 transition-colors"
              >
                <div className="w-6 h-6 rounded bg-ink-100 flex items-center justify-center shrink-0">
                  <span className="text-[9px] font-bold text-ink-500 uppercase">
                    {config.icon}
                  </span>
                </div>
                <div className="flex-1 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-ink-900">
                      {config.label}
                    </span>
                    {catItems.length > 0 && (
                      <span className="text-[10.5px] text-ink-400">
                        {catItems.length} item{catItems.length === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Cap progress bar */}
                    {cap != null && catTotal > 0 && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-20 h-1.5 rounded-full bg-ink-100 overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              hasOverage ? "bg-rose-500" : "bg-brand-500"
                            )}
                            style={{ width: `${Math.min(capPct ?? 0, 100)}%` }}
                          />
                        </div>
                        <span
                          className={cn(
                            "text-[11px] font-mono tabular",
                            hasOverage ? "text-rose-700" : "text-ink-600"
                          )}
                        >
                          {formatMoney(catTotal)}
                        </span>
                      </div>
                    )}
                    {cap == null && catTotal > 0 && (
                      <span className="text-[12px] font-mono tabular text-ink-600">
                        {formatMoney(catTotal)}
                      </span>
                    )}
                    {hasOverage && (
                      <span className="text-[10px] font-medium text-rose-700">
                        +{formatMoney(catOverage)} over cap
                      </span>
                    )}
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-ink-400" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-ink-400" />
                    )}
                  </div>
                </div>
              </button>

              {/* Hospitality cap inline split when over */}
              {cat === "hospitality" && hospitalityCap != null && catTotal > 0 && (
                <div className="px-5 pb-2">
                  <div
                    className={cn(
                      "text-[11.5px] leading-relaxed",
                      hasOverage ? "text-rose-700" : "text-ink-500"
                    )}
                  >
                    {hasOverage ? (
                      <>
                        Artist share:{" "}
                        <span className="font-mono tabular font-medium">
                          {formatMoney(hospitalityCap)}
                        </span>
                        {" "}&mdash;{" "}
                        House absorbs:{" "}
                        <span className="font-mono tabular font-medium text-rose-700">
                          {formatMoney(catOverage)}
                        </span>
                      </>
                    ) : (
                      <>
                        {formatMoney(catTotal)} of {formatMoney(hospitalityCap)} cap
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Expanded: line items */}
              {isExpanded && (
                <div className="px-5 pb-3 space-y-2">
                  {catItems.length === 0 && (
                    <div className="text-[12px] text-ink-400 py-2 italic">
                      No items yet — add a receipt below.
                    </div>
                  )}

                  {catItems.map((item) => (
                    <LineItemRow
                      key={item.id}
                      item={item}
                      isScanning={scanningItems.has(item.id)}
                      onUpdate={(patch) => updateItem(item.id, patch)}
                      onRemove={() => removeItem(item.id)}
                      onReceiptChange={(filename) =>
                        handleReceiptChange(item.id, filename)
                      }
                      onConfirmExtraction={() => confirmExtraction(item.id)}
                    />
                  ))}

                  <button
                    onClick={() => addLineItem(cat)}
                    className="flex items-center gap-1.5 text-[12px] text-brand-700 hover:text-brand-800 py-1 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add line item
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* Summary row */}
        <div className="border-t border-ink-200/60 px-5 py-4 bg-canvas-soft/60">
          <div className="eyebrow text-[9.5px] text-ink-400 mb-3">
            Ledger summary
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <SummaryField label="Total expenses" value={formatMoney(totalExpenses)} />
            {expenseCap != null && (
              <SummaryField label="Cap" value={formatMoney(expenseCap)} />
            )}
            {expenseCap != null && houseAbsorbs > 0 ? (
              <>
                <SummaryField
                  label="Artist share"
                  value={formatMoney(artistShare)}
                  highlight="brand"
                />
                <SummaryField
                  label="House absorbs"
                  value={formatMoney(houseAbsorbs)}
                  highlight="rose"
                />
              </>
            ) : expenseCap != null ? (
              <SummaryField
                label="Overage"
                value="None"
                highlight="brand"
              />
            ) : null}
          </div>

          {/* Verified count */}
          <div className="mt-3 pt-3 border-t border-ink-100/60 flex items-center gap-4 text-[11px] text-ink-500">
            <span>
              <span className="font-semibold text-brand-700">
                {items.filter((i) => i.status === "verified").length}
              </span>{" "}
              verified
            </span>
            <span>
              <span className="font-semibold text-amber-700">
                {items.filter((i) => i.status === "extracted").length}
              </span>{" "}
              pending confirmation
            </span>
            <span>
              <span className="font-semibold text-ink-400">
                {items.filter((i) => i.status === "unverified").length}
              </span>{" "}
              unverified
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Line item row ────────────────────────────────────────────────────────────

function LineItemRow({
  item,
  isScanning,
  onUpdate,
  onRemove,
  onReceiptChange,
  onConfirmExtraction,
}: {
  item: LedgerLineItem;
  isScanning: boolean;
  onUpdate: (patch: Partial<LedgerLineItem>) => void;
  onRemove: () => void;
  onReceiptChange: (filename: string) => void;
  onConfirmExtraction: () => void;
}) {
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const isDbItem = item.source === "db";
  // isPerfectParse is true whenever we have parsed lines, regardless of
  // verification status — captured receipts are saved as "verified" so
  // checking status === "extracted" would hide the breakdown.
  const isPerfectParse = !!item.aiParsedLines?.length;

  return (
    <div
      className={cn(
        "rounded-lg ring-1 px-3.5 py-3",
        item.status === "verified"
          ? "ring-brand-200/60 bg-brand-50/20"
          : isPerfectParse
            ? "ring-brand-200/80 bg-brand-50/30"
            : item.status === "extracted"
              ? "ring-amber-200/60 bg-amber-50/20"
              : "ring-ink-200/60 bg-white"
      )}
    >
      <div className="flex items-start gap-2 mb-2">
        <StatusBadge status={item.status} isPerfectParse={isPerfectParse} />
        {isDbItem && (
          <span className="text-[10px] text-ink-400 ring-1 ring-ink-200/60 px-1.5 py-0.5 rounded bg-canvas-soft">
            from system
          </span>
        )}
        <div className="ml-auto">
          {!isDbItem && (
            <button
              onClick={onRemove}
              className="text-ink-300 hover:text-rose-600 transition-colors"
              aria-label="Remove"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Perfect Parse: show vendor + itemized breakdown with editable total */}
      {isPerfectParse && item.aiParsedLines ? (
        <div className="mb-2">
          {item.aiVendor && (
            <div className="text-[11px] text-ink-500 mb-2">
              <span className="eyebrow text-[9px] text-ink-400 mr-1">Vendor</span>
              <span className="font-semibold text-ink-800">{item.aiVendor}</span>
            </div>
          )}
          <div className="rounded-md bg-white/60 ring-1 ring-brand-100/80 overflow-hidden">
            {item.aiParsedLines.map((line, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-3 py-2 border-b border-brand-100/60 last:border-0"
              >
                <input
                  type="text"
                  value={line.description}
                  disabled={isDbItem}
                  onChange={(e) => {
                    const next = item.aiParsedLines!.map((l, j) =>
                      j === i ? { ...l, description: e.target.value } : l,
                    );
                    onUpdate({ aiParsedLines: next, status: "extracted" });
                  }}
                  className="flex-1 text-[12px] text-ink-700 bg-transparent outline-none border-b border-transparent focus:border-brand-300 disabled:opacity-60"
                />
                <div className="flex items-center gap-0.5 shrink-0">
                  <span className="text-[11px] text-ink-400">$</span>
                  <input
                    type="number"
                    value={line.amount}
                    disabled={isDbItem}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      const next = item.aiParsedLines!.map((l, j) =>
                        j === i ? { ...l, amount: val } : l,
                      );
                      const newTotal = next.reduce((s, l) => s + l.amount, 0);
                      onUpdate({
                        aiParsedLines: next,
                        amount: newTotal,
                        status: "extracted",
                      });
                    }}
                    className="w-20 text-right text-[12px] font-mono tabular text-ink-900 font-medium bg-transparent outline-none border-b border-transparent focus:border-brand-300 disabled:opacity-60"
                  />
                </div>
              </div>
            ))}
            {/* Editable total — edit to re-trigger confirm step */}
            <div className="flex items-center justify-between px-3 py-2 bg-brand-50/60 gap-3">
              <div>
                <span className="text-[11px] font-semibold text-brand-800 uppercase tracking-wide">
                  Total
                </span>
                <span className="text-[9.5px] text-ink-400 ml-1.5">
                  edit if needed
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[12px] text-brand-700">$</span>
                <input
                  type="number"
                  value={item.amount ?? ""}
                  onChange={(e) => {
                    const val = e.target.value ? parseFloat(e.target.value) : null;
                    onUpdate({
                      amount: val,
                      // Drop back to extracted so the Confirm button reappears
                      status: "extracted",
                    });
                  }}
                  disabled={isDbItem}
                  className="w-20 text-right text-[14px] font-mono tabular font-bold text-brand-900 bg-transparent outline-none border-b border-brand-300/60 focus:border-brand-600 disabled:opacity-60"
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-[1fr_auto] gap-2 items-center mb-1">
          {/* Description */}
          <input
            type="text"
            value={item.description}
            onChange={(e) => onUpdate({ description: e.target.value })}
            placeholder="Description (e.g. Instagram Ads — May 3)"
            disabled={isDbItem}
            className="text-[12.5px] text-ink-900 bg-transparent border-0 outline-none placeholder-ink-300 disabled:text-ink-600 w-full"
          />

          {/* Amount */}
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-ink-400">$</span>
            <input
              type="number"
              value={item.amount ?? ""}
              onChange={(e) =>
                onUpdate({
                  amount: e.target.value ? parseFloat(e.target.value) : null,
                  status: item.status === "extracted" ? "extracted" : item.status,
                })
              }
              placeholder="0.00"
              disabled={isDbItem}
              className="text-[13px] font-mono tabular text-ink-900 bg-transparent border-0 outline-none w-20 text-right placeholder-ink-300 disabled:text-ink-600"
            />
          </div>
        </div>
      )}

      {/* Receipt section */}
      <div className="mt-2 pt-2 border-t border-ink-100/60 flex items-center gap-2 flex-wrap">
        {isScanning ? (
          <div className="flex items-center gap-1.5 text-[11px] text-amber-700">
            <Loader2 className="h-3 w-3 animate-spin" />
            Scanning receipt&hellip;
          </div>
        ) : item.receiptFilename ? (
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <FileText className="h-3 w-3 text-ink-400 shrink-0" />
            <span className="text-[11px] text-ink-600 truncate">
              {item.receiptFilename}
            </span>
            {/* View Receipt button — opens the simulated invoice modal */}
            {isPerfectParse && (
              <button
                onClick={() => setShowReceiptModal(true)}
                className="ml-1 inline-flex items-center gap-1 text-[10.5px] font-medium text-brand-700 hover:text-brand-800 ring-1 ring-brand-200/60 bg-brand-50/60 px-1.5 py-0.5 rounded transition-colors shrink-0"
              >
                <Eye className="h-2.5 w-2.5" />
                View Receipt
              </button>
            )}
            {item.status === "extracted" && (
              <Button
                size="sm"
                variant={isPerfectParse ? "brand" : "secondary"}
                onClick={onConfirmExtraction}
                className="ml-auto shrink-0 h-6 text-[11px] px-2"
              >
                <Check className="h-3 w-3" />
                {isPerfectParse
                  ? `Confirm ${formatMoney(item.amount)}`
                  : `Confirm ${item.amount != null ? `$${item.amount}` : ""}`}
              </Button>
            )}
          </div>
        ) : (
          <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-ink-400 hover:text-brand-700 transition-colors">
            <Upload className="h-3 w-3" />
            <span>Attach receipt</span>
            <input
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onReceiptChange(file.name);
              }}
            />
          </label>
        )}
      </div>

      {/* Receipt preview modal */}
      {showReceiptModal && (
        <LedgerReceiptModal
          item={item}
          onClose={() => setShowReceiptModal(false)}
        />
      )}
    </div>
  );
}

// ─── Receipt preview modal (ledger) ──────────────────────────────────────────

function LedgerReceiptModal({
  item,
  onClose,
}: {
  item: LedgerLineItem;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-ink-900/40" />
      <div
        className="relative z-10 w-full max-w-sm rounded-2xl bg-white overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100/80">
          <div>
            <div className="text-[13px] font-semibold text-ink-900">
              Receipt Evidence
            </div>
            <div className="text-[11px] text-ink-400 mt-0.5">
              {item.receiptFilename ?? "Attached receipt"}
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
          <div className="rounded-xl ring-1 ring-ink-200/60 overflow-hidden">
            {/* WhatsApp-style header */}
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

            {/* Chat bubble */}
            <div className="bg-[#ece5dd] p-3 flex justify-end">
              <div className="bg-[#dcf8c6] rounded-xl rounded-br-sm px-4 py-3 max-w-[90%] ring-1 ring-black/5">
                <div className="text-[10px] font-bold text-[#128c7e] uppercase tracking-wide mb-2">
                  Meta · Instagram Ads
                </div>
                <div className="text-[11.5px] text-ink-800 font-semibold mb-0.5">
                  {item.aiVendor ?? "Instagram Ads"}
                </div>
                <div className="text-[10.5px] text-ink-500 mb-3">
                  Invoice #INS-2025-0314 · Mar 14, 2025
                </div>

                <div className="space-y-1.5 border-t border-black/10 pt-2">
                  {item.aiParsedLines?.map((line, i) => (
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
                  <span className="text-[12px] font-bold text-ink-900">TOTAL</span>
                  <span className="text-[14px] font-mono tabular font-bold text-ink-900">
                    ${(item.amount ?? 0).toFixed(2)}
                  </span>
                </div>

                <div className="text-right text-[9.5px] text-ink-400 mt-2">
                  10:47 AM ✓✓
                </div>
              </div>
            </div>
          </div>

          {/* AI label */}
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

// ─── Summary field ────────────────────────────────────────────────────────────

function SummaryField({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "brand" | "rose";
}) {
  return (
    <div>
      <div className="eyebrow text-[9.5px] text-ink-400 mb-0.5">{label}</div>
      <div
        className={cn(
          "text-[15px] font-mono tabular font-semibold",
          highlight === "brand"
            ? "text-brand-700"
            : highlight === "rose"
              ? "text-rose-700"
              : "text-ink-900"
        )}
      >
        {value}
      </div>
    </div>
  );
}

