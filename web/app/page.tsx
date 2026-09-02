import Image from "next/image";
import Link from "next/link";
import { ContactForm } from "./contact-form";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import styles from "./home.module.css";

const HUGGING_FACE_URL = "https://huggingface.co/datasets/CaramelCoffee19/naive-physics-ironing-v0.2";
const metrics = [["12", "Episodes"], ["4", "Garments"], ["3", "Regions"], ["13:07", "Total video"]] as const;
const garments = ["Brown", "Yellow", "Pink", "Blue"] as const;
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
      <div className={styles.heroCopy}><p className={styles.eyebrow}>nAIve physics / dataset catalogue</p><h1 id="hero-title">Real-world data<br />for Physical AI.</h1><p className={styles.lead}>Structured manipulation data captured from real physical interactions.</p><div className={styles.actions}><Link className={styles.primaryAction} href="/dataset">Explore dataset <Arrow /></Link><a className={styles.textAction} href={HUGGING_FACE_URL} target="_blank" rel="noreferrer">View on Hugging Face <Arrow external /></a></div></div>
      <figure className={styles.heroMedia}><div className={styles.mediaHeader}><span>RGB observation</span><span>IRON_001</span></div><video controls playsInline preload="metadata" aria-label="IRON_001 front-body ironing demonstration"><source src="/dataset/episodes/IRON_001_action_web.mp4" type="video/mp4" />Your browser does not support HTML5 video.</video><figcaption><span>Sensor-captured RGB</span><span>24 FPS</span><span>Top-down</span></figcaption></figure>
      <div className={styles.datasetHeading}><p className={styles.sectionIndex}>Dataset 001</p><h2>Ironing manipulation dataset</h2></div>
      <dl className={styles.metrics}>{metrics.map(([value, label]) => <div key={label}><dd>{value}</dd><dt>{label}</dt></div>)}</dl>
      <div className={styles.coverageBlock}><div className={styles.blockHeading}><div><p className={styles.sectionIndex}>Coverage matrix</p><h3>Four garments × three regions</h3></div><p>12 physical manipulation episodes</p></div><div className={styles.matrix} role="table" aria-label="Garment color by manipulation region coverage"><div className={styles.matrixCorner} role="columnheader">Garment</div><div role="columnheader">Front body</div><div role="columnheader">Sleeves</div><div role="columnheader">Back</div>{garments.map((garment) => <div className={styles.matrixRow} role="row" key={garment}><strong role="rowheader">{garment}</strong><span role="cell" aria-label={`${garment}, front body: included`}>●</span><span role="cell" aria-label={`${garment}, sleeves: included`}>●</span><span role="cell" aria-label={`${garment}, back: included`}>●</span></div>)}</div></div>
      <div className={styles.analysisBlock}><div className={styles.blockHeading}><div><p className={styles.sectionIndex}>RGB analysis — experimental</p><h3>From image to response inspection</h3></div><p>RGB-derived analysis · not ground truth</p></div><figure className={styles.analysisFigure}><Image src="/analysis/IRON_001_rgb_analysis.png" alt="IRON_001 RGB Analysis tool output showing the original sensor-captured RGB frame, experimental RGB-derived wrinkle response, and overlay together" width={1816} height={414} sizes="(max-width: 600px) calc(100vw - 40px), (max-width: 1600px) calc(100vw - 8vw), 1472px" /><figcaption><span>Sensor-captured RGB</span><i aria-hidden="true">→</i><span>derived_from_RGB response</span><i aria-hidden="true">→</i><span>Overlay</span></figcaption></figure><div className={styles.analysisNotice}><strong>Experimental RGB-derived analysis.</strong><span>Not wrinkle ground truth.</span><span>Not physical wrinkle height.</span><span>Not measured geometry.</span></div><p className={styles.caveat}>Response markers are experimental image-analysis outputs and are not validated wrinkle detections.</p></div>
    </section>

    <section className={styles.formatSection} id="data-format" aria-labelledby="format-title"><header className={styles.sectionHeader}><p className={styles.sectionIndex}>Data format</p><h2 id="format-title">What you get</h2></header><ol className={styles.pipeline}>{pipeline.map(([name, description], index) => <li key={name}><span>{String(index + 1).padStart(2, "0")}</span><strong>{name}</strong><p>{description}</p></li>)}</ol><div className={styles.deliverableGrid}>{deliverables.map(([format, label]) => <div key={label}><strong>{format}</strong><span>{label}</span></div>)}</div><div className={styles.fileTreeBlock}><div><p className={styles.sectionIndex}>Release structure</p><strong>4 / 12 temporally annotated</strong></div><pre>{`naive-physics-ironing-v0.2/\n├── videos/\n├── metadata/\n│   ├── episodes.csv\n│   └── garments.csv\n├── annotations/\n│   └── temporal/\n├── garment_references/\n├── calibration/\n└── docs/`}</pre></div></section>

    <section className={styles.toolSection} id="free-tool" aria-labelledby="tool-title"><div className={styles.toolCopy}><p className={styles.sectionIndex}>Browser workbench</p><h2 id="tool-title">Free annotation tool</h2><p>Annotate and inspect manipulation video locally in your browser.</p><p className={styles.trustLine}>Video processing stays local in your browser.</p><Link className={styles.primaryAction} href="/annotate">Open free tool <Arrow /></Link></div><figure className={styles.toolVisual}><Image src="/tool/free_annotation_tool.png" alt="The real nAIve physics Free Annotation Tool workbench showing video selection, episode metadata, batch metadata fields, and the IRON_001 video player" width={532} height={934} sizes="(max-width: 900px) calc(100vw - 40px), min(52vw, 640px)" /></figure><div className={styles.capabilityList}>{capabilities.map(([name, description]) => <article key={name}><h3>{name}</h3><p>{description}</p></article>)}</div></section>

    <section className={styles.requestsSection} id="dataset-requests" aria-labelledby="requests-title"><header><p className={styles.sectionIndex}>Targeted collection</p><h2 id="requests-title">Dataset requests</h2><h3>Need data we haven&apos;t published?</h3><p>Request a manipulation task, garment, material, environment or capture specification.</p></header><ul>{requestTypes.map((type) => <li key={type}>{type}</li>)}</ul><div className={styles.requestAction}><p>Commercial dataset requests welcome.</p><a className={styles.primaryAction} href="#contact">Submit a dataset request <Arrow /></a></div></section>
    <section className={styles.contactSection} id="contact" aria-labelledby="contact-title"><p className={styles.sectionIndex}>Contact</p><h2 id="contact-title">What data are you missing?</h2><p>Tell us what would make the next dataset useful for your work.</p><ContactForm /></section>
    <SiteFooter />
  </main>;
}
