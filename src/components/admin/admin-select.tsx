import { SelectField, type SelectFieldProps } from "@/components/ui/select-field";

export function AdminSelect<Value extends string>(props: Omit<SelectFieldProps<Value>, "contentClassName">) {
  return <SelectField {...props} contentClassName="admin-theme" />;
}
