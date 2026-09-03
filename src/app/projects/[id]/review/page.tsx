/**
 * Client Review Page — Placeholder
 *
 * Client reviews submitted work with controlled preview,
 * AI verification results, and approve/reject actions.
 */

export default function ReviewPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    return (
        <main className="flex flex-1 flex-col px-6 py-8">
            <h1 className="text-2xl font-semibold">Review Submission</h1>
        </main>
    );
}
