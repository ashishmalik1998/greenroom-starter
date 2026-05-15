"use client";

/**
 * Settlement Readiness progress bar for the show detail page header.
 * Reads from localStorage to count how many expense categories have had
 * receipts captured via the Expense Capture flow (Component 3).
 *
 * This is intentionally lightweight — it's a motivational nudge for
 * Wednesday-before-the-show behaviour, not a hard gate.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LedgerLineItem } from "./verified-ledger";

const TOTAL_CATEGORIES = 7;

function storageKey(showId: string) {
  return `greenroom_ledger_${showId}`;
}

export function CaptureProgress({ showId }: { showId: string }) {
  const [capturedCount, setCapturedCount] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    function readProgress() {
      const stored = localStorage.getItem(storageKey(showId));
      if (!stored) {
        setCapturedCount(0);
        return;
      }
      try {
        const items = JSON.parse(stored) as LedgerLineItem[];
        if (!Array.isArray(items)) {
          setCapturedCount(0);
          return;
        }
        // Count how many distinct categories have at least one verified item
        const verifiedCats = new Set(
          items
            .filter((it) => it.status === "verified" || it.status === "extracted")
            .map((it) => it.category)
        );
        setCapturedCount(verifiedCats.size);
      } catch {
        setCapturedCount(0);
      }
    }

    readProgress();

    // Re-read whenever localStorage changes (e.g., from capture page in same tab)
    function onStorage(e: StorageEvent) {
      if (e.key === storageKey(showId)) readProgress();
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [showId]);

  if (!mounted) return null;

  const pct = Math.round((capturedCount / TOTAL_CATEGORIES) * 100);
  const isReady = capturedCount >= TOTAL_CATEGORIES;
  const isStarted = capturedCount > 0;

  return (
    <div className="mt-6 pt-5 border-t border-ink-200/40">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="eyebrow text-[9.5px] text-ink-500">
            Settlement readiness
          </span>
          <span
            className={cn(
              "text-[11px] font-mono tabular font-medium",
              isReady
                ? "text-brand-700"
                : isStarted
                  ? "text-amber-700"
                  : "text-ink-400"
            )}
          >
            {capturedCount} of {TOTAL_CATEGORIES} expense categories captured
          </span>
        </div>
        <Link
          href={`/shows/${showId}/capture`}
          className="inline-flex items-center gap-1 text-[11px] text-brand-700 hover:text-brand-800 font-medium transition-colors"
        >
          {isStarted ? "Continue capture" : "Start capturing"}
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-ink-100/80 overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            isReady
              ? "bg-brand-600"
              : isStarted
                ? "bg-amber-500"
                : "bg-ink-200"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      {!isStarted && (
        <p className="text-[11px] text-ink-400 mt-2 leading-relaxed">
          Capture receipts during the week so your 2am settlement is already
          built.
        </p>
      )}
    </div>
  );
}
