"use client";

import { useState, type FormEvent } from "react";
import styles from "./home.module.css";

const FORMSPREE_ENDPOINT = "https://formspree.io/f/xbgjobjv";

type SubmissionStatus = "idle" | "submitting" | "success" | "error";

export function ContactForm() {
  const [status, setStatus] = useState<SubmissionStatus>("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setStatus("submitting");

    try {
      const response = await fetch(FORMSPREE_ENDPOINT, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" },
      });

      if (!response.ok) throw new Error("Formspree rejected the request");
      form.reset();
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return <div className={styles.formSuccess} role="status"><strong>Request received</strong><p>Thanks — we&apos;ll review the request and get back to you.</p></div>;
  }

  return <form className={styles.contactForm} action={FORMSPREE_ENDPOINT} method="POST" onSubmit={handleSubmit}>
    <input name="_subject" type="hidden" value="nAIve physics — Dataset Request" />
    <div className={styles.formField}><label htmlFor="request-name">Name</label><input autoComplete="name" id="request-name" name="name" required type="text" /></div>
    <div className={styles.formField}><label htmlFor="request-email">Email</label><input autoComplete="email" id="request-email" name="email" required type="email" /></div>
    <div className={styles.formField}><label htmlFor="request-organization">Organization <span>Optional</span></label><input autoComplete="organization" id="request-organization" name="organization" type="text" /></div>
    <div className={`${styles.formField} ${styles.messageField}`}><label htmlFor="request-message">What data are you looking for?</label><textarea id="request-message" name="message" required rows={5} /></div>
    <div className={styles.formFooter}><button className={styles.formSubmit} disabled={status === "submitting"} type="submit">{status === "submitting" ? "Sending request…" : "Send dataset request →"}</button><p>Submitted directly through Formspree.<br />No account required.</p></div>
    {status === "error" ? <p className={styles.formError} role="alert">Something went wrong. Please try again or email <a href="mailto:riyashah6476@yahoo.in">riyashah6476@yahoo.in</a></p> : null}
  </form>;
}
