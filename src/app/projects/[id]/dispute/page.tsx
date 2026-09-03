/**
 * Dispute Page — Placeholder
 *
 * Allows raising, viewing, and managing disputes for a project.
 */

export default function DisputePage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    return (
        <main className="flex flex-1 flex-col px-6 py-8">
            <h1 className="text-2xl font-semibold">Dispute Management</h1>
        </main>
    );
}
