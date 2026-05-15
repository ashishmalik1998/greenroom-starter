"use client";

/**
 * Component 4: Ghost Dispute Flag
 *
 * Appears ONLY when settlement.status === "disputed" AND the signoff_text
 * contains language that indicates the artist team has already agreed.
 *
 * Text: "Note indicates agreement. Resolve status to Finalized?"
 * Button: calls the resolveGhostDispute server action to update the DB row
 *         to status="finalized" — no schema change, "finalized" is already a
 *         valid enum value.
 */

import { useState, useEffect, useTransition } from "react";
import { AlertTriangle, CheckCircle, Loader2 } from "lucide-react";
import { resolveGhostDispute } from "@/app/actions/resolve-dispute";
import { useRouter } from "next/navigation";
import type { Settlement } from "@/db/schema";

/** Phrases that indicate human agreement despite 'disputed' system status. */
const AGREEMENT_PHRASES = [
  "looks good",
  "approved",
  "confirmed",
  "lgtm",
  "all good",
  "agreed",
  "sign off",
  "signed off",
  "wire",
  "👍",
];

export function isGhostDispute(
  signoffText: string | null | undefined,
): boolean {
  if (!signoffText) return false;
  const lower = signoffText.toLowerCase().trim();
  if (lower.startsWith("ok")) return true;
  if (lower === "👍" || lower.startsWith("👍")) return true;
  return AGREEMENT_PHRASES.some((p) => lower.includes(p));
}

export function GhostDisputeBanner({
  settlement,
  showId,
}: {
  settlement: Settlement;
  showId: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [resolved, setResolved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDisputed = settlement.status === "disputed";
  const hasAgreement = isGhostDispute(settlement.signoffText);

  // Don't render server-side (avoids hydration mismatch)
  if (!mounted) return null;
  if (!isDisputed || !hasAgreement) return null;

  if (resolved) {
    return (
      <div className="mt-3 rounded-lg border border-brand-200/60 bg-brand-50/40 px-4 py-3.5 flex items-center gap-3">
        <CheckCircle className="h-4 w-4 text-brand-700 shrink-0" />
        <div className="text-[12.5px] text-brand-800 leading-relaxed">
          Status updated to{" "}
          <span className="font-semibold">Finalized</span> in the database.
          Reload the page to see the new status badge.
        </div>
        <button
          onClick={() => router.refresh()}
          className="ml-auto shrink-0 text-[11px] font-medium text-brand-700 hover:text-brand-800 underline"
        >
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-amber-200/60 bg-amber-50/40 px-4 py-3.5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-amber-900 leading-snug">
            Note indicates agreement. Resolve status to Finalized?
          </div>
          <p className="text-[12px] text-ink-700 mt-1 leading-relaxed">
            System shows{" "}
            <span className="font-semibold text-rose-700">Disputed</span>, but
            the sign-off field reads:{" "}
            <span className="italic text-ink-600">
              &ldquo;{settlement.signoffText}&rdquo;
            </span>{" "}
            — this is a Ghost Dispute.
          </p>

          {error && (
            <p className="text-[11px] text-rose-700 mt-1.5">{error}</p>
          )}

          <div className="mt-3">
            <button
              disabled={isPending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const result = await resolveGhostDispute(
                    settlement.id,
                    showId,
                  );
                  if (result.success) {
                    setResolved(true);
                  } else {
                    setError(result.error ?? "Failed to update. Try again.");
                  }
                });
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium bg-white ring-1 ring-amber-300/80 text-amber-900 hover:bg-amber-50 transition-colors disabled:opacity-60"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Updating database&hellip;
                </>
              ) : (
                "Resolve status to Finalized"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
