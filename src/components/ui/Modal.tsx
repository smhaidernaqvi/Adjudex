/**
 * Modal — Reusable UI component
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
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
    );
}
