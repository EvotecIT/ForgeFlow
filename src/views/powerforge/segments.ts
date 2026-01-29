import type { JsonRecord } from './utils';

export type PowerForgeSegment = JsonRecord & {
  Type?: string;
  ArtefactType?: string;
  Kind?: string;
  Configuration?: JsonRecord;
  Settings?: JsonRecord;
  Options?: JsonRecord;
  PlaceHolderOption?: JsonRecord;
  BuildLibraries?: JsonRecord;
  ImportModules?: JsonRecord;
};

export function findSegmentIndex(segments: PowerForgeSegment[], type: string): number {
  return segments.findIndex((segment) => segment?.Type === type);
}

export function findArtefactSegment(segments: PowerForgeSegment[], type: string): PowerForgeSegment | undefined {
  return segments.find((segment) => segment?.Type === type || segment?.ArtefactType === type);
}

export function findArtefactSegmentIndex(segments: PowerForgeSegment[], type: string): number {
  return segments.findIndex((segment) => segment?.Type === type || segment?.ArtefactType === type);
}

export function updateSegment(
  segments: PowerForgeSegment[],
  type: string,
  enabled: boolean,
  mutate: (segment: PowerForgeSegment) => void
): void {
  const index = findSegmentIndex(segments, type);
  if (enabled) {
    const segment = index >= 0 ? segments[index] : { Type: type };
    if (index < 0) {
      segments.push(segment);
    }
    segment.Type = type;
    mutate(segment);
  } else if (index >= 0) {
    segments.splice(index, 1);
  }
}

export function updateArtefactSegment(
  segments: PowerForgeSegment[],
  type: string,
  enabled: boolean,
  mutate: (segment: PowerForgeSegment) => void
): void {
  const index = findArtefactSegmentIndex(segments, type);
  if (enabled) {
    const segment = index >= 0 ? segments[index] : { Type: type };
    if (index < 0) {
      segments.push(segment);
    }
    segment.Type = type;
    mutate(segment);
  } else if (index >= 0) {
    segments.splice(index, 1);
  }
}

export function isModuleDependencySegment(segment: PowerForgeSegment): boolean {
  const kind = segment?.Type ?? segment?.Kind;
  return kind === 'RequiredModule' || kind === 'ExternalModule' || kind === 'ApprovedModule';
}
