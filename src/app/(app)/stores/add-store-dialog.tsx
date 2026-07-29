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
import { CreateStoreForm } from './create-store-form';
import { Plus } from 'lucide-react';

export function AddStoreDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> New store
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create a new store</DialogTitle>
          <DialogDescription>
            Add a tenant. You become its root-level admin by default.
          </DialogDescription>
        </DialogHeader>
        <CreateStoreForm onClose={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
