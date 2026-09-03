/**
 * Shared Project View — Placeholder
 *
 * Role-agnostic project detail page.
 * Redirects or adapts based on user role.
 */

export default function ProjectPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    return (
        <main className="flex flex-1 flex-col px-6 py-8">
            <h1 className="text-2xl font-semibold">Project Overview</h1>
        </main>
    );
}
