import Link from "next/link";
import styles from "./site-footer.module.css";

const HUGGING_FACE_URL = "https://huggingface.co/datasets/CaramelCoffee19/naive-physics-ironing-v0.2";
const GITHUB_URL = "https://github.com/freshlybrewedcoffee19-maker/naive-physics";

export function SiteFooter() {
  return <footer className={styles.footer}>
    <Link className={styles.wordmark} href="/">nAIve physics</Link>
    <nav aria-label="Footer navigation"><a href={HUGGING_FACE_URL} target="_blank" rel="noreferrer">Hugging Face ↗</a><a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub ↗</a><Link href="/annotate">Free tool ↗</Link><Link href="/#contact">Contact</Link></nav>
  </footer>;
}
