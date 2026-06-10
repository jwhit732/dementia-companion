# Carer Guide

This guide explains how to write the daily document the Dementia Companion
voice agent reads from. The document is a small piece of plain text
describing who the person is, what their day looks like, the reminders
that should be repeated, and the people they may ask about.

The format below is intentionally simple so a carer can edit it from a
phone or a printed sheet. The agent parses it into the schema defined in
`lib/schema.ts`.

## Required fields

| Field | Type | Purpose |
| --- | --- | --- |
| `name` | `string` | Full legal name of the person being cared for |
| `preferredName` | `string` | Name they actually like being called |
| `scheduleDate` | `string` | Date the schedule applies to, in "YYYY-MM-DD" format |
| `schedule` | `ScheduleItem[]` | Time-ordered list of today's events |
| `reminders` | `string[]` | Short standing reminders the agent may repeat |
| `contacts` | `Contact[]` | People the person may ask about or want to call |

## Example document

Use this exact shape. The parser is permissive about whitespace and
bullet style, but the section headers (`Name:`, `Preferred name:`,
`Today (...):`, `Reminders:`, `Contacts:`) must appear as shown.

```
Name: Margaret
Preferred name: Marg

Today (Tuesday 10 June 2025):
- 10:00 AM — Dr Patel, skin check, Greenslopes Medical
- 12:30 PM — Lunch with Sophie at home
- 2:00 PM — Afternoon tablets (blue box, kitchen bench)

Reminders:
- Don't drive — licence surrendered March 2026
- Sophie is David's daughter

Contacts:
- James (son): 0400 000 000
```

## Notes

- **Today (Day Date): header must match today's actual date — update it
  each morning.** The day-of-week and date in parentheses are how the
  agent knows the schedule block is current. If the header is stale the
  agent will refuse to use the schedule.
- Bullets can be `-`, `•`, or `*`. Use whichever is easiest to type;
  the parser treats them identically.
- Times in the `Today` block should be normalised to the `H:MM AM/PM`
  form shown in the example (e.g. `10:00 AM`, `2:00 PM`). The em-dash
  separating the time from the activity may also be a hyphen.
- Locations on schedule items are optional. If present they follow the
  activity, separated by a comma.
- Contacts use the form `Name (relationship): phone`. The phone number
  is optional and may be omitted along with the trailing colon.
- All values in the example above are illustrative placeholders. Replace
  them with the real person's details before the agent goes live.
