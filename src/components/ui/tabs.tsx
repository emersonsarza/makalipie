"use client";
import { Tabs as Primitive } from "@base-ui/react/tabs";
import { cn } from "@/lib/utils";
export const Tabs = Primitive.Root;
export function TabsList({ className, ...props }: Primitive.List.Props) { return <Primitive.List data-slot="tabs-list" className={cn("inline-flex h-8 w-fit max-w-full items-center rounded-lg bg-muted p-0.5", className)} {...props} />; }
export function TabsTrigger({ className, ...props }: Primitive.Tab.Props) { return <Primitive.Tab data-slot="tabs-trigger" className={cn("inline-flex h-7 flex-1 items-center justify-center whitespace-nowrap rounded-md px-2 text-sm text-muted-foreground data-active:bg-background data-active:text-foreground data-active:shadow-sm focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50", className)} {...props} />; }
export const TabsContent = Primitive.Panel;
