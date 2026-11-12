import Image from "next/image";
import { LoginForm } from "@/components/admin/login-form";

export const metadata = { title: "Admin sign in" };

export default function AdminLoginPage() {
  return (
    <main className="admin-theme admin-login-page grid min-h-svh bg-background lg:grid-cols-2">
      <section className="relative hidden min-h-svh overflow-hidden bg-muted lg:block">
        <Image
          src="/images/brand/hero.webp"
          alt="Makalipie pies arranged on a wooden table"
          fill
          priority
          sizes="50vw"
          className="object-cover"
        />
      </section>
      <section className="flex min-h-svh items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[25rem]">
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
