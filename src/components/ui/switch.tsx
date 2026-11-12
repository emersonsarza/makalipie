"use client";

import { Switch as Primitive } from "@base-ui/react/switch";
import { cn } from "@/lib/utils";

export function Switch({ className, ...props }: Primitive.Root.Props) {
  return (
    <Primitive.Root
      data-slot="switch"
      className={cn("inline-flex h-[18px] w-8 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-input px-0.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 data-checked:bg-primary motion-reduce:transition-none", className)}
      {...props}
    >
      <Primitive.Thumb data-slot="switch-thumb" className="size-3.5 rounded-full bg-white shadow-sm transition-transform data-checked:translate-x-3 motion-reduce:transition-none" />
    </Primitive.Root>
  );
}
