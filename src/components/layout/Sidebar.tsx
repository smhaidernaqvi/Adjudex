/**
 * Sidebar — Side navigation for dashboards
 */

interface SidebarProps {
  children?: React.ReactNode;
}

export function Sidebar({ children }: SidebarProps) {
  return (
    <aside className="flex w-56 flex-col border-r border-zinc-200 bg-zinc-50 p-4">
      {/* Navigation items will be added based on context */}
      {children}
    </aside>
  );
}
