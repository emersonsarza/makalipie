import styles from "@/app/legal.module.css";

export type LegalSectionProps = { n: number; title: string; children: React.ReactNode };

export function LegalSection({ n, title, children }: LegalSectionProps) {
  return (
    <section className={styles.section} id={`section-${n}`} aria-labelledby={`heading-${n}`}>
      <h2 id={`heading-${n}`}><span className={styles.number}>{String(n).padStart(2, "0")}</span><span>{title}</span></h2>
      {children}
    </section>
  );
}
