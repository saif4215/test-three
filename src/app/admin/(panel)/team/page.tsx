import { requireAdmin } from "@/lib/auth";
import { listAdmins } from "@/lib/admins";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES } from "@/lib/permissions";
import { getFeatures, getStoreSettings } from "@/lib/settings";
import { formatDateTime } from "@/lib/format";
import { AdminHeading, DataTable, Section, Td, Th } from "@/components/admin-ui";
import { ActionButton, ActionForm, SubmitButton } from "@/components/admin-forms";
import { Badge } from "@/components/ui";
import { addMemberAction, changeRoleAction, setActiveAction } from "./actions";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  const me = await requireAdmin("team.manage");
  const [members, features, settings] = await Promise.all([listAdmins(), getFeatures(), getStoreSettings()]);
  return (
    <>
      <AdminHeading title="Team">People who can sign in to this admin. Nobody can sign up on their own: an Owner adds them here.</AdminHeading>
      <Section title="Roles" id="roles">
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          {ROLES.map((r) => <div key={r}><dt className="font-semibold">{ROLE_LABELS[r]}</dt><dd className="text-muted">{ROLE_DESCRIPTIONS[r]}</dd></div>)}
        </dl>
      </Section>
      <Section title="Add a team member" id="add">
        <ActionForm action={addMemberAction} resetOnSuccess>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label htmlFor="m-name" className="label">Name</label><input id="m-name" name="name" maxLength={120} className="field" /></div>
            <div><label htmlFor="m-email" className="label">Email</label><input id="m-email" name="email" type="email" required maxLength={254} className="field" /></div>
            <div><label htmlFor="m-role" className="label">Role</label><select id="m-role" name="role" defaultValue="staff" className="field">{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></div>
            <div><label htmlFor="m-pw" className="label">Temporary password</label><input id="m-pw" name="password" type="text" required minLength={12} autoComplete="off" className="field" maxLength={200} /><p className="hint">At least 12 characters. They must replace it at first sign-in.</p></div>
          </div>
          {features.admin_google_sign_in ? <p className="hint">Staff Google sign-in is on: this person can also sign in with the Google account that uses this email.</p> : null}
          <SubmitButton pendingLabel="Adding…">Add team member</SubmitButton>
        </ActionForm>
      </Section>
      <DataTable caption="Team members">
        <thead><tr><Th>Person</Th><Th>Role</Th><Th>Last sign-in</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id}>
              <Td><span className="font-medium">{m.name || m.email}</span>{m.name ? <div className="text-xs text-muted">{m.email}</div> : null}{m.id === me.id ? <Badge>you</Badge> : null}</Td>
              <Td>
                <ActionForm action={changeRoleAction} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={m.id} />
                  <label className="sr-only" htmlFor={`r-${m.id}`}>Role for {m.email}</label>
                  <select id={`r-${m.id}`} name="role" defaultValue={m.role} className="field !min-h-9 !w-32 !py-1 !text-sm">{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select>
                  <SubmitButton className="btn-secondary btn-sm" pendingLabel="…">Set</SubmitButton>
                </ActionForm>
              </Td>
              <Td className="whitespace-nowrap text-muted">{m.last_login_at ? formatDateTime(m.last_login_at, settings.timezone) : "Never"}</Td>
              <Td><Badge tone={m.active ? "ok" : "neutral"}>{m.active ? "active" : "revoked"}</Badge></Td>
              <Td className="text-right">{m.id === me.id ? null : m.active ? <ActionButton action={setActiveAction} fields={{ id: m.id, active: "0" }} label="Revoke access" confirm={`Revoke access for ${m.email}? They will be signed out immediately.`} className="btn-danger btn-sm" /> : <ActionButton action={setActiveAction} fields={{ id: m.id, active: "1" }} label="Restore access" />}</Td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </>
  );
}
