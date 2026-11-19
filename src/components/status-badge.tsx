import { STATUS_LABELS, type OrderStatus } from "@/lib/orders/status";
import { Badge } from "./ui";

export const statusTone = (s: string) => (s === "cancelled" ? "danger" : s === "pending" || s === "awaiting_payment" ? "warn" : s === "completed" ? "neutral" : "ok") as "danger" | "warn" | "neutral" | "ok";

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={statusTone(status)}>{STATUS_LABELS[status]}</Badge>;
}
