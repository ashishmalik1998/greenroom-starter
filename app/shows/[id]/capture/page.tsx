import { notFound } from "next/navigation";
import { getShowById } from "@/lib/queries";
import { ExpenseCapture } from "@/components/provenance/expense-capture";

/**
 * Component 3: Proactive Capture Entry Screen
 * Route: /shows/[id]/capture
 *
 * Mariana's Wednesday workflow — capture receipts during the week so the
 * 2am settlement ledger is already built. Mobile-friendly by design.
 */
export default async function CapturePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getShowById(id);
  if (!data) notFound();

  return (
    <ExpenseCapture
      showId={id}
      show={data.show}
      deal={data.deal}
      artist={data.artist}
    />
  );
}
