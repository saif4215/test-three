"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main" className="container-page flex min-h-[70dvh] flex-col items-center justify-center py-20 text-center">
      <h1 className="display text-6xl sm:text-8xl">Something went wrong</h1>
      <p className="mx-auto mt-5 max-w-md text-muted">We couldn’t load this page. Please try again. If the problem continues, contact us.</p>
      {error.digest ? <p className="mt-2 text-xs text-muted">Reference: {error.digest}</p> : null}
      <button type="button" onClick={reset} className="btn-primary mt-8">
        Try again
      </button>
    </main>
  );
}
