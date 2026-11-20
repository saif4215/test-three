import "server-only";
import { sendEmail } from "../email";
import { orderReceivedEmail, orderStatusEmail, staffOrderAlertEmail } from "../email-templates";
import { loadStoreSettings } from "../settings";
import { getOrder } from "./queries";
import type { OrderStatus } from "./status";

/** Emails after an order is placed: a receipt to the customer and an alert to the staff addresses the owner chose. Best effort. */
export async function notifyOrderPlaced(orderId: string): Promise<void> {
  try {
    const found = await getOrder(orderId);
    if (!found) return;
    const { order, items } = found;
    const customer = await orderReceivedEmail(order, items);
    await sendEmail({ to: order.customer_email, ...customer, template: "order_received", orderId });
    const settings = await loadStoreSettings();
    if (settings.orderAlertEmails.length) {
      const alert = await staffOrderAlertEmail(order, items);
      for (const to of settings.orderAlertEmails) await sendEmail({ to, ...alert, template: "staff_alert", orderId });
    }
  } catch (e) {
    console.error("[notify] order placed emails failed", (e as Error).message);
  }
}

const EMAILED: OrderStatus[] = ["confirmed", "ready", "completed", "cancelled"];

export async function notifyCustomerOfStatus(orderId: string, status: OrderStatus, note: string): Promise<void> {
  if (!EMAILED.includes(status)) return;
  try {
    const found = await getOrder(orderId);
    if (!found) return;
    const mail = await orderStatusEmail(found.order, found.items, status, note);
    await sendEmail({ to: found.order.customer_email, ...mail, template: `order_${status}`, orderId });
  } catch (e) {
    console.error("[notify] status email failed", (e as Error).message);
  }
}
