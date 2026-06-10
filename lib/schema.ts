import { z } from "zod";

export const Contact = z.object({
  name: z.string(),
  relationship: z.string(),
  phone: z.string().optional(),
});

export const ScheduleItem = z.object({
  time: z.string(),        // normalised "10:00 AM"
  title: z.string(),
  location: z.string().optional(),
});

export const Doc = z.object({
  name: z.string(),
  preferredName: z.string(),
  scheduleDate: z.string(),   // "YYYY-MM-DD"
  schedule: z.array(ScheduleItem),
  reminders: z.array(z.string()),
  contacts: z.array(Contact),
});

export type Doc = z.infer<typeof Doc>;
export type ScheduleItem = z.infer<typeof ScheduleItem>;
export type Contact = z.infer<typeof Contact>;
