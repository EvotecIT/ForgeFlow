import * as path from 'path';

export const EXCLUDE_PATTERN = '**/{node_modules,.git,Artifacts,Artefacts,bin,obj}/**';
export const POWERFORGE_PIPELINE_CONFIGS = [
  'powerforge.json',
  'powerforge.pipeline.json',
  path.join('.powerforge', 'pipeline.json')
];
export const POWERFORGE_DOTNETPUBLISH_CONFIGS = [
  'powerforge.dotnetpublish.json',
  'powerforge.dotnet.publish.json'
];
