"use client";

import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

export type SelectFieldProps<Value extends string> = {
  id?: string;
  label: string;
  value: Value;
  onValueChange: (value: Value) => void;
  options: readonly { value: Value; label: string; disabled?: boolean }[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  contentClassName?: string;
  ariaInvalid?: boolean;
  describedBy?: string;
};

export function SelectField<Value extends string>({
  id, label, value, onValueChange, options, placeholder, disabled, required, className, contentClassName, ariaInvalid, describedBy,
}: SelectFieldProps<Value>) {
  const selected = options.find(option => option.value === value);

  return <Select<Value>
    value={selected || value ? value : null}
    items={options}
    disabled={disabled}
    required={required}
    onValueChange={next => { if (next !== null) onValueChange(next); }}
  >
    <SelectTrigger id={id} aria-label={label} aria-invalid={ariaInvalid} aria-describedby={describedBy} className={cn("min-w-0 bg-background", className)}>
      <SelectValue placeholder={placeholder} />
    </SelectTrigger>
    <SelectContent alignItemWithTrigger={false} className={cn("motion-reduce:animate-none", contentClassName)}>
      {options.map(option => <SelectItem key={option.value} value={option.value} label={option.label} disabled={option.disabled}>
        <span className="min-w-0 whitespace-normal [overflow-wrap:anywhere]">{option.label}</span>
      </SelectItem>)}
    </SelectContent>
  </Select>;
}
