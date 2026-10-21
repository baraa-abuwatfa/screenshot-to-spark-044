const styles: Record<string, string> = {
  pending: "bg-status-pending",
  processing: "bg-status-processing",
  completed: "bg-status-completed",
  failed: "bg-status-failed",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize text-foreground ${styles[status] ?? "bg-muted"}`}
    >
      {status}
    </span>
  );
}
