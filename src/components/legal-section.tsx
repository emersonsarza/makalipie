import styles from "@/app/legal.module.css";

export function LegalSection({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className={styles.section}>
      <h2>{n}. {title}</h2>
      {children}
    </section>
  );
}
