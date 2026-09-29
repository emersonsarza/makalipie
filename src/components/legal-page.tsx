import Link from "next/link";
import { SiteShell } from "@/components/site-shell";
import styles from "@/app/legal.module.css";

const LINKS = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/refund", label: "Refund" },
] as const;

export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <SiteShell>
      <article className={`wrap ${styles.page}`}>
        <header className={styles.header}>
          <p className="eyebrow">MAKALIPIE</p>
          <h1>{title}</h1>
          <p className={styles.updated}>Last updated: 30 Sep 2026</p>
          <p className={styles.intro}>{intro}</p>
        </header>
        <div className={styles.body}>{children}</div>
        <nav className={styles.nav} aria-label="Legal pages">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href}>{link.label}</Link>
          ))}
        </nav>
      </article>
    </SiteShell>
  );
}

export function LegalPending({ children }: { children: React.ReactNode }) {
  return <p className={styles.pending}><span>To be confirmed.</span> {children}</p>;
}
