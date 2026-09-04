import type { Metadata } from "next";
import { TemporalWorkbench } from "./temporal-workbench";
import styles from "./annotate.module.css";

export const metadata: Metadata = {
  title: "Internal / Experimental Workbench — nAIve physics",
  description: "Create and review experimental browser-side garment-manipulation data layers.",
};

export default function AnnotatePage() {
  return <main className={styles.page}><TemporalWorkbench /></main>;
}
