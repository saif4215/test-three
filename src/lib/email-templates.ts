import "server-only";
import { env } from "./env";
import { escapeHtml, formatMoney } from "./util";
import { loadStoreSettings } from "./settings";
import { readableInk } from "./theme";
import { STATUS_EXPLAINERS, STATUS_LABELS, type OrderStatus } from "./orders/status";
import { trackingUrl } from "./orders/tracking-code";
import type { OrderItemRow, OrderRow } from "./orders/queries";

export interface Email {
  subject: string;
  text: string;
  html: string;
}

interface Layout {
  heading: string;
  bodyHtml: string;
  bodyText: string;
  cta?: { label: string; url: string };
  footerNote?: string;
}

async function layout(l: Layout): Promise<{ html: string; text: string }> {
  const s = await loadStoreSettings();
  const ink = readableInk(s.brandPrimary);
  const org = s.orgName.trim().toLowerCase() === s.storeName.trim().toLowerCase() ? "" : s.orgName;
  const button = l.cta
    ? `<p style="margin:24px 0 8px"><a href="${escapeHtml(l.cta.url)}" style="display:inline-block;background:${s.brandPrimary};color:${ink};text-decoration:none;font-weight:bold;padding:13px 26px;border-radius:999px">${escapeHtml(l.cta.label)}</a></p>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:Helvetica,Arial,sans-serif;color:#111">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff">
<tr><td style="background:${s.brandPrimary};color:${ink};padding:22px 28px;font-size:24px;font-weight:bold;letter-spacing:-0.5px">${escapeHtml(s.storeName)}</td></tr>
<tr><td style="padding:30px 28px"><h1 style="margin:0 0 18px;font-size:24px;line-height:1.2">${escapeHtml(l.heading)}</h1>${l.bodyHtml}${button}</td></tr>
<tr><td style="padding:18px 28px;background:#fafafa;color:#707072;font-size:12px;line-height:1.5">${l.footerNote ? `${escapeHtml(l.footerNote)}${org ? "<br>" : ""}` : ""}${escapeHtml(org)}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [s.storeName, "", l.heading, "", l.bodyText, l.cta ? `\n${l.cta.label}: ${l.cta.url}` : "", "", l.footerNote ?? "", org].join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { html, text };
}

function itemsTable(order: OrderRow, items: OrderItemRow[]) {
  const rows = items
    .map(
      (i) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #e5e5e5">${i.quantity} × ${escapeHtml(i.product_name)}${i.variant_label ? ` <span style="color:#707072">(${escapeHtml(i.variant_label)})</span>` : ""}</td><td align="right" style="padding:8px 0;border-bottom:1px solid #e5e5e5">${formatMoney(i.unit_price_cents * i.quantity)}</td></tr>`,
    )
    .join("");
  const extra = (label: string, v: string) => `<tr><td style="padding:6px 0;color:#707072">${label}</td><td align="right" style="padding:6px 0">${v}</td></tr>`;
  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin:16px 0">${rows}
${order.discount_cents > 0 ? extra("Discount", `−${formatMoney(order.discount_cents)}`) : ""}${order.fulfillment_fee_cents > 0 ? extra(escapeHtml(order.fulfillment_label || "Fees"), formatMoney(order.fulfillment_fee_cents)) : ""}
<tr><td style="padding:10px 0;font-weight:bold">Total</td><td align="right" style="padding:10px 0;font-weight:bold">${formatMoney(order.total_cents)}</td></tr></table>`;
  const text = [
    ...items.map((i) => `  ${i.quantity} x ${i.product_name}${i.variant_label ? ` (${i.variant_label})` : ""}  ${formatMoney(i.unit_price_cents * i.quantity)}`),
    order.discount_cents > 0 ? `  Discount  -${formatMoney(order.discount_cents)}` : "",
    order.fulfillment_fee_cents > 0 ? `  ${order.fulfillment_label || "Fees"}  ${formatMoney(order.fulfillment_fee_cents)}` : "",
    `  Total  ${formatMoney(order.total_cents)}`,
  ].filter(Boolean).join("\n");
  return { html, text };
}

const studentsLine = (o: OrderRow) => (o.students.length ? `For: ${o.students.map((s) => `${s.name} (${s.grade})`).join(", ")}` : "");

export async function orderReceivedEmail(order: OrderRow, items: OrderItemRow[]): Promise<Email> {
  const url = trackingUrl(order.order_number, order.id);
  const t = itemsTable(order, items);
  const request = order.mode === "request";
  const intro = request
    ? "Thanks! We’ve received your order request. It is <strong>not confirmed yet</strong> and you have not been charged online. We’ll email you when we accept it."
    : "Thanks! We’ve received your order and your payment is being processed. We’ll email you when it’s confirmed.";
  const introText = request
    ? "Thanks! We’ve received your order request. It is NOT confirmed yet and you have not been charged online. We’ll email you when we accept it."
    : "Thanks! We’ve received your order and your payment is being processed. We’ll email you when it’s confirmed.";
  const meta = [order.fulfillment_label ? `Receiving: ${order.fulfillment_label}` : "", studentsLine(order)].filter(Boolean);
  const { html, text } = await layout({
    heading: request ? "We’ve got your order request" : "We’ve got your order",
    bodyHtml: `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">${intro}</p><p style="margin:0 0 4px;font-size:14px;color:#707072">Order number</p><p style="margin:0 0 8px;font-size:18px;font-weight:bold">${escapeHtml(order.order_number)}</p>${meta.map((m) => `<p style="margin:0 0 4px;font-size:14px">${escapeHtml(m)}</p>`).join("")}${t.html}`,
    bodyText: `${introText}\n\nOrder number: ${order.order_number}\n${meta.join("\n")}\n\n${t.text}`,
    cta: { label: "Track your order", url },
    footerNote: "This link is private to you. Anyone who has it can see this order’s status.",
  });
  return { subject: `${request ? "Order request received" : "Order received"}: ${order.order_number}`, html, text };
}

