"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export type ConfirmRequest = {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type Pending = ConfirmRequest & { resolve: (ok: boolean) => void };

const ConfirmContext = createContext<(request: ConfirmRequest) => Promise<boolean>>(async () => false);

export function AdminConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const confirm = useCallback((request: ConfirmRequest) => new Promise<boolean>(resolve => {
    setPending({ ...request, resolve });
  }), []);

  function finish(ok: boolean) {
    setPending(current => {
      current?.resolve(ok);
      return null;
    });
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={Boolean(pending)} onOpenChange={open => { if (!open) finish(false); }}>
        <AlertDialogContent className="admin-theme">
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.title}</AlertDialogTitle>
            <AlertDialogDescription>{pending?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{pending?.cancelLabel ?? "Keep editing"}</AlertDialogCancel>
            <Button variant={pending?.destructive ? "destructive" : "default"} onClick={() => finish(true)}>
              {pending?.confirmLabel ?? "Continue"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}
