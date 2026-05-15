"use server";

/**
 * Server action: resolve a ghost dispute by updating the settlement status
 * to "finalized" in the database. "finalized" is already a valid enum value
 * in the settlements table — no schema change required.
 *
 * This is invoked from the GhostDisputeBanner client component when Mariana
 * clicks "Resolve status to Finalized".
 */

import { db } from "@/db";
import { settlements } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function resolveGhostDispute(
  settlementId: string,
  showId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await db
      .update(settlements)
      .set({
        status: "finalized",
        finalizedAt: new Date(),
      })
      .where(eq(settlements.id, settlementId));

    // Revalidate both the show detail and settle pages so status badge
    // reflects the change immediately on next navigation.
    revalidatePath(`/shows/${showId}`);
    revalidatePath(`/shows/${showId}/settle`);
    revalidatePath("/reports");

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
