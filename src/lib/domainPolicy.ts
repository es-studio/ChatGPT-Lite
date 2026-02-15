const ALLOWED_PROTOCOLS = new Set(['https:']);
const ALLOWED_ROOT_HOSTS = [
  'chatgpt.com',
  'openai.com',
  'oaistatic.com',
  'oaiusercontent.com',
  'auth0.com',
  'google.com',
  'gstatic.com',
  'apple.com'
];

export function isAllowedChatGptUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);

    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      return false;
    }

    const host = parsed.hostname.toLowerCase();
    return ALLOWED_ROOT_HOSTS.some(
      (allowedHost) => host === allowedHost || host.endsWith(`.${allowedHost}`)
    );
  } catch {
    return false;
  }
}
