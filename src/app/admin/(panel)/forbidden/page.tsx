import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { AdminHeading } from "@/components/admin-ui";

export default async function ForbiddenPage() {
  await requireAdmin();
  return (
    <>
      <AdminHeading title="You don’t have access to that">Your role doesn’t include this area. Ask an Owner if you need it.</AdminHeading>
      <Link href="/admin" className="btn-primary">Back to the dashboard</Link>
    </>
  );
}
