import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import styles from "./checkout.module.css";

export function DeliveryFeeNotice({ paysDriver }: { paysDriver?: boolean }) {
  return <Alert role="note" className={styles.deliveryFeeNotice}>
    <CircleAlert aria-hidden />
    <AlertTitle className="font-bold">Delivery fee is separate</AlertTitle>
    <AlertDescription className="text-current">
      {paysDriver
        ? "Makalipie books the delivery. Pay the delivery fee directly to the driver."
        : "The subtotal excludes delivery. We’ll confirm the fee with you in chat."}
    </AlertDescription>
  </Alert>;
}
