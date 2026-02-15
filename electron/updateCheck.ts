/**
 * GitHub Releases 기반 업데이트 확인.
 * 하루에 한 번만 API를 호출하고, 새 버전이 있으면 메뉴에 알림을 표시한다.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GITHUB_REPO = 'es-studio/ChatGPT-Lite';
const GITHUB_RELEASES_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const GITHUB_RELEASES_PAGE = `https://github.com/${GITHUB_REPO}/releases`;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24시간

export type UpdateInfo = {
  hasUpdate: boolean;
  latestVersion: string;
  releaseUrl: string;
};

type UpdateCheckState = {
  lastCheck: number;
  latestVersion?: string;
  releaseUrl?: string;
};

function getStatePath(userDataPath: string): string {
  return path.join(userDataPath, 'update-check.json');
}

function loadState(userDataPath: string): UpdateCheckState | null {
  const statePath = getStatePath(userDataPath);
  if (!existsSync(statePath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(readFileSync(statePath, 'utf8')) as UpdateCheckState;
    if (typeof parsed.lastCheck !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveState(userDataPath: string, state: UpdateCheckState): void {
  const statePath = getStatePath(userDataPath);
  writeFileSync(statePath, JSON.stringify(state));
}

/**
 * "v0.1.1" vs "0.1.0" 형태의 버전 비교.
 * latest가 current보다 새 버전이면 true.
 */
function isNewerVersion(current: string, latest: string): boolean {
  const normalize = (v: string) =>
    v
      .replace(/^v/i, '')
      .split('.')
      .map((n) => parseInt(n, 10) || 0);

  const c = normalize(current);
  const l = normalize(latest);

  for (let i = 0; i < Math.max(c.length, l.length); i++) {
    const a = c[i] ?? 0;
    const b = l[i] ?? 0;
    if (b > a) return true;
    if (b < a) return false;
  }
  return false;
}

/**
 * GitHub API에서 최신 릴리스 정보를 가져온다.
 */
async function fetchLatestRelease(): Promise<{ tag_name: string; html_url: string } | null> {
  try {
    const res = await fetch(GITHUB_RELEASES_API, {
      headers: { Accept: 'application/vnd.github.v3+json' }
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { tag_name?: string; html_url?: string };
    if (!data?.tag_name || !data?.html_url) return null;
    return { tag_name: data.tag_name, html_url: data.html_url };
  } catch {
    return null;
  }
}

/**
 * 업데이트 확인이 필요한지 (마지막 확인 후 24시간 경과).
 */
export function shouldCheckForUpdate(userDataPath: string): boolean {
  const state = loadState(userDataPath);
  if (!state) return true;
  return Date.now() - state.lastCheck >= CHECK_INTERVAL_MS;
}

/**
 * 업데이트 확인을 수행한다.
 * - 24시간 이내에 이미 확인했고 캐시된 결과가 있으면 그대로 반환
 * - 그렇지 않으면 GitHub API를 호출하고 결과를 저장
 */
export async function checkForUpdate(
  currentVersion: string,
  userDataPath: string
): Promise<UpdateInfo> {
  const state = loadState(userDataPath);
  const now = Date.now();

  // 24시간 이내에 확인했고 캐시가 있으면 API 호출 없이 반환
  if (state && now - state.lastCheck < CHECK_INTERVAL_MS && state.latestVersion) {
    const hasUpdate = isNewerVersion(currentVersion, state.latestVersion);
    return {
      hasUpdate,
      latestVersion: state.latestVersion,
      releaseUrl: state.releaseUrl ?? GITHUB_RELEASES_PAGE
    };
  }

  const release = await fetchLatestRelease();
  const latestVersion = release?.tag_name?.replace(/^v/i, '') ?? currentVersion;
  const releaseUrl = release?.html_url ?? GITHUB_RELEASES_PAGE;

  saveState(userDataPath, {
    lastCheck: now,
    latestVersion,
    releaseUrl
  });

  const hasUpdate = isNewerVersion(currentVersion, latestVersion);

  return {
    hasUpdate,
    latestVersion,
    releaseUrl
  };
}

export { GITHUB_RELEASES_PAGE };
