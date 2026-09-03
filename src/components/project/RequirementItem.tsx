/**
 * RequirementItem — Single requirement display
 */

import type { Requirement } from "@/types";

interface RequirementItemProps {
  requirement: Requirement;
}

export function RequirementItem({ requirement }: RequirementItemProps) {
  return (
    <li className="flex items-start gap-2 rounded border border-zinc-200 p-3 text-sm">
      <span>{requirement.title}</span>
      {requirement.isRequired && (
        <span className="text-xs text-red-500">Required</span>
      )}
    </li>
  );
}
