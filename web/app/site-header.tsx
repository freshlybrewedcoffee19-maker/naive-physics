import Link from "next/link";

type SiteHeaderProps = { active?: "datasets" | "categories" | "collection" | "format" | "pricing" | "about" };

const navItems = [
  { label: "Datasets", href: "/dataset", key: "datasets" },
  { label: "Categories", href: "/#categories", key: "categories" },
  { label: "How we collect", href: "/#collection", key: "collection" },
  { label: "Data format", href: "/#data-format", key: "format" },
  { label: "Pricing", href: "/#pricing", key: "pricing" },
  { label: "About", href: "/#about", key: "about" },
] as const;

function NavLinks({ active }: SiteHeaderProps) {
  return <>{navItems.map((item) => (
    <Link aria-current={item.key === active ? "page" : undefined} className={item.key === active ? "navActive" : undefined} href={item.href} key={item.label}>{item.label}</Link>
  ))}</>;
}

export function SiteHeader({ active }: SiteHeaderProps) {
  return (
    <header className="siteHeader">
      <Link className="wordmark" href="/" aria-label="nAIve physics home"><span className="wordmarkMark" aria-hidden="true">nP</span><span>nAIve physics</span></Link>
      <nav className="desktopNav" aria-label="Primary navigation"><NavLinks active={active} /><Link className="requestLink" href="/#pricing">Request data <span aria-hidden="true">→</span></Link></nav>
      <details className="mobileNav"><summary aria-label="Open navigation">Menu</summary><nav aria-label="Mobile navigation"><NavLinks active={active} /><Link className="requestLink" href="/#pricing">Request data →</Link></nav></details>
    </header>
  );
}
