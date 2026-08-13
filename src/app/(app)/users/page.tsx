import { redirect } from 'next/navigation';
import { isRootUser, requireActiveStore, can } from '@/lib/auth/guards';
import { Permission, ROLES, ROLE_LABEL, ROLE_DESCRIPTION } from '@/lib/rbac';
import { membershipsRepo } from '@/lib/db/repositories/memberships.repo';
import { usersRepo } from '@/lib/db/repositories/users.repo';
import { storesRepo } from '@/lib/db/repositories/stores.repo';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { MembershipRow, MembershipRowActions } from './membership-row';
import { AddStaffDialog } from './add-staff-dialog';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react';
import Link from 'next/link';

const PAGE_SIZE = 10;

interface PageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function UsersPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page || '1', 10) || 1);

  const { storeId, role, session } = await requireActiveStore();
  if (!can(role, Permission.UsersManage)) redirect('/dashboard');

  const store = storesRepo.byId(storeId)!;
  const memberships = membershipsRepo.forStore(storeId);
  const userIds = memberships.map((m) => m.userId);
  const allUsers = userIds
    .map((id) => usersRepo.byId(id))
    .filter((u): u is NonNullable<ReturnType<typeof usersRepo.byId>> => !!u);

  const total = allUsers.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = allUsers.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const actorIsRoot = await isRootUser(session);
  const availableRoles = ROLES.filter((r) => !(r === 'ROOT_ADMIN' && !actorIsRoot));

  return (
    <div>
      <PageHeader
        title="Staff & roles"
        description={
          <>
            Manage who has access to <strong>{store.name}</strong> and what they can do.
          </>
        }
        actions={<AddStaffDialog storeId={storeId} availableRoles={availableRoles} />}
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{total} member{total === 1 ? '' : 's'}</CardTitle>
          <CardDescription>Change a person's role to give them more or fewer permissions.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {paged.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<Users className="h-6 w-6" />}
                title="No members yet"
                description="Add your first staff member to get started."
                action={<AddStaffDialog storeId={storeId} availableRoles={availableRoles} />}
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden sm:table-cell">Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((u) => {
                  const m = memberships.find((mm) => mm.userId === u.id)!;
                  const isSelf = u.id === session.userId;
                  return (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="font-medium">{u.name}{isSelf && <Badge variant="muted" className="ml-2">You</Badge>}</div>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">{u.email}</TableCell>
                      <TableCell>
                        <MembershipRow membershipId={m.id} initialRole={m.role} disabled={isSelf && m.role === 'ROOT_ADMIN'} />
                      </TableCell>
                      <TableCell>
                        {m.active ? <Badge variant="success">Active</Badge> : <Badge variant="muted">Suspended</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <MembershipRowActions membershipId={m.id} active={m.active === 1} self={isSelf} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t px-4 py-3">
              <span className="text-xs text-muted-foreground">
                Page {safePage} of {totalPages}
              </span>
              <div className="flex gap-1">
                {safePage > 1 ? (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/users?page=${safePage - 1}`}>
                      <ChevronLeft className="h-4 w-4" /> Prev
                    </Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>
                    <ChevronLeft className="h-4 w-4" /> Prev
                  </Button>
                )}
                {safePage < totalPages ? (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/users?page=${safePage + 1}`}>
                      Next <ChevronRight className="h-4 w-4" />
                    </Link>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>
                    Next <ChevronRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Role reference</CardTitle>
          <CardDescription>What each role can do in this store.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {availableRoles.map((r) => (
            <div key={r} className="rounded-md border bg-muted/30 p-3">
              <div className="font-semibold">{ROLE_LABEL[r]}</div>
              <div className="text-xs text-muted-foreground">{ROLE_DESCRIPTION[r]}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
