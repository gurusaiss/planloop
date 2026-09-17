const DAY_MAP: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

/**
 * Converts common natural-language recurrence phrases into a cron
 * expression + human summary. Returns null when nothing schedule-like was
 * found (the workflow is then created as manual-trigger only).
 */
export function parseSchedule(text: string): { cron: string; summary: string } | null {
  const lower = text.toLowerCase();

  const timeMatch = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  let hour = 8;
  let minute = 0;
  if (timeMatch) {
    hour = parseInt(timeMatch[1], 10);
    minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    if (timeMatch[3] === "pm" && hour < 12) hour += 12;
    if (timeMatch[3] === "am" && hour === 12) hour = 0;
  }

  if (/every\s+weekday/.test(lower)) {
    return { cron: `${minute} ${hour} * * 1-5`, summary: `Every weekday at ${fmt(hour, minute)}` };
  }
  if (/every\s+day|daily/.test(lower)) {
    return { cron: `${minute} ${hour} * * *`, summary: `Every day at ${fmt(hour, minute)}` };
  }
  const dayMatch = Object.keys(DAY_MAP).find((d) => new RegExp(`every\\s+${d}`).test(lower));
  if (dayMatch) {
    return {
      cron: `${minute} ${hour} * * ${DAY_MAP[dayMatch]}`,
      summary: `Every ${capitalize(dayMatch)} at ${fmt(hour, minute)}`,
    };
  }
  const hourlyMatch = lower.match(/every\s+(\d+)\s+hours?/);
  if (hourlyMatch) {
    const n = parseInt(hourlyMatch[1], 10);
    return { cron: `0 */${n} * * *`, summary: `Every ${n} hour(s)` };
  }

  return null;
}

function fmt(hour: number, minute: number) {
  const h = hour % 24;
  const period = h >= 12 ? "PM" : "AM";
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  return `${displayHour}:${minute.toString().padStart(2, "0")} ${period}`;
}
function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
