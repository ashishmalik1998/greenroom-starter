"use client";

/**
 * Component 2: Deal Rule Extractor (Simulated AI)
 *
 * Reads the deal's freetext notes and extracts structured rules via pattern
 * matching. For the demo show (show_coastal_spell_dispute / Coastal Spell),
 * the extraction is hardcoded to match the actual deal text exactly, so the
 * demo flows cleanly.
 *
 * For other shows, generic pattern matching produces a reasonable output.
 * All output is labeled "AI-extracted · Review before settling" so the
 * simulated nature is visible to anyone using the tool.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight, CheckCircle, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { Deal } from "@/db/schema";

type RuleType =
  | "guarantee"
  | "percentage"
  | "expense_cap"
  | "hospitality_cap"
  | "recoup"
  | "bonus";

type ExtractedRule = {
  type: RuleType;
  label: string;
  value: string;
  sourceQuote: string;
  status: "applied" | "needs_review";
};

// ─── Demo show: Coastal Spell (show_coastal_spell_dispute) ───────────────────
// Hardcoded extraction from the actual deal notes for this show.
// Deal notes: "$5,000 vs 80% of net after expenses, whichever greater.
// Expenses capped $2,500. Hospitality cap $500. +$1,000 bonus over $25k gross.
// Marketing recoup of $900 against gross."
const COASTAL_SPELL_RULES: ExtractedRule[] = [
  {
    type: "guarantee",
    label: "Guarantee",
    value: "$5,000",
    sourceQuote:
      "$5,000 vs 80% of net after expenses, whichever greater.",
    status: "applied",
  },
  {
    type: "percentage",
    label: "Revenue share",
    value: "80% of net after expenses (vs guarantee)",
    sourceQuote:
      "$5,000 vs 80% of net after expenses, whichever greater.",
    status: "applied",
  },
  {
    type: "expense_cap",
    label: "Total expense cap",
    value: "$2,500",
    sourceQuote: "Expenses capped $2,500.",
    status: "applied",
  },
  {
    type: "hospitality_cap",
    label: "Hospitality cap",
    value: "$500",
    sourceQuote: "Hospitality cap $500.",
    status: "applied",
  },
  {
    type: "bonus",
    label: "Gross threshold bonus",
    value: "+$1,000 if gross exceeds $25,000",
    sourceQuote: "+$1,000 bonus over $25k gross.",
    status: "applied",
  },
  {
    type: "recoup",
    label: "Marketing recoup (disputed)",
    value: "$900 against gross",
    sourceQuote: "Marketing recoup of $900 against gross.",
    status: "needs_review",
  },
];

// ─── Generic extraction for other shows ─────────────────────────────────────

function extractSentence(text: string, keyword: string): string {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(keyword.toLowerCase());
  if (idx === -1) return "";
  const start = Math.max(0, text.lastIndexOf(".", idx - 1) + 1);
  const end = text.indexOf(".", idx);
  if (end === -1) return text.slice(start).trim();
  return text.slice(start, end + 1).trim();
}

function genericExtract(deal: Deal): ExtractedRule[] {
  const rules: ExtractedRule[] = [];
  const notes = deal.dealNotesFreetext ?? "";

  if (deal.guaranteeAmount != null) {
    rules.push({
      type: "guarantee",
      label: "Guarantee",
      value: `$${deal.guaranteeAmount.toLocaleString()}`,
      sourceQuote:
        extractSentence(notes, "guarantee") ||
        extractSentence(notes, "flat") ||
        `$${deal.guaranteeAmount.toLocaleString()} guarantee`,
      status: "applied",
    });
  }

  if (deal.percentage != null) {
    const pct = (deal.percentage * 100).toFixed(0);
    const basis = deal.percentageBasis ?? "net";
    rules.push({
      type: "percentage",
      label: "Revenue share",
      value: `${pct}% of ${basis}`,
      sourceQuote:
        extractSentence(notes, "% of") ||
        extractSentence(notes, "percent") ||
        `${pct}% of ${basis}`,
      status: "applied",
    });
  }

  if (deal.expenseCap != null) {
    rules.push({
      type: "expense_cap",
      label: "Expense cap",
      value: `$${deal.expenseCap.toLocaleString()}`,
      sourceQuote:
        extractSentence(notes, "cap") ||
        extractSentence(notes, "capped") ||
        `Expenses capped $${deal.expenseCap.toLocaleString()}`,
      status: "applied",
    });
  }

  if (deal.hospitalityCap != null) {
    rules.push({
      type: "hospitality_cap",
      label: "Hospitality cap",
      value: `$${deal.hospitalityCap.toLocaleString()}`,
      sourceQuote:
        extractSentence(notes, "hospitality") ||
        `Hospitality cap $${deal.hospitalityCap.toLocaleString()}`,
      status: "applied",
    });
  }

  if (notes.toLowerCase().includes("recoup")) {
    rules.push({
      type: "recoup",
      label: "Recoup clause",
      value: "See notes — amount unclear",
      sourceQuote: extractSentence(notes, "recoup"),
      status: "needs_review",
    });
  }

  return rules;
}

// ─── Component ───────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<RuleType, string> = {
  guarantee: "Guarantee",
  percentage: "Revenue share",
  expense_cap: "Expense cap",
  hospitality_cap: "Hospitality cap",
  recoup: "Recoup clause",
  bonus: "Bonus",
};

export function DealIntelligence({
  showId,
  deal,
}: {
  showId: string;
  deal: Deal;
}) {
  const [expanded, setExpanded] = useState(false);

  const rules =
    showId === "show_coastal_spell_dispute"
      ? COASTAL_SPELL_RULES
      : genericExtract(deal);

  if (rules.length === 0 && !deal.dealNotesFreetext) return null;

  const needsReviewCount = rules.filter((r) => r.status === "needs_review").length;

  return (
    <Card>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-5 py-4 flex items-center justify-between text-left transition-colors rounded-lg"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-md bg-amber-50 ring-1 ring-amber-200/80 flex items-center justify-center shrink-0">
            <span className="text-[11px] font-bold text-amber-700">AI</span>
          </div>
          <div>
            <div className="text-[13px] font-semibold text-ink-900">
              Deal Intelligence
            </div>
            <div className="text-[11px] text-ink-400 mt-0.5">
              AI-extracted from deal notes &middot; Review before settling
            </div>
          </div>
          {needsReviewCount > 0 && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200/80">
              {needsReviewCount} need{needsReviewCount === 1 ? "s" : ""} review
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-ink-400">
          <span className="text-[11px]">
            {rules.length} rule{rules.length === 1 ? "" : "s"} extracted
          </span>
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-ink-100/80">
          <CardContent className="pt-4 pb-5 space-y-2.5">
            <div className="text-[11.5px] text-ink-500 leading-relaxed mb-4 rounded-lg bg-amber-50/60 ring-1 ring-amber-200/50 px-3.5 py-2.5">
              Pattern-matched from{" "}
              <span className="font-mono text-[10.5px] bg-white/80 px-1 py-0.5 rounded ring-1 ring-ink-200/40">
                deal_notes_freetext
              </span>
              . Structured fields take precedence for settlement math.
              Confirm accuracy before settling.
            </div>

            {rules.map((rule, i) => (
              <div
                key={i}
                className="rounded-lg bg-canvas-soft ring-1 ring-ink-200/50 p-3.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="eyebrow text-[9.5px] text-ink-400 mb-1">
                      {TYPE_LABELS[rule.type]}
                    </div>
                    <div className="text-[14px] font-semibold text-ink-900 leading-tight">
                      {rule.value}
                    </div>
                    {rule.sourceQuote && (
                      <div className="mt-2 text-[11.5px] text-ink-600 leading-relaxed">
                        <span className="text-[10px] text-ink-400 mr-1">
                          Source:
                        </span>
                        <span className="bg-amber-100/80 px-0.5 py-0.5 rounded">
                          &ldquo;{rule.sourceQuote}&rdquo;
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 mt-0.5">
                    {rule.status === "applied" ? (
                      <div className="flex items-center gap-1 text-[10.5px] font-medium text-brand-700">
                        <CheckCircle className="h-3.5 w-3.5" />
                        <span>Applied to settlement</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-[10.5px] font-medium text-amber-700">
                        <AlertCircle className="h-3.5 w-3.5" />
                        <span>Needs review</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </div>
      )}
    </Card>
  );
}
