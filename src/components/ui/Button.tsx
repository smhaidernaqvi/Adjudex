/**
 * Button — Reusable UI component
 */

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "primary" | "secondary" | "danger";
    children: React.ReactNode;
}

export function Button({
    variant = "primary",
    children,
    className = "",
    ...props
}: ButtonProps) {
    const base =
        "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50";
    const variants = {
        primary: "bg-blue-600 text-white hover:bg-blue-700",
        secondary: "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50",
        danger: "bg-red-600 text-white hover:bg-red-700",
    };

    return (
        <button className={`${base} ${variants[variant]} ${className}`} {...props}>
            {children}
        </button>
    );
}
