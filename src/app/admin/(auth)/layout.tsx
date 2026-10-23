import type { Metadata } from "next";
import "../../v1/admin.css";

export const metadata: Metadata = {
  title: "Admin · Makalipie",
  description: "Makalipie owner workspace.",
  robots: { index: false, follow: false },
  alternates: { canonical: null },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <div className="admin-root">{children}</div>;
}