export async function orderStatusEmail(order: OrderRow, items: OrderItemRow[], status: OrderStatus, note: string): Promise<Email> {
  const url = trackingUrl(order.order_number, order.id);
  const t = itemsTable(order, items);
  const label = STATUS_LABELS[status];
  const line = STATUS_EXPLAINERS[status];
  const noteHtml = note.trim() ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.5"><strong>Note from us:</strong> ${escapeHtml(note.trim())}</p>` : "";
  const { html, text } = await layout({
    heading: `Your order is ${label.toLowerCase()}`,
    bodyHtml: `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">${escapeHtml(line)}</p>${noteHtml}<p style="margin:0 0 4px;font-size:14px;color:#707072">Order number</p><p style="margin:0 0 8px;font-size:18px;font-weight:bold">${escapeHtml(order.order_number)}</p>${t.html}`,
    bodyText: `${line}\n${note.trim() ? `\nNote from us: ${note.trim()}\n` : ""}\nOrder number: ${order.order_number}\n\n${t.text}`,
    cta: { label: "View your order", url },
  });
  return { subject: `Order ${order.order_number}: ${label}`, html, text };
}

export async function staffOrderAlertEmail(order: OrderRow, items: OrderItemRow[]): Promise<Email> {
  const t = itemsTable(order, items);
  const url = `${env.appUrl}/admin/orders/${order.id}`;
  const who = `${order.customer_name} <${order.customer_email}>${order.customer_phone ? `, ${order.customer_phone}` : ""}`;
  const { html, text } = await layout({
    heading: order.mode === "request" ? "New order request" : "New online order",
    bodyHtml: `<p style="margin:0 0 8px;font-size:15px"><strong>${escapeHtml(order.order_number)}</strong> from ${escapeHtml(who)}</p>${studentsLine(order) ? `<p style="margin:0 0 8px;font-size:14px">${escapeHtml(studentsLine(order))}</p>` : ""}${order.notes ? `<p style="margin:0 0 8px;font-size:14px">Notes: ${escapeHtml(order.notes)}</p>` : ""}${t.html}`,
    bodyText: `${order.order_number} from ${who}\n${studentsLine(order)}\n${order.notes ? `Notes: ${order.notes}\n` : ""}\n${t.text}`,
    cta: { label: "Open in admin", url },
  });
  return { subject: `New ${order.mode === "request" ? "order request" : "online order"}: ${order.order_number}`, html, text };
}

export async function restockVerifyEmail(productName: string, variantLabel: string, verifyUrl: string): Promise<Email> {
  const what = `${productName}${variantLabel ? ` (${variantLabel})` : ""}`;
  const { html, text } = await layout({
    heading: "Confirm your back-in-stock alert",
    bodyHtml: `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">Someone (we hope you) asked to be emailed when <strong>${escapeHtml(what)}</strong> is back in stock. Confirm below and we’ll send you one email when it is.</p>`,
    bodyText: `Someone (we hope you) asked to be emailed when ${what} is back in stock. Confirm and we’ll send you one email when it is.`,
    cta: { label: "Confirm my alert", url: verifyUrl },
    footerNote: "If this wasn’t you, ignore this email and nothing will happen.",
  });
  return { subject: `Confirm your alert for ${productName}`, html, text };
}

export async function restockAvailableEmail(productName: string, variantLabel: string, productUrl: string, unsubscribeUrl: string): Promise<Email> {
  const what = `${productName}${variantLabel ? ` (${variantLabel})` : ""}`;
  const { html, text } = await layout({
    heading: "It’s back in stock",
    bodyHtml: `<p style="margin:0 0 12px;font-size:15px;line-height:1.5"><strong>${escapeHtml(what)}</strong> is available again. Stock can go quickly.</p><p style="margin:0;font-size:12px;color:#707072"><a href="${escapeHtml(unsubscribeUrl)}" style="color:#707072">Don’t email me about this again</a></p>`,
    bodyText: `${what} is available again.\n\nDon't want these? ${unsubscribeUrl}`,
    cta: { label: "Shop now", url: productUrl },
    footerNote: "You’re getting this one email because you asked for it. We won’t send more about this item.",
  });
  return { subject: `Back in stock: ${productName}`, html, text };
}

export async function passwordResetEmail(name: string, url: string): Promise<Email> {
  const { html, text } = await layout({
    heading: "Reset your password",
    bodyHtml: `<p style="margin:0 0 12px;font-size:15px;line-height:1.5">Hi${name ? ` ${escapeHtml(name)}` : ""}, use the button below to choose a new password. The link works once and expires in one hour.</p>`,
    bodyText: `Hi${name ? ` ${name}` : ""}, use this link to choose a new password. It works once and expires in one hour.`,
    cta: { label: "Choose a new password", url },
    footerNote: "If you didn’t ask for this, ignore this email: your password has not changed.",
  });
  return { subject: "Reset your password", html, text };
}

export async function testEmail(): Promise<Email> {
  const { html, text } = await layout({
    heading: "Email is working",
    bodyHtml: `<p style="margin:0;font-size:15px;line-height:1.5">This is a test message from the store. If you can read it, order emails will reach customers.</p>`,
    bodyText: "This is a test message from the store. If you can read it, order emails will reach customers.",
  });
  return { subject: "Store email test", html, text };
}
