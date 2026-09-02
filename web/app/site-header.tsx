import Link from "next/link";
import styles from "./site-header.module.css";

type SiteHeaderProps = { active?: "datasets" | "annotate" };
const HUGGING_FACE_URL = "https://huggingface.co/datasets/CaramelCoffee19/naive-physics-ironing-v0.2";

const navItems = [
  { label: "Datasets", href: "/#datasets", key: "datasets" },
  { label: "Data format", href: "/#data-format", key: "format" },
  { label: "Free tool", href: "/annotate", key: "annotate" },
  { label: "Dataset requests", href: "/#dataset-requests", key: "requests" },
] as const;

function NavLinks({ active }: SiteHeaderProps) {
  return <>{navItems.map((item) => <Link aria-current={item.key === active ? "page" : undefined} className={item.key === active ? styles.active : undefined} href={item.href} key={item.label}>{item.label}</Link>)}<a href={HUGGING_FACE_URL} target="_blank" rel="noreferrer">Hugging Face <span aria-hidden="true">↗</span></a></>;
}

export function SiteHeader({ active }: SiteHeaderProps) {
  return <header className={styles.header}>
    <Link className={styles.wordmark} href="/" aria-label="nAIve physics home">nAIve physics</Link>
    <nav className={styles.desktopNav} aria-label="Primary navigation"><NavLinks active={active} /></nav>
    <details className={styles.mobileNav}><summary>Menu</summary><nav aria-label="Mobile navigation"><NavLinks active={active} /></nav></details>
  </header>;
}
