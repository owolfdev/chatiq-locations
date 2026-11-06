import Link from "next/link";

type Props = {
  searchParams: Promise<{ place_id?: string }>;
};

/**
 * Placeholder mapper shell — full capture UI lands in Phase 1b.
 * ChatIQ "Open store mapper" deep-links here with ?place_id=.
 */
export default async function MapPlaceholderPage({ searchParams }: Props) {
  const params = await searchParams;
  const placeId = params.place_id?.trim() || null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col gap-4 px-6 py-16">
      <p className="text-sm uppercase tracking-wide text-zinc-500">
        chatiq-locations
      </p>
      <h1 className="text-3xl font-semibold tracking-tight">Store mapper</h1>
      <p className="text-sm text-zinc-600">
        Capture UI (text / camera / compass) is next. This page confirms the
        ChatIQ → sibling handoff.
      </p>
      {placeId ? (
        <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-800">
          place_id={placeId}
        </p>
      ) : (
        <p className="text-sm text-amber-700">
          No place_id in the URL. Bind a place on the bot in ChatIQ, then open
          the mapper again.
        </p>
      )}
      <Link
        href="/api/health"
        className="text-sm text-zinc-500 underline underline-offset-2"
      >
        Health check
      </Link>
    </main>
  );
}
