'use client';
import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { SelectInput } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import type { Role } from '@/lib/types';
import { ROLE_LABEL } from '@/lib/rbac';
import { changeRole, suspendMembership, reactivateMembership, removeMembership } from './actions';

export function MembershipRow({
  membershipId,
  initialRole,
  disabled,
}: {
  membershipId: string;
  initialRole: Role;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [role, setRole] = React.useState<Role>(initialRole);
  const [busy, setBusy] = React.useState(false);

  async function update(next: Role) {
    setBusy(true);
    const r = await changeRole(membershipId, next);
    setBusy(false);
    if (r?.error) {
      toast.error(r.error);
      setRole(initialRole);
      return;
    }
    setRole(next);
    toast.success(`Role updated to ${ROLE_LABEL[next]}`);
    router.refresh();
  }

  return (
    <SelectInput
      value={role}
      onValueChange={(v) => update(v as Role)}
      options={[
        { value: 'ROOT_ADMIN', label: ROLE_LABEL.ROOT_ADMIN },
        { value: 'MANAGER', label: ROLE_LABEL.MANAGER },
        { value: 'INVENTORY', label: ROLE_LABEL.INVENTORY },
        { value: 'SALES_AGENT', label: ROLE_LABEL.SALES_AGENT },
        { value: 'VIEWER', label: ROLE_LABEL.VIEWER },
      ]}
      disabled={disabled || busy}
      className="min-w-[10rem]"
    />
  );
}

export function MembershipRowActions({
  membershipId,
  active,
  self,
}: {
  membershipId: string;
  active: boolean;
  self: boolean;
}) {
  const router = useRouter();
  async function suspend() {
    const r = await suspendMembership(membershipId);
    if (r?.error) return toast.error(r.error);
    toast.success('Suspended');
    router.refresh();
  }
  async function reactivate() {
    const r = await reactivateMembership(membershipId);
    if (r?.error) return toast.error(r.error);
    toast.success('Reactivated');
    router.refresh();
  }
  async function remove() {
    if (!confirm('Remove this person from the store?')) return;
    const r = await removeMembership(membershipId);
    if (r?.error) return toast.error(r.error);
    toast.success('Removed');
    router.refresh();
  }
  if (self) return <span className="text-xs text-muted-foreground">— can't modify yourself —</span>;
  return (
    <div className="flex justify-end gap-1">
      {active ? (
        <Button size="sm" variant="ghost" onClick={suspend}>Suspend</Button>
      ) : (
        <Button size="sm" variant="ghost" onClick={reactivate}>Reactivate</Button>
      )}
      <Button size="sm" variant="ghost" className="text-destructive" onClick={remove}>Remove</Button>
    </div>
  );
};
