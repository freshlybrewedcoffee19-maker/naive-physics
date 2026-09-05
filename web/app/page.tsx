import Image from "next/image";
import Link from "next/link";
import { ContactForm } from "./contact-form";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import styles from "./home.module.css";

const HUGGING_FACE_URL = "https://huggingface.co/datasets/CaramelCoffee19/naive-physics-ironing-v0.2";
const GITHUB_URL = "https://github.com/freshlybrewedcoffee19-maker/naive-physics";
const metrics = [["12", "Episodes"], ["4", "Garments"], ["3", "Regions"], ["13:07", "Total video"]] as const;
const pipeline = [
  ["Physical garment", "Real garments with recorded physical properties."],
  ["RGB observation", "24 FPS · 848 × 478 · sensor-captured RGB."],
  ["Metadata", "Task, region, garment, session and capture properties."],
  ["Human annotation", "Temporal segmentation of manipulation behavior."],
  ["Research-ready dataset", "Organized, versioned and downloadable."],
] as const;
const deliverables = [["MP4", "Video"], ["CSV", "Annotations"], ["CSV", "Metadata"], ["JSON", "Manifest / Gold Episode structure"]] as const;
const capabilities = [["Temporal annotation", "Segment actions and sub-actions."], ["RGB analysis", "Inspect experimental RGB-derived response."], ["ROI selection", "Human-guided region selection."], ["CSV export", "Export annotations and analysis."]] as const;
const requestTypes = ["New task", "New material", "New object", "New environment", "New modality"] as const;

function Arrow({ external = false }: { external?: boolean }) { return <span aria-hidden="true">{external ? "↗" : "→"}</span>; }

