import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="siteFooter">
      <div><Link href="/">nAIve physics</Link><p>Real-world garment manipulation datasets for Physical AI.</p></div>
      <nav aria-label="Footer navigation"><Link href="/dataset">Datasets</Link><Link href="/#collection">How we collect</Link><Link href="/#data-format">Data format</Link><Link href="/#pricing">Pricing</Link></nav>
      <span>Pilot / 2026</span>
    </footer>
  );
}
