'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { AddStaffForm } from './add-staff-form';
import { UserPlus } from 'lucide-react';
import type { Role } from '@/lib/types';

export function AddStaffDialog({
  storeId,
  availableRoles,
}: {
  storeId: string;
  availableRoles: Role[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="h-4 w-4" /> Add staff
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add staff member</DialogTitle>
          <DialogDescription>
            Creates a user account and assigns them to this store with the role you pick.
          </DialogDescription>
        </DialogHeader>
        <AddStaffForm storeId={storeId} availableRoles={availableRoles} onClose={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
