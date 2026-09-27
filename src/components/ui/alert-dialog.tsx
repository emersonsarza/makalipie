"use client";
import { AlertDialog as Primitive } from "@base-ui/react/alert-dialog";
import { cn } from "@/lib/utils";
export const AlertDialog = Primitive.Root;
export const AlertDialogTitle = Primitive.Title;
export const AlertDialogDescription = Primitive.Description;
export const AlertDialogCancel = Primitive.Close;
export function AlertDialogContent({ className, ...props }: Primitive.Popup.Props) { return <Primitive.Portal><Primitive.Backdrop className="fixed inset-0 z-50 bg-black/40" /><Primitive.Popup data-slot="alert-dialog-content" className={cn("fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-6 text-foreground shadow-lg outline-none", className)} {...props} /></Primitive.Portal>; }
