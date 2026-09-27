"use client";
import { Tabs as Primitive } from "@base-ui/react/tabs";
import { cn } from "@/lib/utils";
export const Tabs = Primitive.Root;
export function TabsList({ className, ...props }: Primitive.List.Props) { return <Primitive.List data-slot="tabs-list" className={cn("inline-flex min-h-11 items-center gap-1 rounded-lg bg-muted p-1", className)} {...props} />; }
export function TabsTrigger({ className, ...props }: Primitive.Tab.Props) { return <Primitive.Tab data-slot="tabs-trigger" className={cn("min-h-9 rounded-md px-3 text-sm text-muted-foreground data-active:bg-background data-active:text-foreground data-active:shadow-sm focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50", className)} {...props} />; }
export const TabsContent = Primitive.Panel;
