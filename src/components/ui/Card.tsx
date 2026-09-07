/**
 * Card — Reusable UI component
 */

interface CardProps {
    children: React.ReactNode;
    className?: string;
}

export function Card({ children, className = "" }: CardProps) {
    return (
        <div
            className={`rounded-lg border border-zinc-200 bg-surface p-4 shadow-sm ${className}`}
        >
            {children}
        </div>
    );
}
