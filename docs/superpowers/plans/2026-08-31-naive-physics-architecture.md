# nAIve physics Website Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the homepage and Ironing v0.1 explorer under the customer-facing nAIve physics catalogue architecture.

**Architecture:** Keep the Next.js App Router application static-first. Share the global header and footer across both routes, keep interactive state isolated to the episode explorer client component, and retain CSS-generated research visuals without adding dependencies.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, CSS Modules, global CSS, Tailwind scaffold.

**Spec:** `C:/Users/Riya/.codex/attachments/2163b766-cde7-4e08-94c5-1fd5c9db13d9/pasted-text.txt`

## Global Constraints

- Preserve `nAIve physics` capitalization in customer-facing copy.
- Do not modify raw data, metadata, schema, collection protocol, or dataset card.
- Do not rename `IRON_001`, `IRON_002`, or `IRON_003`.
- Do not add dependencies, authentication, databases, payments, fake proof, prices, capabilities, or licensing terms.
- Keep video integration and temporal annotation out of scope.

---

### Task 1: Shared application shell

**Files:** Modify `web/app/site-header.tsx`; create `web/app/site-footer.tsx`; modify `web/app/globals.css`.

**Interfaces:** Produce `SiteHeader({ active })` and `SiteFooter()` used by both routes.

- [ ] Replace customer-facing GarmentDex naming with nAIve physics.
- [ ] Add the specified global links, Request data action, mobile collapse, and active state.
- [ ] Add the shared minimal footer and verify keyboard focus styles.

### Task 2: Homepage catalogue architecture

**Files:** Modify `web/app/page.tsx` and `web/app/globals.css`.

**Interfaces:** Consume `SiteHeader` and `SiteFooter`; link the available dataset to `/dataset`.

- [ ] Implement the hero, problem, available/planned catalogue, categories, collection, current format, three commercial paths, and small About.
- [ ] Label every planned dataset and roadmap item as planned.
- [ ] Include only verified pilot facts and restrained licensing language.

### Task 3: Dataset inspection architecture

**Files:** Modify `web/app/dataset/page.tsx`, `web/app/dataset/dataset-explorer.tsx`, and `web/app/dataset/dataset.module.css`.

**Interfaces:** Consume shared shell components; retain client-side episode selection.

- [ ] Add dataset breadcrumb context and local Overview/Episodes/Annotations/Schema/Files navigation.
- [ ] Keep the dominant preview placeholder and experiment selector.
- [ ] Group selected metadata into Task, Capture, Media, and Evaluation.
- [ ] Add capture structure, annotation roadmap, current/planned coverage, files, and coverage philosophy.

### Task 4: Metadata and application identity

**Files:** Modify `web/app/layout.tsx`.

**Interfaces:** Produce nAIve physics page title and description for search/browser chrome.

- [ ] Replace the old customer-facing application metadata.
- [ ] Confirm internal dataset paths and IDs remain unchanged.

### Task 5: Verification

**Files:** No production file changes unless QA finds a defect.

**Interfaces:** Validate the static routes and interactive experiment selector.

- [ ] Run `pnpm run lint` and `pnpm run build` with the bundled Node runtime available.
- [ ] Verify `/`, `/dataset`, cross-route links, shared/global active states, and local anchors.
- [ ] Verify mobile navigation, readable stacking, and no horizontal overflow.
- [ ] Inspect browser console errors and leave `/dataset` open for review.
