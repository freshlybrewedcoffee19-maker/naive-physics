import type { Metadata } from "next";
import { SiteHeader } from "../site-header";
import { SiteFooter } from "../site-footer";
import { DatasetExplorer } from "./dataset-explorer";
import styles from "./dataset.module.css";

export const metadata: Metadata = {
  title: "Ironing v0.1 Dataset — nAIve physics",
  description: "Inspect the nAIve physics pilot: three real-world human ironing demonstrations with episode-level metadata.",
};

const summary = [["03","episodes"],["04:17","interaction time"],["01","garment"],["03","regions"],["RGB","capture · 24 fps"]] as const;

const currentCoverage = [
  ["garment_type", ["t_shirt"]], ["material", ["cotton"]],
  ["garment_region", ["front_body", "both_sleeves", "back_body"]],
  ["camera_view", ["top_down"]], ["task", ["wrinkle_removal"]],
] as const;

const plannedAxes = ["formal shirts", "trousers", "multiple fabrics", "collars", "cuffs", "pleats", "different wrinkle states", "different operators"];

const protocolSteps = ["Initial state", "hand entry", "garment positioning / tensioning", "iron interaction", "release", "terminal state"];

const currentModalities = ["RGB video", "episode-level metadata", "garment-region labels", "task/action labels", "capture metadata", "calibration reference grid"];
const absentModalities = ["depth", "force / tactile", "hand pose", "6-DoF trajectories", "frame-level action segmentation", "outcome score"];

const datasetFiles = [
  ["data/metadata.csv", "Episode-level records and verified capture properties for all three episodes."],
  ["docs/schema.md", "Field definitions, data types, controlled vocabularies, units, and nullability."],
  ["docs/collection_protocol.md", "The physical setup, camera geometry, episode definition, and capture limitations."],
  ["docs/dataset_card.md", "Dataset purpose, contents, intended use, calibration notes, and known limitations."],
] as const;

