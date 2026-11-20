"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", textAlign: "center", padding: "6rem 1rem" }}>
        <h1 style={{ fontSize: "2rem" }}>Something went wrong</h1>
        <p>Please try again in a moment.</p>
        <button type="button" onClick={reset} style={{ marginTop: "1rem", padding: "0.75rem 1.5rem", borderRadius: 999, border: 0, background: "#111", color: "#fff", fontSize: 16 }}>
          Try again
        </button>
      </body>
    </html>
  );
}
