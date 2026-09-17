import { describe, it, expect } from "vitest";
import { parseSchedule } from "../agents/scheduleParser.js";

describe("parseSchedule", () => {
  it("parses 'every weekday at 8am'", () => {
    const result = parseSchedule("Every weekday at 8am check the site");
    expect(result?.cron).toBe("0 8 * * 1-5");
  });

  it("parses 'every day at 6pm'", () => {
    const result = parseSchedule("every day at 6pm send me a report");
    expect(result?.cron).toBe("0 18 * * *");
  });

  it("parses 'every Monday at 9:30am'", () => {
    const result = parseSchedule("every Monday at 9:30am do the thing");
    expect(result?.cron).toBe("30 9 * * 1");
  });

  it("parses 'every 2 hours'", () => {
    const result = parseSchedule("every 2 hours check status");
    expect(result?.cron).toBe("0 */2 * * *");
  });

  it("returns null when there is no recurrence phrase", () => {
    expect(parseSchedule("check this website right now")).toBeNull();
  });
});