export default function DatasetPage() {
  return (
    <main className={styles.page}>
      <SiteHeader active="datasets" />
      <nav className={styles.localNav} aria-label="Ironing dataset navigation"><span>Ironing v0.1</span><a href="#overview">Overview</a><a href="#episodes">Episodes</a><a href="#annotations">Annotations</a><a href="#schema">Schema</a><a href="#files">Files</a></nav>

      <section className={styles.datasetHeader} id="overview" aria-labelledby="dataset-title">
        <div className={styles.headerCopy}>
          <p className={styles.breadcrumb}>nAIve physics / Datasets / Ironing v0.1</p>
          <p className={styles.kicker}>GARMENT MANIPULATION / DATASET 001</p>
          <h1 id="dataset-title">Ironing</h1>
          <p>Teaching machines how humans manipulate, tension and press deformable textiles.</p>
          <p className={styles.statusLine}>Pilot · v0.1</p>
        </div>
        <dl className={styles.summaryStrip}>
          {summary.map(([value, label]) => <div key={label}><dd>{value}</dd><dt>{label}</dt></div>)}
        </dl>
      </section>

      <section className={styles.section} id="task-profile" aria-labelledby="task-title">
        <div className={styles.sectionLabel}><span>Behavior 01</span><p>Task profile</p></div>
        <div className={styles.taskGrid}>
          <div className={styles.taskStatement}>
            <p>Task</p>
            <h2 id="task-title">Wrinkle removal through ironing</h2>
          </div>
          <div className={styles.characteristics}>
            <p>Research characteristics</p>
            <ul>
              {[
                "deformable object manipulation", "tool use", "human hand coordination",
                "garment tensioning", "long-horizon manipulation",
              ].map((item) => <li key={item}>{item}</li>)}
            </ul>
            <small>Episode-level capture only. No force sensing or bimanual annotation is included.</small>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.explorerSection}`} id="episodes" aria-labelledby="explorer-title">
        <div className={styles.sectionLabel}><span>Records 03</span><p>Episode explorer</p></div>
        <div className={styles.sectionIntro}>
          <h2 id="explorer-title">Select one episode. Inspect the complete record.</h2>
          <p>All values below come directly from the current metadata file.</p>
        </div>
        <DatasetExplorer />
      </section>

      <section className={styles.section} aria-labelledby="timeline-title">
        <div className={styles.sectionLabel}><span>Protocol</span><p>Manipulation timeline</p></div>
        <div className={styles.protocolHead}>
          <div><h2 id="timeline-title">Capture protocol structure</h2><p>This is not frame-level annotation.</p></div>
          <p>Temporal boundaries have not yet been annotated.</p>
        </div>
        <ol className={styles.timeline}>
          {protocolSteps.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, "0")}</span><strong>{step}</strong></li>)}
        </ol>
      </section>

      <section className={`${styles.section} ${styles.annotationSection}`} id="annotations" aria-labelledby="annotations-title">
        <div className={styles.sectionLabel}><span>Annotation depth</span><p>Current → future</p></div>
        <div className={styles.sectionIntro}><h2 id="annotations-title">A clear path from observation to richer supervision.</h2><p>Pilot annotation layer coming next. Future layers are not included in the current dataset.</p></div>
        <div className={styles.annotationLevels}>
          <article><span>Current / Level 0</span><strong>RGB observation</strong><small>Included now</small></article>
          <article><span>Current / Level 1</span><strong>Episode metadata</strong><small>Included now</small></article>
          <article className={styles.nextLevel}><span>Next / Level 2</span><strong>Temporal manipulation segmentation</strong><small>Not yet complete</small></article>
          <article className={styles.futureLevel}><span>Future / not current</span><strong>Interaction labels · hand pose · tool trajectory · garment segmentation · depth · force/tactile · 6-DoF pose</strong><small>Roadmap only</small></article>
        </div>
      </section>

      <section className={`${styles.section} ${styles.coverageSection}`} aria-labelledby="coverage-title">
        <div className={styles.sectionLabel}><span>Coverage map</span><p>Variation axes</p></div>
        <div className={styles.sectionIntro}><h2 id="coverage-title">Current scope, without implied coverage.</h2><p>The pilot holds most capture conditions constant and varies the target garment region.</p></div>
        <div className={styles.coverageGrid}>
          <div className={styles.currentCoverage}><div className={styles.coverageHeading}><span className={styles.currentDot}/>Current coverage</div>{currentCoverage.map(([axis,values])=><div className={styles.axisRow} key={axis}><code>{axis}</code><div>{values.map(value=><span className={styles.currentTag} key={value}>{value}</span>)}</div></div>)}</div>
          <div className={styles.plannedCoverage}><div className={styles.coverageHeading}>Planned variation axes <span>Not currently included</span></div><div className={styles.plannedList}>{plannedAxes.map(axis=><span key={axis}>{axis}<small>planned</small></span>)}</div></div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.modalitySection}`} aria-labelledby="modalities-title">
        <div className={styles.sectionLabel}><span>Signals</span><p>Data modalities</p></div>
        <div className={styles.sectionIntro}><h2 id="modalities-title">What is present—and what is not.</h2></div>
        <div className={styles.modalityGrid}>
          <div className={styles.included}><h3>Current</h3><ul>{currentModalities.map((item) => <li key={item}>{item}<span>included</span></li>)}</ul></div>
          <div className={styles.notIncluded}><h3>Not currently included</h3><ul>{absentModalities.map((item) => <li key={item}>{item}<span>absent</span></li>)}</ul></div>
        </div>
      </section>

      <section className={styles.section} id="schema" aria-labelledby="files-title">
        <div className={styles.sectionLabel}><span>Reference</span><p>Dataset files</p></div>
        <div className={styles.filesHead}><h2 id="files-title">The pilot’s source documentation.</h2><p>These paths describe the data currently held outside the website.</p></div>
        <div className={styles.fileList} id="files">
          {datasetFiles.map(([path, description]) => <article key={path}><code>{path}</code><p>{description}</p><span>project file</span></article>)}
        </div>
      </section>

      <section className={`${styles.section} ${styles.coveragePhilosophy}`} aria-labelledby="coverage-philosophy-title"><div className={styles.sectionLabel}><span>Coverage report</span><p>Design philosophy</p></div><div className={styles.coverageFormula}><h2 id="coverage-philosophy-title">Episode count is only one dimension of dataset quality.</h2><div><span>garment</span><b>×</b><span>material</span><b>×</b><span>region</span><b>×</b><span>starting state</span><b>×</b><span>operator</span><b>×</b><span>task</span></div><p>Future datasets will be designed around useful variation coverage. No coverage quantities beyond the current pilot are claimed here.</p></div></section>

      <section className={styles.extensionCta} aria-labelledby="extension-title">
        <div><p>Targeted collection</p><h2 id="extension-title">Need a different variation?</h2></div>
        <p>nAIve physics is building a catalogue that can support targeted extensions across garments, materials, starting states, camera setups and manipulation tasks.</p>
        <button type="button" disabled>Request a Dataset Extension</button>
        <small>Request workflow coming next. Commercial access terms are not yet finalized.</small>
      </section>

      <SiteFooter />
    </main>
  );
}
