/** Used when an administrator chooses a password. Length matters more than symbols. */
const COMMON = new Set([
  "password", "password1", "password123", "passw0rd", "123456789012", "qwertyuiop12", "letmein12345", "iloveyou1234",
  "administrator", "welcome12345", "changeme1234", "adminadmin12", "abcdefghijkl", "111111111111", "000000000000",
]);

/** Words people pad with digits ("password1234", "Welcome2026!"). Compared with everything but the letters removed. */
const BASE_WORDS = new Set(["password", "passw", "pass", "welcome", "letmein", "qwerty", "qwertyuiop", "asdfgh", "admin", "administrator", "changeme", "iloveyou", "trustno", "monkey", "dragon", "football", "baseball", "sunshine", "princess", "master", "login", "school", "teacher", "student", "secret"]);

export function checkPassword(password: string, email = ""): string | null {
  if (password.length < 12) return "Use at least 12 characters. A few random words in a row works well.";
  if (password.length > 200) return "That password is too long (200 characters at most).";
  if (new Set(password).size < 5) return "That password repeats the same characters too much.";
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return "That password is too common. Choose something less guessable.";
  if (/^[0-9]+$/.test(password)) return "Add some letters: a password of only digits is easy to guess.";
  if (BASE_WORDS.has(lower.replace(/[^a-z]/g, ""))) return "That password is too common. Choose something less guessable.";
  const local = email.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) return "Don’t include your email name in your password.";
  return null;
}
