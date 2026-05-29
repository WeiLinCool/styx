export type BrowserFingerprintSnapshot = {
  userAgent?: string;
  language?: string;
  timezone?: string;
  platform?: string;
  hardwareConcurrency?: number;
  colorDepth?: number;
  screenWidth?: number;
  screenHeight?: number;
};

export type BrowserFingerprintPayload = {
  userAgent: string;
  language: string;
  timezone: string;
  platform: string;
  hardwareConcurrency: number;
  colorDepth: number;
  screen: {
    width: number;
    height: number;
  };
};

function text(value: string | undefined) {
  return value && value.trim().length > 0 ? value.trim() : 'unknown';
}

function number(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function normalizeBrowserFingerprint(
  snapshot: BrowserFingerprintSnapshot,
): BrowserFingerprintPayload {
  return {
    colorDepth: number(snapshot.colorDepth),
    hardwareConcurrency: number(snapshot.hardwareConcurrency),
    language: text(snapshot.language),
    platform: text(snapshot.platform),
    screen: {
      height: number(snapshot.screenHeight),
      width: number(snapshot.screenWidth),
    },
    timezone: text(snapshot.timezone),
    userAgent: text(snapshot.userAgent),
  };
}

export function collectBrowserFingerprint(): BrowserFingerprintPayload {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return normalizeBrowserFingerprint({
    colorDepth: window.screen?.colorDepth,
    hardwareConcurrency: window.navigator.hardwareConcurrency,
    language: window.navigator.language,
    platform: window.navigator.platform,
    screenHeight: window.screen?.height,
    screenWidth: window.screen?.width,
    timezone,
    userAgent: window.navigator.userAgent,
  });
}
