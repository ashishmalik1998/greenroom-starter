/**
 * Server-side query helpers.
 */

import { db } from "@/db";
import {
  shows,
  artists,
  agents,
  agencies,
  deals,
  ticketSales,
  comps,
  expenses,
  settlements,
  venues,
  type Recoup,
} from "@/db/schema";
import { desc, asc, eq, sql, lte } from "drizzle-orm";

/**
 * Returns true when a settlement shows status='disputed' but the signoff text
 * contains language that indicates the artist team has actually agreed.
 * These are "ghost disputes" — stuck in the wrong system state.
 */
export function isGhostDisputeSignoff(
  signoffText: string | null | undefined,
): boolean {
  if (!signoffText) return false;
  const lower = signoffText.toLowerCase().trim();
  // "ok" at the start is an unambiguous positive ("ok wire monday", "OK — but...")
  if (lower.startsWith("ok")) return true;
  // Emoji thumbs-up
  if (lower === "👍" || lower.startsWith("👍")) return true;
  const phrases = [
    "looks good",
    "approved",
    "confirmed",
    "lgtm",
    "all good",
    "agreed",
    "sign off",
    "signed off",
    "wire",
  ];
  return phrases.some((p) => lower.includes(p));
}

function todayDateString(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export async function getAllShows() {
  return db
    .select({
      show: shows,
      artist: artists,
      agent: agents,
      deal: deals,
      settlement: settlements,
    })
    .from(shows)
    .leftJoin(artists, eq(shows.artistId, artists.id))
    .leftJoin(agents, eq(artists.agentId, agents.id))
    .leftJoin(deals, eq(deals.showId, shows.id))
    .leftJoin(settlements, eq(settlements.showId, shows.id))
    .where(lte(shows.date, todayDateString()))
    .orderBy(asc(shows.date));
}

export async function getShowById(id: string) {
  const rows = await db
    .select({
      show: shows,
      artist: artists,
      agent: agents,
      agency: agencies,
      deal: deals,
      settlement: settlements,
      venue: venues,
    })
    .from(shows)
    .leftJoin(artists, eq(shows.artistId, artists.id))
    .leftJoin(agents, eq(artists.agentId, agents.id))
    .leftJoin(agencies, eq(agents.agencyId, agencies.id))
    .leftJoin(deals, eq(deals.showId, shows.id))
    .leftJoin(settlements, eq(settlements.showId, shows.id))
    .leftJoin(venues, eq(shows.venueId, venues.id))
    .where(eq(shows.id, id));

  if (rows.length === 0) return null;
  const row = rows[0];

  const [showTicketSales, showExpenses, showComps] = await Promise.all([
    db
      .select()
      .from(ticketSales)
      .where(eq(ticketSales.showId, id))
      .orderBy(desc(ticketSales.capturedAt)),
    db
      .select()
      .from(expenses)
      .where(eq(expenses.showId, id))
      .orderBy(asc(expenses.enteredAt)),
    db.select().from(comps).where(eq(comps.showId, id)),
  ]);

  let recoups: Recoup[] = [];
  if (row.settlement?.recoupsJson) {
    try {
      const parsed = JSON.parse(row.settlement.recoupsJson);
      if (Array.isArray(parsed)) recoups = parsed;
    } catch {
      // Malformed JSON — ignore
    }
  }

  return {
    ...row,
    ticketSales: showTicketSales,
    expenses: showExpenses,
    comps: showComps,
    recoups,
  };
}

export type ShowWithRelations = NonNullable<
  Awaited<ReturnType<typeof getShowById>>
>;

/** All artists with show counts. */
export async function getAllArtists() {
  return db
    .select({
      artist: artists,
      agent: agents,
      agency: agencies,
      showCount: sql<number>`count(${shows.id})`.as("show_count"),
      lastShowDate: sql<string | null>`max(${shows.date})`.as("last_show_date"),
    })
    .from(artists)
    .leftJoin(agents, eq(artists.agentId, agents.id))
    .leftJoin(agencies, eq(agents.agencyId, agencies.id))
    .leftJoin(shows, eq(shows.artistId, artists.id))
    .groupBy(artists.id, agents.id, agencies.id)
    .orderBy(desc(sql`count(${shows.id})`), asc(artists.name));
}

/** Aggregates for the reports page. */
export async function getReports() {
  const today = todayDateString();

  const allShowsRows = await db.select().from(shows);
  const pastShowIds = new Set(
    allShowsRows.filter((s) => s.date <= today).map((s) => s.id),
  );

  const allDealsRows = await db.select().from(deals);
  const pastDeals = allDealsRows.filter((d) => pastShowIds.has(d.showId));

  const allSettlementsRows = await db.select().from(settlements);
  const pastSettlements = allSettlementsRows.filter((s) =>
    pastShowIds.has(s.showId),
  );

  const allCompsRows = await db.select().from(comps);
  const pastComps = allCompsRows.filter((c) => pastShowIds.has(c.showId));

  const dealTypeCounts: Record<string, number> = {};
  for (const d of pastDeals) {
    dealTypeCounts[d.dealType] = (dealTypeCounts[d.dealType] ?? 0) + 1;
  }

  const totalDeals = pastDeals.length;
  const supportedTypes = ["flat", "percentage_of_gross"];
  const supportedCount = pastDeals.filter((d) =>
    supportedTypes.includes(d.dealType),
  ).length;
  const inAppToolUsageRate = totalDeals > 0 ? supportedCount / totalDeals : 0;

  const settlementStatus: Record<string, number> = {};
  for (const s of pastSettlements) {
    settlementStatus[s.status] = (settlementStatus[s.status] ?? 0) + 1;
  }

  const totalSettlements = pastSettlements.length;
  const disputedRate =
    totalSettlements > 0
      ? (settlementStatus.disputed ?? 0) / totalSettlements
      : 0;

  const totalGross = pastSettlements.reduce(
    (sum, s) => sum + (s.grossBoxOffice ?? 0),
    0,
  );
  const totalToArtists = pastSettlements.reduce(
    (sum, s) => sum + (s.totalToArtist ?? 0),
    0,
  );

  const showCount = pastShowIds.size;
  const settledCount = pastShowIds.size;

  // Bonuses
  const dealsWithBonuses = pastDeals.filter((d) => d.bonusesJson).length;

  // Recoups
  let totalRecoupValue = 0;
  let disputedRecoupValue = 0;
  let settlementsWithRecoups = 0;
  for (const s of pastSettlements) {
    if (!s.recoupsJson) continue;
    try {
      const recoups = JSON.parse(s.recoupsJson) as Recoup[];
      if (!Array.isArray(recoups) || recoups.length === 0) continue;
      settlementsWithRecoups++;
      for (const r of recoups) {
        totalRecoupValue += r.amount;
        if (r.status === "disputed") disputedRecoupValue += r.amount;
      }
    } catch {
      // skip
    }
  }

  // Comps
  const totalCompTickets = pastComps.reduce((s, c) => s + c.count, 0);
  const totalCompFaceValue = pastComps.reduce(
    (s, c) => s + c.count * c.faceValue,
    0,
  );
  const compsByCategory: Record<string, number> = {};
  for (const c of pastComps) {
    compsByCategory[c.category] = (compsByCategory[c.category] ?? 0) + c.count;
  }

  // Ghost disputes: status='disputed' but signoff text indicates human agreement.
  // These settlements are stuck in a false-disputed state — the artist team has
  // already agreed, but the system hasn't been updated to reflect it.
  const ghostDisputeSettlements = pastSettlements.filter(
    (s) => s.status === "disputed" && isGhostDisputeSignoff(s.signoffText),
  );
  const ghostDisputeCount = ghostDisputeSettlements.length;
  // Value at risk: sum of totalToArtist for these stuck settlements
  const ghostDisputeValue = ghostDisputeSettlements.reduce(
    (sum, s) => sum + (s.totalToArtist ?? 0),
    0,
  );

  return {
    dealTypeCounts,
    totalDeals,
    inAppToolUsageRate,
    settlementStatus,
    totalSettlements,
    disputedRate,
    totalGross,
    totalToArtists,
    showCount,
    settledCount,
    dealsWithBonuses,
    totalRecoupValue,
    disputedRecoupValue,
    settlementsWithRecoups,
    totalCompTickets,
    totalCompFaceValue,
    compsByCategory,
    ghostDisputeCount,
    ghostDisputeValue,
  };
}

export type Reports = Awaited<ReturnType<typeof getReports>>;
