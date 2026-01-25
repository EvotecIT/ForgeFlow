export function findSegmentIndex(segments: any[], type: string): number {
  return segments.findIndex((segment) => segment?.Type === type);
}

export function findArtefactSegment(segments: any[], type: string): any | undefined {
  return segments.find((segment) => segment?.Type === type || segment?.ArtefactType === type);
}

export function findArtefactSegmentIndex(segments: any[], type: string): number {
  return segments.findIndex((segment) => segment?.Type === type || segment?.ArtefactType === type);
}

export function updateSegment(segments: any[], type: string, enabled: boolean, mutate: (segment: any) => void): void {
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

export function updateArtefactSegment(segments: any[], type: string, enabled: boolean, mutate: (segment: any) => void): void {
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

export function isModuleDependencySegment(segment: any): boolean {
  const kind = segment?.Type ?? segment?.Kind;
  return kind === 'RequiredModule' || kind === 'ExternalModule' || kind === 'ApprovedModule';
}
