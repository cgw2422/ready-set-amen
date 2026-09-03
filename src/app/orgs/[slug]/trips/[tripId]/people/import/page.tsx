import { requireTrip } from "@/lib/access";
import { googleSheetsTemplateUrl } from "@/lib/import/template";
import { ImportFlow } from "./import-flow";

export const dynamic = "force-dynamic";
export const metadata = { title: "Import people" };

/**
 * Importing is free. The ten-person limit is the only attendee boundary, and it
 * applies the same way here as it does to the Add Person form — the entry
 * method is never the paid part.
 */
export default async function ImportPeoplePage({
  params,
}: {
  params: Promise<{ slug: string; tripId: string }>;
}) {
  const { slug, tripId } = await params;
  await requireTrip(tripId);

  return (
    <ImportFlow slug={slug} tripId={tripId} googleSheetsUrl={googleSheetsTemplateUrl()} />
  );
}
