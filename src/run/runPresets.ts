import type { RunHistoryEntry, RunPreset } from '../models/run';

export function buildPresetFromEntry(entry: RunHistoryEntry, label: string, id: string): RunPreset {
  return {
    id,
    label,
    kind: entry.kind,
    filePath: entry.filePath,
    command: entry.command,
    workingDirectory: entry.workingDirectory,
    profileId: entry.profileId,
    target: entry.target,
    taskName: entry.taskName,
    taskSource: entry.taskSource
  };
}
