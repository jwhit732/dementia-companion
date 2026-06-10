import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Doc } from "../lib/schema";

/**
 * Generates `docs/carer-guide.md` from the zod schema shape defined in
 * `lib/schema.ts`. The schema is the single source of truth for which
 * fields the carer guide must contain; this script renders a human
 * readable markdown template with an illustrative example block whose
 * format MUST match what the parser expects.
 */

type FieldKind = "string" | "string[]" | "ScheduleItem[]" | "Contact[]";

interface FieldDescriptor {
  name: string;
  kind: FieldKind;
  description: string;
}

/**
 * Derive the list of top-level fields from the zod Doc schema. We use
 * the schema's own shape so this stays in sync with `lib/schema.ts`.
 */
function describeDocFields(): FieldDescriptor[] {
  const shape = Doc.shape;
  const descriptions: Record<keyof typeof shape, string> = {
    name: "Full legal name of the person being cared for",
    preferredName: "Name they actually like being called",
    scheduleDate: 'Date the schedule applies to, in "YYYY-MM-DD" format',
    schedule: "Time-ordered list of today's events",
    reminders: "Short standing reminders the agent may repeat",
    contacts: "People the person may ask about or want to call",
  };

  const kinds: Record<keyof typeof shape, FieldKind> = {
    name: "string",
    preferredName: "string",
    scheduleDate: "string",
    schedule: "ScheduleItem[]",
    reminders: "string[]",
    contacts: "Contact[]",
  };

  return (Object.keys(shape) as (keyof typeof shape)[]).map((key) => ({
    name: String(key),
    kind: kinds[key],
    description: descriptions[key],
  }));
}

const EXAMPLE_BLOCK = `Name: Margaret
Preferred name: Marg

Today (Tuesday 10 June 2025):
- 10:00 AM \u2014 Dr Patel, skin check, Greenslopes Medical
- 12:30 PM \u2014 Lunch with Sophie at home
- 2:00 PM \u2014 Afternoon tablets (blue box, kitchen bench)

Reminders:
- Don't drive \u2014 licence surrendered March 2026
- Sophie is David's daughter

Contacts:
- James (son): 0400 000 000`;

function renderGuide(fields: FieldDescriptor[]): string {
  const fieldRows = fields
    .map((f) => `| \`${f.name}\` | \`${f.kind}\` | ${f.description} |`)
    .join("\n");

  return `# Carer Guide

This guide explains how to write the daily document the Dementia Companion
voice agent reads from. The document is a small piece of plain text
describing who the person is, what their day looks like, the reminders
that should be repeated, and the people they may ask about.

The format below is intentionally simple so a carer can edit it from a
phone or a printed sheet. The agent parses it into the schema defined in
\`lib/schema.ts\`.

## Required fields

| Field | Type | Purpose |
| --- | --- | --- |
${fieldRows}

## Example document

Use this exact shape. The parser is permissive about whitespace and
bullet style, but the section headers (\`Name:\`, \`Preferred name:\`,
\`Today (...):\`, \`Reminders:\`, \`Contacts:\`) must appear as shown.

\`\`\`
${EXAMPLE_BLOCK}
\`\`\`

## Notes

- **Today (Day Date): header must match today's actual date \u2014 update it
  each morning.** The day-of-week and date in parentheses are how the
  agent knows the schedule block is current. If the header is stale the
  agent will refuse to use the schedule.
- Bullets can be \`-\`, \`\u2022\`, or \`*\`. Use whichever is easiest to type;
  the parser treats them identically.
- Times in the \`Today\` block should be normalised to the \`H:MM AM/PM\`
  form shown in the example (e.g. \`10:00 AM\`, \`2:00 PM\`). The em-dash
  separating the time from the activity may also be a hyphen.
- Locations on schedule items are optional. If present they follow the
  activity, separated by a comma.
- Contacts use the form \`Name (relationship): phone\`. The phone number
  is optional and may be omitted along with the trailing colon.
- All values in the example above are illustrative placeholders. Replace
  them with the real person's details before the agent goes live.
`;
}

function main(): void {
  const fields = describeDocFields();
  const guide = renderGuide(fields);

  const outPath = resolve(__dirname, "..", "docs", "carer-guide.md");
  const outDir = dirname(outPath);
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  writeFileSync(outPath, guide, "utf8");
  // eslint-disable-next-line no-console
  console.log(`Wrote ${outPath} (${guide.length} bytes)`);
}

main();
