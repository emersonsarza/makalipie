import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import styles from "./checkout.module.css";

export function DeliveryFeeNotice({ descriptionId, children }: {
  descriptionId?: string;
  children?: ReactNode;
}) {
  return <Alert role="note" className={styles.deliveryFeeNotice}>
    <CircleAlert aria-hidden />
    <AlertTitle className="font-bold">Delivery fee is separate</AlertTitle>
    <AlertDescription id={descriptionId} className="text-current">
      The subtotal excludes delivery. We’ll confirm the fee with you in chat.
    </AlertDescription>
    {children && <div className="col-start-2">{children}</div>}
  </Alert>;
}
