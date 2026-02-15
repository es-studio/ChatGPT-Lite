import { describe, expect, it } from 'vitest';
import { isAllowedChatGptUrl } from '../lib/domainPolicy';

describe('isAllowedChatGptUrl', () => {
  it('allows chatgpt.com', () => {
    expect(isAllowedChatGptUrl('https://chatgpt.com')).toBe(true);
  });

  it('allows subdomains of chatgpt.com', () => {
    expect(isAllowedChatGptUrl('https://sub.chatgpt.com/path')).toBe(true);
  });

  it('allows auth-related domains needed by ChatGPT login', () => {
    expect(isAllowedChatGptUrl('https://openai.com')).toBe(true);
    expect(isAllowedChatGptUrl('https://auth.openai.com')).toBe(true);
    expect(isAllowedChatGptUrl('https://accounts.google.com')).toBe(true);
    expect(isAllowedChatGptUrl('https://cdn.auth0.com')).toBe(true);
    expect(isAllowedChatGptUrl('https://cdn.oaistatic.com')).toBe(true);
  });

  it('blocks unrelated domains', () => {
    expect(isAllowedChatGptUrl('https://google-analytics.com')).toBe(false);
    expect(isAllowedChatGptUrl('https://example.com')).toBe(false);
  });

  it('blocks unsafe protocols', () => {
    expect(isAllowedChatGptUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedChatGptUrl('file:///tmp/index.html')).toBe(false);
  });
});
