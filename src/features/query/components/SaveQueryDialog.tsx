"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SaveQueryDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
  defaultName?: string;
}

export function SaveQueryDialog({
  open,
  onClose,
  onSave,
  defaultName = "",
}: SaveQueryDialogProps) {
  const [name, setName] = useState(defaultName);

  // Reset name when the dialog transitions from closed → open.
  // Uses React's "setState during render on prop change" pattern to avoid
  // setState inside useEffect (react-hooks/set-state-in-effect).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setName(defaultName);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Save query</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="query-name">Name</Label>
            <Input
              id="query-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Uncategorized transactions"
              autoFocus
            />
          </div>
          <DialogFooter showCloseButton>
            <Button type="submit" size="sm" disabled={!name.trim()}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
