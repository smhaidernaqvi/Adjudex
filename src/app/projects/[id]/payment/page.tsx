/**
 * Escrow / Payment Status — Placeholder
 *
 * Displays payment lock status, escrow details, and transaction history.
 */

export default function PaymentPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    return (
        <main className="flex flex-1 flex-col px-6 py-8">
            <h1 className="text-2xl font-semibold">Payment &amp; Escrow Status</h1>
        </main>
    );
}
