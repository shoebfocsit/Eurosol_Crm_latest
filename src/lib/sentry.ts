import * as Sentry from "@sentry/react";

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  // Skip during tests; allow noop if DSN not configured (useful for local dev)
  const isTest = import.meta.env.MODE === "test" || Boolean((import.meta as unknown as { env: Record<string, unknown> }).env?.VITEST);

  if (isTest) return;

  Sentry.init({
    dsn: dsn || undefined,
    enabled: !!dsn,
    environment: (import.meta.env.VITE_SENTRY_ENV as string) || import.meta.env.MODE,
    release: (import.meta.env.VITE_SENTRY_RELEASE as string) || undefined,
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    replaysSessionSampleRate: Number(import.meta.env.VITE_SENTRY_REPLAYS_SAMPLE_RATE ?? 0.0),
    replaysOnErrorSampleRate: Number(import.meta.env.VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE ?? 0),
    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
      }),
    ],
    // Loki alternative: structured console transport can be added here
    // e.g., pino -> Loki via promtail. Sentry is primary per task 3.
    beforeSend(event) {
      // filter noisy 401s (auth redirect) from Sentry
      if (event.request?.url?.includes("/auth/login")) return null;
      return event;
    },
  });
}

export { Sentry };
