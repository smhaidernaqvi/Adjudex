/**
 * ProjectTimeline — Visual timeline of project state transitions
 */

import type { ProjectStatus } from "@/types";

interface ProjectTimelineProps {
  currentStatus: ProjectStatus;
}

export function ProjectTimeline({ currentStatus }: ProjectTimelineProps) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Project Timeline</p>
      <p className="text-sm text-zinc-500">
        Current status: {currentStatus.replace(/_/g, " ")}
      </p>
      {/* Timeline visualization will be implemented later */}
    </div>
  );
}
