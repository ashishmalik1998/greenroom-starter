"use client";

/**
 * Component 3: Proactive Capture Entry Screen
 *
 * Mobile-friendly (375px+) three-step receipt capture flow:
 *   Step 1 — Category selector (large tap targets)
 *   Step 2 — Receipt scan simulation (1.5s spinner then AI-extracted amount)
 *   Step 3 — Confirm or edit amount, add note, save
 *
 * Captured receipts are saved to localStorage under the same key as the
 * VerifiedExpenseLedger, so they appear as verified line items when
 * Mariana opens the settlement view.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Loader2,
  Upload,
  ChevronRight,
  CheckCircle2,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Show, Artist, Deal } from "@/db/schema";
import type { LedgerLineItem } from "./verified-ledger";

// ─── Types ────────────────────────────────────────────────────────────────────

type ExpenseCategory =
  | "marketing"
  | "hospitality"
  | "sound"
  | "lights"
  | "production"
  | "security"
  | "backline";

type CapturedReceipt = LedgerLineItem & {
  capturedAt: string; // ISO string
  vendor: string;
};

// ─── Category config ──────────────────────────────────────────────────────────

const CATEGORIES: {
  key: ExpenseCategory;
  label: string;
  description: string;
  color: string;
  bgColor: string;
}[] = [
  {
    key: "marketing",
    label: "Marketing",
    description: "Ads, promo, social",
    color: "text-sky-700",
    bgColor: "bg-sky-50 ring-sky-200/80",
  },
  {
    key: "hospitality",
    label: "Hospitality",
    description: "Catering, rider items",
    color: "text-amber-700",
    bgColor: "bg-amber-50 ring-amber-200/80",
  },
  {
    key: "sound",
    label: "Sound",
    description: "PA, monitors, engineers",
    color: "text-brand-700",
    bgColor: "bg-brand-50 ring-brand-200/80",
  },
  {
    key: "lights",
    label: "Lights",
    description: "Rigs, gels, operators",
    color: "text-ink-700",
    bgColor: "bg-ink-50 ring-ink-200/80",
  },
  {
    key: "production",
    label: "Production",
    description: "Stage, crew, gear",
    color: "text-rose-700",
    bgColor: "bg-rose-50 ring-rose-200/80",
  },
  {
    key: "security",
    label: "Security",
    description: "Door staff, patrol",
    color: "text-ink-700",
    bgColor: "bg-ink-100 ring-ink-200/80",
  },
  {
    key: "backline",
    label: "Backline",
    description: "Amps, drums, stands",
    color: "text-brand-700",
    bgColor: "bg-brand-50/60 ring-brand-200/60",
  },
];

// ─── Simulated AI amounts (same as VerifiedExpenseLedger for consistency) ─────

const AI_AMOUNTS: Record<ExpenseCategory, number> = {
  marketing: 600, // overridden by MARKETING_PERFECT_PARSE below
  hospitality: 145,
  sound: 125,
  lights: 80,
  production: 195,
  security: 300,
  backline: 75,
};

const AI_VENDORS: Record<ExpenseCategory, string> = {
  marketing: "Instagram Ads",
  hospitality: "Crescent Kitchen",
  sound: "Audio Supply Co.",
  lights: "Stage Light Rentals",
  production: "Crew Direct",
  security: "Premier Security",
  backline: "Guitar Center",
};

// ─── Perfect Parse — hardcoded JSON returned for Marketing uploads ────────────
// Bypass generic extraction for Marketing category; return structured itemized
// output so the demo shows a "Perfect Parse" with traceable line items.
// Trigger: category === "marketing" (any filename).
const MARKETING_PERFECT_PARSE = {
  vendor: "Instagram Ads",
  lines: [
    { description: "Poster design", amount: 200 },
    { description: "Social boost", amount: 400 },
  ],
  total: 600,
} as const;

type PerfectParseResult = typeof MARKETING_PERFECT_PARSE | null;

function storageKey(showId: string) {
  return `greenroom_ledger_${showId}`;
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ExpenseCapture({
  showId,
  show,
  deal,
  artist,
}: {
  showId: string;
  show: Show;
  deal: Deal | null;
  artist: Artist | null;
}) {
  type Step = "category" | "scan" | "confirm";

  const [step, setStep] = useState<Step>("category");
  const [selectedCategory, setSelectedCategory] =
    useState<ExpenseCategory | null>(null);
  const [receiptFilename, setReceiptFilename] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [aiAmount, setAiAmount] = useState<number | null>(null);
  const [perfectParse, setPerfectParse] = useState<PerfectParseResult>(null);
  const [confirmedAmount, setConfirmedAmount] = useState<string>("");
  const [vendor, setVendor] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [savedReceipts, setSavedReceipts] = useState<CapturedReceipt[]>([]);
  const [justSaved, setJustSaved] = useState(false);

  // Load existing items from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(storageKey(showId));
    if (!stored) return;
    try {
      const items = JSON.parse(stored) as LedgerLineItem[];
      if (Array.isArray(items)) {
        // Only surface capture-sourced items in the log
        const captured: CapturedReceipt[] = items
          .filter((it) => it.source === "capture")
          .map((it) => ({
            ...it,
            vendor: AI_VENDORS[it.category as ExpenseCategory] || it.category,
            capturedAt: new Date().toISOString(),
          }));
        setSavedReceipts(captured);
      }
    } catch {
      // ignore
    }
  }, [showId]);

  function handleCategorySelect(cat: ExpenseCategory) {
    setSelectedCategory(cat);
    setStep("scan");
    setReceiptFilename(null);
    setAiAmount(null);
    setPerfectParse(null);
    setConfirmedAmount("");
    setVendor(AI_VENDORS[cat] || "");
    setNote("");
  }

  function handleFileSelect(filename: string) {
    setReceiptFilename(filename);
    setScanning(true);
    setAiAmount(null);
    setPerfectParse(null);

    setTimeout(() => {
      setScanning(false);

      if (selectedCategory === "marketing") {
        // Perfect Parse — return hardcoded Instagram Ads itemized JSON
        setPerfectParse(MARKETING_PERFECT_PARSE);
        setAiAmount(MARKETING_PERFECT_PARSE.total);
        setConfirmedAmount(String(MARKETING_PERFECT_PARSE.total));
        setVendor(MARKETING_PERFECT_PARSE.vendor);
      } else {
        const amount = AI_AMOUNTS[selectedCategory!];
        setAiAmount(amount);
        setConfirmedAmount(String(amount));
      }

      setStep("confirm");
    }, 1500);
  }

  function handleSave() {
    if (!selectedCategory) return;
    const amount = parseFloat(confirmedAmount);
    if (isNaN(amount)) return;

    const dateLabel = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const defaultDescription = perfectParse
      ? `${perfectParse.vendor} — ${dateLabel}`
      : note || `${AI_VENDORS[selectedCategory]} — ${dateLabel}`;

    const newItem: LedgerLineItem = {
      id: `capture_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      category: selectedCategory,
      description: note || defaultDescription,
      amount,
      receiptFilename,
      status: "verified",
      aiExtractedAmount: aiAmount,
      // Preserve the parsed line items so the ledger can show the breakdown
      ...(perfectParse
        ? {
            aiParsedLines: [...perfectParse.lines],
            aiVendor: perfectParse.vendor,
          }
        : {}),
      source: "capture",
    };

    const capturedEntry: CapturedReceipt = {
      ...newItem,
      vendor: vendor || AI_VENDORS[selectedCategory] || selectedCategory,
      capturedAt: new Date().toISOString(),
    };

    // Merge into ledger localStorage
    const stored = localStorage.getItem(storageKey(showId));
    let existing: LedgerLineItem[] = [];
    if (stored) {
      try {
        existing = JSON.parse(stored);
      } catch {
        existing = [];
      }
    }
    const next = [...existing, newItem];
    localStorage.setItem(storageKey(showId), JSON.stringify(next));

    setSavedReceipts((prev) => [capturedEntry, ...prev]);
    setJustSaved(true);

    // Reset flow
    setTimeout(() => {
      setJustSaved(false);
      setStep("category");
      setSelectedCategory(null);
      setReceiptFilename(null);
      setAiAmount(null);
      setPerfectParse(null);
      setConfirmedAmount("");
      setVendor("");
      setNote("");
    }, 1200);
  }

  const capturedCategories = new Set(savedReceipts.map((r) => r.category));
  const progressPct = Math.round(
    (capturedCategories.size / CATEGORIES.length) * 100
  );

  return (
    <div className="min-h-screen bg-canvas">
      {/* Header */}
      <div className="px-4 pt-8 pb-6 max-w-lg mx-auto">
        <Link
          href={`/shows/${showId}`}
          className="inline-flex items-center gap-1 text-[12px] text-ink-400 hover:text-ink-900 mb-6 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to show
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="eyebrow text-[10px] text-ink-500 mb-1">
              Expense Capture
            </div>
            <h1
              className="font-display text-[28px] font-medium text-ink-900 leading-tight"
              style={{ letterSpacing: "-0.02em" }}
            >
              {artist?.name ?? "Show"}
            </h1>
            <div className="text-[12px] text-ink-400 mt-1">
              {show.date} &middot; Pre-settlement receipts
            </div>
          </div>
        </div>

        {/* Readiness bar */}
        <div className="mt-5 pt-5 border-t border-ink-200/40">
          <div className="flex items-center justify-between mb-1.5">
            <span className="eyebrow text-[9.5px] text-ink-500">
              Settlement readiness
            </span>
            <span className="text-[11px] text-ink-600 font-mono tabular">
              {capturedCategories.size} / {CATEGORIES.length}
            </span>
          </div>
          <div className="h-2 rounded-full bg-ink-100/80 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                progressPct === 100
                  ? "bg-brand-600"
                  : progressPct > 0
                    ? "bg-amber-500"
                    : "bg-ink-200"
              )}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Step flow */}
      <div className="px-4 max-w-lg mx-auto pb-12">
        {/* ── Step 1: Category selector ─────────────────────────────────────── */}
        {step === "category" && (
          <div>
            {justSaved && (
              <div className="mb-4 rounded-xl border border-brand-200/60 bg-brand-50/40 px-4 py-3 flex items-center gap-2 text-[13px] text-brand-800">
                <CheckCircle2 className="h-4 w-4 text-brand-700 shrink-0" />
                Receipt saved and added to ledger.
              </div>
            )}

            <div className="text-[13px] font-semibold text-ink-900 mb-3">
              Select expense category
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {CATEGORIES.map((cat) => {
                const isCaptured = capturedCategories.has(cat.key);
                return (
                  <button
                    key={cat.key}
                    onClick={() => handleCategorySelect(cat.key)}
                    className={cn(
                      "relative rounded-xl ring-1 p-4 text-left transition-all active:scale-[0.98]",
                      isCaptured
                        ? "ring-brand-200/80 bg-brand-50/40"
                        : "ring-ink-200/60 bg-white hover:ring-ink-300/80"
                    )}
                  >
                    {isCaptured && (
                      <div className="absolute top-2.5 right-2.5">
                        <Check className="h-3 w-3 text-brand-600" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "inline-flex items-center justify-center w-8 h-8 rounded-lg ring-1 mb-2 text-[13px] font-bold",
                        cat.bgColor,
                        cat.color
                      )}
                    >
                      {cat.label[0]}
                    </div>
                    <div className="text-[13px] font-semibold text-ink-900">
                      {cat.label}
                    </div>
                    <div className="text-[11px] text-ink-400 mt-0.5">
                      {cat.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Step 2: Scan / upload ────────────────────────────────────────── */}
        {step === "scan" && selectedCategory && (
          <div>
            <button
              onClick={() => setStep("category")}
              className="text-[12px] text-ink-400 hover:text-ink-700 mb-5 flex items-center gap-1 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Change category
            </button>

            <div className="text-[13px] font-semibold text-ink-900 mb-1">
              {CATEGORIES.find((c) => c.key === selectedCategory)?.label}
            </div>
            <div className="text-[12px] text-ink-500 mb-6">
              Upload the receipt — AI will extract the amount for you.
            </div>

            {scanning ? (
              <div className="rounded-2xl border border-amber-200/60 bg-amber-50/40 p-10 flex flex-col items-center gap-4">
                <Loader2 className="h-8 w-8 text-amber-600 animate-spin" />
                <div className="text-[13px] font-medium text-amber-800">
                  Scanning receipt&hellip;
                </div>
                <div className="text-[11px] text-ink-400">
                  AI is reading {receiptFilename}
                </div>
              </div>
            ) : (
              <label className="block rounded-2xl border-2 border-dashed border-ink-200/80 bg-canvas-soft hover:border-brand-300/80 transition-colors cursor-pointer">
                <div className="flex flex-col items-center gap-3 py-12 px-6 text-center">
                  <div className="w-12 h-12 rounded-xl bg-white ring-1 ring-ink-200/60 flex items-center justify-center">
                    <Upload className="h-5 w-5 text-ink-400" />
                  </div>
                  <div>
                    <div className="text-[13px] font-medium text-ink-700">
                      Tap to upload receipt
                    </div>
                    <div className="text-[11px] text-ink-400 mt-1">
                      Photo or PDF &middot; AI will extract the amount
                    </div>
                  </div>
                </div>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(file.name);
                  }}
                />
              </label>
            )}
          </div>
        )}

        {/* ── Step 3: Confirm ────────────────────────────────────────────────── */}
        {step === "confirm" && selectedCategory && (
          <div>
            <button
              onClick={() => setStep("scan")}
              className="text-[12px] text-ink-400 hover:text-ink-700 mb-5 flex items-center gap-1 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Re-scan
            </button>

            <div className="text-[13px] font-semibold text-ink-900 mb-4">
              {perfectParse ? "Perfect Parse — confirm to apply" : "Confirm extracted amount"}
            </div>

            {/* Perfect Parse card — shown for Marketing uploads */}
            {perfectParse ? (
              <div className="rounded-xl border border-brand-200/60 bg-brand-50/30 px-4 py-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-brand-700 bg-brand-100/80 px-1.5 py-0.5 rounded">
                      AI
                    </span>
                    <span className="text-[11px] text-brand-800 font-semibold">
                      Perfect Parse · confirm to apply
                    </span>
                  </div>
                  {receiptFilename && (
                    <div className="flex items-center gap-1 text-[10.5px] text-ink-400">
                      <FileText className="h-3 w-3" />
                      {receiptFilename}
                    </div>
                  )}
                </div>

                {/* Vendor */}
                <div className="text-[11px] text-ink-500 mb-3">
                  <span className="eyebrow text-[9px] text-ink-400 mr-1.5">Vendor</span>
                  <span className="font-semibold text-ink-800">{perfectParse.vendor}</span>
                </div>

                {/* Itemized line items */}
                <div className="rounded-lg overflow-hidden ring-1 ring-brand-100/80">
                  {perfectParse.lines.map((line, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between px-3.5 py-2.5 bg-white/60 border-b border-brand-100/60 last:border-0"
                    >
                      <span className="text-[13px] text-ink-700">{line.description}</span>
                      <span className="text-[13px] font-mono tabular font-medium text-ink-900">
                        {formatMoney(line.amount)}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-3.5 py-3 bg-brand-50/60">
                    <span className="text-[11px] font-bold text-brand-800 uppercase tracking-wide">
                      Total
                    </span>
                    <span className="text-[18px] font-mono tabular font-bold text-brand-900">
                      {formatMoney(perfectParse.total)}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              /* Generic AI extraction card */
              aiAmount != null && (
                <div className="rounded-xl border border-amber-200/60 bg-amber-50/40 px-4 py-3.5 mb-4 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-100/80 px-1 py-0.5 rounded">
                        AI
                      </span>
                      <span className="text-[11px] text-amber-800 font-medium">
                        AI-extracted · confirm to apply
                      </span>
                    </div>
                    {receiptFilename && (
                      <div className="flex items-center gap-1 text-[11px] text-ink-500 mt-1">
                        <FileText className="h-3 w-3" />
                        {receiptFilename}
                      </div>
                    )}
                  </div>
                  <span className="text-[20px] font-mono tabular font-semibold text-amber-900">
                    {formatMoney(aiAmount)}
                  </span>
                </div>
              )
            )}

            {/* Edit fields — amount hidden for Perfect Parse (total is fixed) */}
            <div className="space-y-3">
              {!perfectParse && (
                <div>
                  <label className="eyebrow text-[9.5px] text-ink-500 block mb-1">
                    Amount
                  </label>
                  <div className="flex items-center rounded-xl ring-1 ring-ink-200/80 bg-white px-3.5 py-3 gap-2">
                    <span className="text-ink-400 text-[14px]">$</span>
                    <input
                      type="number"
                      value={confirmedAmount}
                      onChange={(e) => setConfirmedAmount(e.target.value)}
                      className="flex-1 text-[18px] font-mono tabular text-ink-900 bg-transparent outline-none"
                      placeholder="0.00"
                      autoFocus
                    />
                  </div>
                </div>
              )}

              {!perfectParse && (
                <div>
                  <label className="eyebrow text-[9.5px] text-ink-500 block mb-1">
                    Vendor
                  </label>
                  <input
                    type="text"
                    value={vendor}
                    onChange={(e) => setVendor(e.target.value)}
                    className="w-full rounded-xl ring-1 ring-ink-200/80 bg-white px-3.5 py-3 text-[13px] text-ink-900 outline-none placeholder-ink-300"
                    placeholder="Vendor name"
                  />
                </div>
              )}

              <div>
                <label className="eyebrow text-[9.5px] text-ink-500 block mb-1">
                  Note (optional)
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full rounded-xl ring-1 ring-ink-200/80 bg-white px-3.5 py-3 text-[13px] text-ink-900 outline-none placeholder-ink-300"
                  placeholder={perfectParse ? "Add a note (optional)" : "e.g. Instagram Ads — Mar 14"}
                />
              </div>
            </div>

            <div className="mt-5 flex gap-2.5">
              <Button
                variant="brand"
                className="flex-1 h-12 text-[14px]"
                onClick={handleSave}
                disabled={!perfectParse && (!confirmedAmount || isNaN(parseFloat(confirmedAmount)))}
              >
                <Check className="h-4 w-4" />
                {perfectParse
                  ? `Save ${formatMoney(perfectParse.total)} — verified`
                  : "Save receipt"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setStep("category")}
                className="h-12 px-4"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* ── Running receipts log ─────────────────────────────────────────── */}
        {savedReceipts.length > 0 && step === "category" && (
          <div className="mt-10">
            <div className="flex items-center justify-between mb-3">
              <div className="eyebrow text-[9.5px] text-ink-500">
                Captured this week
              </div>
              <Link
                href={`/shows/${showId}/settle`}
                className="inline-flex items-center gap-0.5 text-[11px] text-brand-700 hover:text-brand-800 font-medium transition-colors"
              >
                View in ledger
                <ChevronRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="rounded-xl border border-ink-200/60 overflow-hidden bg-white">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-ink-100/80">
                    <th className="py-2.5 px-3 text-left eyebrow text-[9px] text-ink-400 font-semibold">
                      Date
                    </th>
                    <th className="py-2.5 px-3 text-left eyebrow text-[9px] text-ink-400 font-semibold">
                      Category
                    </th>
                    <th className="py-2.5 px-3 text-left eyebrow text-[9px] text-ink-400 font-semibold">
                      Vendor
                    </th>
                    <th className="py-2.5 px-3 text-right eyebrow text-[9px] text-ink-400 font-semibold">
                      Amount
                    </th>
                    <th className="py-2.5 px-3 text-center eyebrow text-[9px] text-ink-400 font-semibold">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100/60">
                  {savedReceipts.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2.5 px-3 text-ink-500">
                        {new Date(r.capturedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-ink-800 capitalize">
                        {r.category}
                      </td>
                      <td className="py-2.5 px-3 text-ink-500">{r.vendor}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular text-ink-900">
                        {r.amount != null ? formatMoney(r.amount) : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200/80">
                          <Check className="h-2.5 w-2.5" />
                          Verified
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
