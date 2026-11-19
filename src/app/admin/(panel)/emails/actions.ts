"use server";

import { revalidatePath } from "next/cache";
import { adminAction, type ActionState } from "@/lib/actions";
import { retryFailedEmails } from "@/lib/email";

export async function retryEmailsAction(): Promise<ActionState> {
  const res = await adminAction("settings.manage", async () => {
    const n = await retryFailedEmails();
    return n ? `${n} email${n === 1 ? "" : "s"} delivered on retry.` : "Nothing was delivered. Check the error messages below.";
  });
  revalidatePath("/admin/emails");
  return res;
}
