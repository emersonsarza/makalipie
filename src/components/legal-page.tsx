import { Children, isValidElement, type ReactNode } from "react";
import Link from "next/link";
import { SiteShell } from "@/components/site-shell";
import { LegalSection, type LegalSectionProps } from "@/components/legal-section";
import styles from "@/app/legal.module.css";

const LINKS = [
  { href: "/terms", label: "Terms", id: "terms" },
  { href: "/privacy", label: "Privacy", id: "privacy" },
  { href: "/refund", label: "Refund policy", id: "refund" },
] as const;

export function LegalPage({ title, intro, policy, children }: {
  title: string;
  intro: string;
  policy: (typeof LINKS)[number]["id"];
  children: ReactNode;
}) {
  const sections = Children.toArray(children).flatMap((child) =>
    isValidElement<LegalSectionProps>(child) && child.type === LegalSection
      ? [{ n: child.props.n, title: child.props.title }]
      : [],
  );
  const index = <ol>{sections.map(({ n, title: sectionTitle }) => <li key={n}>
    <a href={`#section-${n}`}><span>{String(n).padStart(2, "0")}</span>{sectionTitle}</a>
  </li>)}</ol>;

  return (
    <SiteShell>
      <article className={styles.page}>
        <nav className={styles.tabs} aria-label="Policies">
          {LINKS.map((link) => <Link key={link.id} href={link.href} aria-current={policy === link.id ? "page" : undefined}>{link.label}</Link>)}
        </nav>
        <header className={styles.header}>
          <p className={styles.eyebrow}>MAKALIPIE · THE DETAILS</p>
          <h1>{title}</h1>
          <p className={styles.intro}>{intro}</p>
          <p className={styles.updated}>Last updated: <time dateTime="2026-09-30">30 Sep 2026</time></p>
        </header>
        <div className={styles.layout}>
          <nav className={styles.desktopIndex} aria-label="On this page">
            <p className={styles.indexTitle}>On this page</p>
            {index}
          </nav>
          <details className={styles.mobileIndex}>
            <summary>On this page</summary>
            <nav aria-label="On this page">{index}</nav>
          </details>
          <div className={styles.body}>{children}</div>
        </div>
        <nav className={styles.nav} aria-label="Legal pages">
          {LINKS.map((link) => <Link key={link.id} href={link.href} aria-current={policy === link.id ? "page" : undefined}>{link.label}</Link>)}
        </nav>
      </article>
    </SiteShell>
  );
}

export function LegalPending({ children }: { children: ReactNode }) {
  return <p className={styles.pending}><span>To be confirmed.</span> {children}</p>;
}
