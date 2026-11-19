"use server";

import { redirect } from "next/navigation";
import { deleteCustomer, endCustomerSession, getCustomer } from "@/lib/customers";

export async function customerSignOutAction(): Promise<void> {
  await endCustomerSession();
  redirect("/");
}

/** Removes the sign-in record and its sessions. Orders stay with the store (it needs them) but are no longer linked to the person. */
export async function deleteAccountAction(): Promise<void> {
  const c = await getCustomer();
  if (c) {
    await deleteCustomer(c.id);
    await endCustomerSession();
  }
  redirect("/?account=deleted");
}
