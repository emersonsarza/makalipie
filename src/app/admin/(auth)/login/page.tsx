import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, LockKeyhole } from "lucide-react";
import { LoginForm } from "@/components/admin/login-form";
import { firebaseSetupReady } from "@/lib/firebase/server";
import { AdminAccessError } from "@/lib/admin/access";
import { requireOwner } from "@/lib/admin/session";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const configured = firebaseSetupReady();
  if (configured) {
    let signedIn = false;
    try { await requireOwner(); signedIn = true; }
    catch (error) { if (!(error instanceof AdminAccessError)) throw error; }
    if (signedIn) redirect("/admin");
  }
  const { reason } = await searchParams;
  const notice = reason === "session" ? "Please sign in to continue to your workspace."
    : reason === "access" ? "Your account does not have active owner access. Sign in with an authorized account." : undefined;

  return <main className="admin-login">
    <section className="admin-login-story" aria-label="Makalipie workspace">
      <Link href="/" className="admin-wordmark">makalipie<span>THE BAKERY WORKSPACE</span></Link>
      <div className="admin-login-story-content">
        <Image src="/brand/seal.png" alt="Makalipie tarts and pies" width={124} height={124} priority />
        <p className="admin-eyebrow">A LITTLE CARE, BEHIND EVERY PIE.</p>
        <h2>Good things<br />start here.</h2>
        <p>Your everyday space to keep the bakery<br className="admin-desktop-break" /> running with a little more ease.</p>
      </div>
      <div className="admin-story-footer"><span>Handcrafted in Cebu. Since 2020.</span><span>Made with care.</span></div>
    </section>
    <section className="admin-login-panel" aria-labelledby="login-heading">
      <Link href="/" className="admin-back-link">Visit the website <ArrowUpRight size={16} aria-hidden="true" /></Link>
      <div className="admin-login-content">
        <Badge variant="outline" className="admin-access-badge"><LockKeyhole size={13} aria-hidden="true" /> PRIVATE WORKSPACE</Badge>
        <h1 id="login-heading">Welcome back.</h1>
        <p className="admin-login-description">Sign in to your Makalipie account.</p>
        <LoginForm configured={configured} notice={notice} />
      </div>
      <p className="admin-login-footer">A home for the work behind the homemade.</p>
    </section>
  </main>;
}
