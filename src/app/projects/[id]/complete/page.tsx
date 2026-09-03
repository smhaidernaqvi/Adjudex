/**
 * Project Completed — Placeholder
 *
 * Confirmation page shown after a project is fully completed,
 * payment released, and final deliverable unlocked.
 */

export default function CompletePage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    return (
        <main className="flex flex-1 flex-col px-6 py-8">
            <h1 className="text-2xl font-semibold">Project Completed</h1>
        </main>
    );
}
