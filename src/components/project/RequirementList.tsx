/**
 * RequirementList — Displays a list of project requirements
 */

import { RequirementItem } from "./RequirementItem";
import type { Requirement } from "@/types";

interface RequirementListProps {
    requirements: Requirement[];
}

export function RequirementList({ requirements }: RequirementListProps) {
    return (
        <ul className="flex flex-col gap-2">
            {requirements.map((req) => (
                <RequirementItem key={req.id} requirement={req} />
            ))}
        </ul>
    );
}
