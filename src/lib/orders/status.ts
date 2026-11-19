/** Order statuses and the moves between them. Pure, so the shop, the emails and the admin always agree. */
export type OrderStatus = "pending" | "awaiting_payment" | "confirmed" | "ready" | "completed" | "cancelled";
export type OrderMode = "request" | "online";

export const ORDER_STATUSES: OrderStatus[] = ["pending", "awaiting_payment", "confirmed", "ready", "completed", "cancelled"];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Request received",
  awaiting_payment: "Awaiting payment",
  confirmed: "Confirmed",
  ready: "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** What the customer is told at each step (never promises more than has happened). */
export const STATUS_EXPLAINERS: Record<OrderStatus, string> = {
  pending: "We have your request. It is not confirmed until we accept it, and you have not been charged online.",
  awaiting_payment: "We are waiting for your card payment to finish. The order is confirmed once the payment succeeds.",
  confirmed: "Your order is confirmed.",
  ready: "Your order is ready.",
  completed: "Your order is complete.",
  cancelled: "This order was cancelled.",
};

const NEXT: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  awaiting_payment: ["confirmed", "cancelled"],
  confirmed: ["ready", "completed", "cancelled"],
  ready: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export const allowedNext = (from: OrderStatus): OrderStatus[] => NEXT[from];
export const canMove = (from: OrderStatus, to: OrderStatus): boolean => NEXT[from].includes(to);
/** Statuses where the items are still held for the customer (stock is reserved). */
export const HOLDS_STOCK: OrderStatus[] = ["pending", "awaiting_payment", "confirmed", "ready", "completed"];
/** Orders that count as real sales in reports (a request that was never accepted is not a sale). */
export const SALE_STATUSES: OrderStatus[] = ["confirmed", "ready", "completed"];
export const OPEN_STATUSES: OrderStatus[] = ["pending", "awaiting_payment", "confirmed", "ready"];

export const isOrderStatus = (s: unknown): s is OrderStatus => typeof s === "string" && (ORDER_STATUSES as string[]).includes(s);
