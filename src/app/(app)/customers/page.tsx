import { requireActiveStore } from '@/lib/auth/guards';
import { customersRepo } from '@/lib/db/repositories/customers.repo';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { Users } from 'lucide-react';
import { AddCustomerDialog } from './add-customer-dialog';

export default async function CustomersPage() {
  const { storeId } = await requireActiveStore();
  const list = customersRepo.list(storeId);

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Manage your customer list."
        actions={<AddCustomerDialog />}
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{list.length} customer{list.length === 1 ? '' : 's'}</CardTitle>
          <CardDescription>Walk-in customers don't need to be added here.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {list.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<Users className="h-6 w-6" />}
                title="No customers yet"
                description="Add your first customer to get started."
                action={<AddCustomerDialog />}
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="hidden sm:table-cell">Email</TableHead>
                  <TableHead className="hidden md:table-cell">Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground">{c.phone || '—'}</TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{c.email || '—'}</TableCell>
                    <TableCell className="hidden max-w-xs truncate text-muted-foreground md:table-cell">{c.notes || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
