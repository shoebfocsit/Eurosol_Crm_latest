let unauthorizedCallback: (() => void) | null = null;

export function registerUnauthorizedCallback(cb: () => void): void {
  unauthorizedCallback = cb;
}

export function triggerUnauthorized(): void {
  unauthorizedCallback?.();
}
