/**
 * Writes messages/REVIEW.md: every safety-critical key with its Thai and Burmese
 * review status. Existing statuses are kept, so a reviewer can change
 * "reviewed: no" to e.g. "reviewed: yes (name, 2026-11-02)" and re-run this
 * after adding keys. Run: npm run i18n:review
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { reviewKeys } from "../src/i18n/review";

const file = path.join(__dirname, "..", "messages", "REVIEW.md");
const ROW = /^\| `([^`]+)` \| ([^|]+) \| ([^|]+) \|$/;

const previous = new Map<string, { th: string; my: string }>();
if (existsSync(file)) {
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = ROW.exec(line.trim());
    if (m) previous.set(m[1], { th: m[2].trim(), my: m[3].trim() });
  }
}

const rows = reviewKeys().map((key) => {
  const s = previous.get(key) ?? { th: "reviewed: no", my: "reviewed: no" };
  return `| \`${key}\` | ${s.th} | ${s.my} |`;
});

writeFileSync(
  file,
  `# Safety-critical translations — review status

Thai (th) and Burmese (my) translations of medical and safety text are **drafts** until a
native speaker with medical knowledge reviews them against the English source
(messages/en.json, and the English species records in src/data/species/catalog.ts).

How to review:

1. Compare each key below in messages/th.json or messages/my.json (or, for \`species:<id>.<field>\`,
   src/data/species/translations/th.ts or my.ts) with the English.
2. Fix the translation if needed, then change its status to \`reviewed: yes (reviewer, YYYY-MM-DD)\`.
3. After adding or renaming keys, run \`npm run i18n:review\`: new keys are added as \`reviewed: no\`,
   existing statuses are kept. A test fails if this list is out of date.

Burmese text must be Myanmar Unicode, never Zawgyi.

| Key | th | my |
| --- | --- | --- |
${rows.join("\n")}
`,
);
console.log(`Wrote ${rows.length} keys to ${path.relative(process.cwd(), file)}`);
