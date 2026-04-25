// Sleep function for adding delays when needed
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Converts a JavaScript date object into a readable format
// e.g. "March 21 2026, 9:45 PM PDT"
export function formatTimestamp(date) {
  return date.toLocaleString("en-US", {
    month:        "long",    // full month name
    day:          "numeric", // day number
    year:         "numeric", // 4-digit year
    hour:         "numeric", // hour number
    minute:       "2-digit", // always 2 digits e.g. "05" not "5"
    hour12:       true,      // use 12-hour format with AM/PM
    timeZoneName: "short"    // abbreviated timezone e.g. "PDT"
  });
}

// Converts normal text into Discord strikethrough format
export function strikethroughText(text) {
  return `~~${text}~~`;
}