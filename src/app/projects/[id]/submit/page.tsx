/**
 * Submission Page — Placeholder
 *
 * Freelancer submits deliverables for a project.
 */

export default function SubmitPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    return (
        <main className="flex flex-1 flex-col px-6 py-8">
            <h1 className="text-2xl font-semibold">Submit Work</h1>
        </main>
    );
}
