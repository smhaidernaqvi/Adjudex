/**
 * Modal — Reusable UI component
 *
 * The outer layer scrolls and the centring layer uses `min-h-full`, so a dialog
 * taller than the viewport (the change-proposal form, which embeds the whole AI
 * requirement refiner) stays fully reachable instead of being clipped with its
 * primary action buttons below the fold. Short dialogs still centre as before.
 */

interface ModalProps {
    open: boolean;
    onClose: () => void;
    title?: string;
    children: React.ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
            <div className="flex min-h-full items-center justify-center">
                <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-surface p-6 shadow-xl">
                    {title && (
                        <h2 className="mb-4 text-lg font-semibold">{title}</h2>
                    )}
                    {children}
                    <button
                        onClick={onClose}
                        className="mt-4 text-sm text-zinc-500 hover:text-zinc-700"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
