import "server-only";
import { env } from "../env";
import { hmac, safeEqual } from "../crypto";

/**
 * Customers track an order with its number plus a private code. The code is not stored: it is recomputed from the
 * order id with the server's secret, so it cannot be guessed from the order number and a leak of the database
 * does not reveal anyone's tracking links.
 */
export function deriveTrackingCode(orderId: string): string {
  return hmac(`track:${orderId}`).replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(0, 20);
}

export function verifyTrackingCode(orderId: string, code: string): boolean {
  return safeEqual(deriveTrackingCode(orderId), code.trim().toLowerCase());
}

export const trackingPath = (orderNumber: string, orderId: string) => `/track/${encodeURIComponent(orderNumber)}?code=${deriveTrackingCode(orderId)}`;
export const trackingUrl = (orderNumber: string, orderId: string) => `${env.appUrl}${trackingPath(orderNumber, orderId)}`;