export default function Home() {
  return <main className={styles.page} id="top">
    <SiteHeader />
    <section className={styles.datasetSection} id="datasets" aria-labelledby="hero-title">
      <div className={styles.heroGrid}><div className={styles.heroCopy}><p className={styles.heroBrand}>nAIve Physics</p><h1 id="hero-title">Teaching machines how the physical world behaves.</h1><p className={styles.lead}>Real-world interaction data for Physical AI — starting with deformable objects and textile manipulation.</p><div className={styles.featuredRelease}><p>Featured dataset · Real-world garment manipulation</p><span>Our first research release pairs real human ironing demonstrations with human-verified temporal annotations and experimental interaction analysis for studying how fabric moves, slips and holds.</span></div><div className={styles.actions}><a className={styles.heroPrimary} href={HUGGING_FACE_URL} target="_blank" rel="noreferrer">Explore dataset <Arrow external /></a><a className={styles.heroSecondary} href={GITHUB_URL} target="_blank" rel="noreferrer">View on GitHub <Arrow external /></a></div><p className={styles.heroEvidence}><strong>12</strong> manipulation episodes <i>·</i> <strong>4</strong> physical garments <i>·</i> <strong>12/12</strong> human-verified temporal annotations <i>·</i> <strong>77</strong> verified slip events</p></div><figure className={styles.heroEvidenceVisual}><div className={styles.evidenceHeader}><span>IRON_009 / CAPTURE 009</span><span>RGB → INTERACTION STRUCTURE</span></div><div className={styles.evidenceFrames}><div><Image src="/hero/IRON_009_original_rgb.jpg" alt="Original RGB frame from the real IRON_009 ironing episode, showing the garment, iron, and operator interaction" width={1920} height={1080} priority sizes="(max-width: 900px) 100vw, 28vw" /><span>Original RGB</span></div><div><Image src="/hero/IRON_009_interaction_analysis.jpg" alt="Corresponding IRON_009 experimental interaction-analysis frame with garment landmarks, iron tracking, and temporal context" width={1920} height={1080} priority sizes="(max-width: 900px) 100vw, 28vw" /><span>Interaction analysis</span></div></div><figcaption><span>Real-world demonstration</span><i aria-hidden="true">→</i><span>Structured interaction understanding</span></figcaption></figure></div>
      <div className={styles.datasetHeading}><p className={styles.sectionIndex}>Dataset 001</p><h2>Ironing manipulation dataset</h2></div>
      <dl className={styles.metrics}>{metrics.map(([value, label]) => <div key={label}><dd>{value}</dd><dt>{label}</dt></div>)}</dl>
      <div className={styles.analysisBlock}><div className={styles.blockHeading}><div><p className={styles.sectionIndex}>RGB analysis — experimental</p><h3>From image to response inspection</h3></div><p>RGB-derived analysis · not ground truth</p></div><figure className={styles.analysisFigure}><Image src="/analysis/IRON_001_rgb_analysis.png" alt="IRON_001 RGB Analysis tool output showing the original sensor-captured RGB frame, experimental RGB-derived wrinkle response, and overlay together" width={1816} height={414} sizes="(max-width: 600px) calc(100vw - 40px), (max-width: 1600px) calc(100vw - 8vw), 1472px" /><figcaption><span>Sensor-captured RGB</span><i aria-hidden="true">→</i><span>derived_from_RGB response</span><i aria-hidden="true">→</i><span>Overlay</span></figcaption></figure><div className={styles.analysisNotice}><strong>Experimental RGB-derived analysis.</strong><span>Not wrinkle ground truth.</span><span>Not physical wrinkle height.</span><span>Not measured geometry.</span></div><p className={styles.caveat}>Response markers are experimental image-analysis outputs and are not validated wrinkle detections.</p></div>
    </section>

    <section className={styles.formatSection} id="data-format" aria-labelledby="format-title"><header className={styles.sectionHeader}><p className={styles.sectionIndex}>Data format</p><h2 id="format-title">What you get</h2></header><ol className={styles.pipeline}>{pipeline.map(([name, description], index) => <li key={name}><span>{String(index + 1).padStart(2, "0")}</span><strong>{name}</strong><p>{description}</p></li>)}</ol><div className={styles.deliverableGrid}>{deliverables.map(([format, label]) => <div key={label}><strong>{format}</strong><span>{label}</span></div>)}</div><div className={styles.fileTreeBlock}><div><p className={styles.sectionIndex}>Release structure</p><strong>4 / 12 temporally annotated</strong></div><pre>{`naive-physics-ironing-v0.2/\n├── videos/\n├── metadata/\n│   ├── episodes.csv\n│   └── garments.csv\n├── annotations/\n│   └── temporal/\n├── garment_references/\n├── calibration/\n└── docs/`}</pre></div></section>

    <section className={styles.toolSection} id="free-tool" aria-labelledby="tool-title"><div className={styles.toolCopy}><p className={styles.sectionIndex}>Browser workbench</p><h2 id="tool-title">Free annotation tool</h2><p>Annotate and inspect manipulation video locally in your browser.</p><p className={styles.trustLine}>Video processing stays local in your browser.</p><Link className={styles.primaryAction} href="/annotate">Open free tool <Arrow /></Link></div><figure className={styles.toolVisual}><Image src="/tool/free_annotation_tool.png" alt="The real nAIve physics Free Annotation Tool workbench showing video selection, episode metadata, batch metadata fields, and the IRON_001 video player" width={532} height={934} sizes="(max-width: 900px) calc(100vw - 40px), min(52vw, 640px)" /></figure><div className={styles.capabilityList}>{capabilities.map(([name, description]) => <article key={name}><h3>{name}</h3><p>{description}</p></article>)}</div></section>

    <section className={styles.requestsSection} id="dataset-requests" aria-labelledby="requests-title"><header><p className={styles.sectionIndex}>Targeted collection</p><h2 id="requests-title">Dataset requests</h2><h3>Need data we haven&apos;t published?</h3><p>Request a manipulation task, garment, material, environment or capture specification.</p></header><ul>{requestTypes.map((type) => <li key={type}>{type}</li>)}</ul><div className={styles.requestAction}><p>Commercial dataset requests welcome.</p><a className={styles.primaryAction} href="#contact">Submit a dataset request <Arrow /></a></div></section>
    <section className={styles.contactSection} id="contact" aria-labelledby="contact-title"><p className={styles.sectionIndex}>Contact</p><h2 id="contact-title">What data are you missing?</h2><p>Tell us what would make the next dataset useful for your work.</p><ContactForm /></section>
    <SiteFooter />
  </main>;
}
