import { permanentRedirect } from "next/navigation";

export default function PreordersPage() {
  permanentRedirect("/menu?view=preorders");
}
