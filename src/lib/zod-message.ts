/**
 * Turns a validation problem into something a person can act on. Messages written by us in the schemas pass through
 * unchanged; the library's own wording ("Invalid input: expected string, received undefined", "Too small: …") is replaced
 * by a plain sentence that names the field.
 */
interface IssueLike {
  message: string;
  path: readonly PropertyKey[];
}

const LIBRARY_WORDING = /^(Invalid input|Invalid (string|number|option|enum|type|value|literal|email|format|url|key|element)|Too (small|big)|Required|Expected|String must|Number must|Array must|Unrecognized key)|expected .+ (received|to have)|received (undefined|null|string|number)/i;

/** "student_info" or "orderWindow.closesAt" → "student info" / "order window › closes at" */
const label = (path: readonly PropertyKey[]): string =>
  path
    .filter((p): p is string => typeof p === "string")
    .map((p) => p.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase())
    .join(" › ");

export function issueMessage(issue: IssueLike, noun = "field"): string {
  if (issue.message && !LIBRARY_WORDING.test(issue.message)) return issue.message;
  const where = label(issue.path);
  return where ? `Please check the “${where}” ${noun}.` : "Some of what you entered isn’t valid. Please check it and try again.";
}
