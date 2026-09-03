/**
 * DeliverablePreview — Controlled preview of submitted deliverable
 *
 * Will show a watermarked or restricted preview until client approves.
 */

export function DeliverablePreview() {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4">
      <p className="text-sm font-medium">Deliverable Preview</p>
      <p className="text-sm text-zinc-500">
        Preview will be shown here with controlled access.
      </p>
    </div>
  );
}
