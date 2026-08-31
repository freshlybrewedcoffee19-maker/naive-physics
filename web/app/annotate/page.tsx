import type { Metadata } from "next";
import { TemporalWorkbench } from "./temporal-workbench";
import styles from "./annotate.module.css";

export const metadata: Metadata = {
  title: "Temporal Annotation v0.2 — nAIve physics Data Workbench",
  description: "Internal human temporal annotation workbench for IRON_001.",
};

export default function AnnotatePage() {
  return <main className={styles.page}><TemporalWorkbench /></main>;
}
