import type { Metadata } from "next";
import { TemporalWorkbench } from "./temporal-workbench";
import styles from "./annotate.module.css";

export const metadata: Metadata = {
  title: "Free Annotation Tool — nAIve physics",
  description: "Turn manipulation videos into structured, human-verified temporal training data.",
};

export default function AnnotatePage() {
  return <main className={styles.page}><TemporalWorkbench /></main>;
}
