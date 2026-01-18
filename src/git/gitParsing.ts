export interface TrackInfo {
  ahead: number;
  behind: number;
  isGone: boolean;
}

export function parseTrack(value?: string): TrackInfo {
  if (!value) {
    return { ahead: 0, behind: 0, isGone: false };
  }
  if (value.includes('gone')) {
    return { ahead: 0, behind: 0, isGone: true };
  }
  const aheadMatch = /ahead\s+(\d+)/i.exec(value);
  const behindMatch = /behind\s+(\d+)/i.exec(value);
  return {
    ahead: aheadMatch ? Number(aheadMatch[1]) : 0,
    behind: behindMatch ? Number(behindMatch[1]) : 0,
    isGone: false
  };
}

export function buildStatusLabel(input: {
  isCurrent: boolean;
  isGone: boolean;
  hasUpstream: boolean;
  ahead: number;
  behind: number;
  isMerged: boolean;
  isStale: boolean;
  ageDays?: number;
}): string {
  const labels: string[] = [];
  if (input.isCurrent) {
    labels.push('current');
  }
  if (input.isGone) {
    labels.push('gone');
  } else if (!input.hasUpstream) {
    labels.push('no upstream');
  }
  if (input.ahead > 0 && input.behind > 0) {
    labels.push(`diverged ${input.ahead}/${input.behind}`);
  } else if (input.ahead > 0) {
    labels.push(`ahead ${input.ahead}`);
  } else if (input.behind > 0) {
    labels.push(`behind ${input.behind}`);
  }
  if (input.isMerged) {
    labels.push('merged');
  }
  if (input.isStale && input.ageDays !== undefined) {
    labels.push(`stale ${input.ageDays}d`);
  }
  if (labels.length === 0) {
    return 'clean';
  }
  return labels.join(' · ');
}

export function diffDays(isoDate: string): number | undefined {
  const timestamp = Date.parse(isoDate);
  if (Number.isNaN(timestamp)) {
    return undefined;
  }
  const diffMs = Date.now() - timestamp;
  if (diffMs < 0) {
    return 0;
  }
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}
