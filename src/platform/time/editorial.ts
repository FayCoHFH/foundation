export const EDITORIAL_TIME_ZONE = "America/Chicago";

const DATE_TIME_LOCAL_PATTERN =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2})$/;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

type WallClockParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

const editorialTimeFormatter = new Intl.DateTimeFormat(
  "en-US-u-ca-gregory-nu-latn",
  {
    timeZone: EDITORIAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  },
);

function formatInEditorialTimeZone(timestamp: number): WallClockParts {
  const parts = Object.fromEntries(
    editorialTimeFormatter
      .formatToParts(new Date(timestamp))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function sameWallClock(left: WallClockParts, right: WallClockParts) {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute
  );
}

function offsetAt(timestamp: number) {
  const local = formatInEditorialTimeZone(timestamp);
  const localAsUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
  );
  return localAsUtc - Math.floor(timestamp / MINUTE_MS) * MINUTE_MS;
}

export function parseEditorialWallTime(
  value: string,
): { date: Date } | { error: string } {
  const match = DATE_TIME_LOCAL_PATTERN.exec(value);
  if (!match?.groups) {
    return { error: "Enter a complete date and time." };
  }

  const requested: WallClockParts = {
    year: Number(match.groups.year),
    month: Number(match.groups.month),
    day: Number(match.groups.day),
    hour: Number(match.groups.hour),
    minute: Number(match.groups.minute),
  };
  const wallClockAsUtc = Date.UTC(
    requested.year,
    requested.month - 1,
    requested.day,
    requested.hour,
    requested.minute,
  );
  const calendarRoundTrip = new Date(wallClockAsUtc);
  if (
    calendarRoundTrip.getUTCFullYear() !== requested.year ||
    calendarRoundTrip.getUTCMonth() + 1 !== requested.month ||
    calendarRoundTrip.getUTCDate() !== requested.day ||
    calendarRoundTrip.getUTCHours() !== requested.hour ||
    calendarRoundTrip.getUTCMinutes() !== requested.minute
  ) {
    return { error: "Enter a valid date and time." };
  }

  const offsets = new Set(
    [-2 * DAY_MS, -DAY_MS, 0, DAY_MS, 2 * DAY_MS].map((distance) =>
      offsetAt(wallClockAsUtc + distance),
    ),
  );
  const candidates = [...offsets]
    .map((offset) => wallClockAsUtc - offset)
    .filter((timestamp) =>
      sameWallClock(formatInEditorialTimeZone(timestamp), requested),
    );

  if (candidates.length === 0) {
    return {
      error:
        "That time does not exist in America/Chicago because the clock changes. Choose another time.",
    };
  }
  if (candidates.length > 1) {
    return {
      error:
        "That time occurs twice in America/Chicago because the clock changes. Choose another time.",
    };
  }

  return { date: new Date(candidates[0]!) };
}

export function formatEditorialDateTime(
  value: Date,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
  },
) {
  return `${new Intl.DateTimeFormat("en-US", {
    ...options,
    timeZone: EDITORIAL_TIME_ZONE,
  }).format(value)} CT`;
}

export function formatEditorialDateTimeInput(value: Date | null) {
  if (!value) return "";
  const parts = formatInEditorialTimeZone(value.valueOf());
  return (
    [
      `${parts.year}`.padStart(4, "0"),
      `${parts.month}`.padStart(2, "0"),
      `${parts.day}`.padStart(2, "0"),
    ].join("-") +
    `T${`${parts.hour}`.padStart(2, "0")}:${`${parts.minute}`.padStart(2, "0")}`
  );
}
