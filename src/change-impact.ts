export type ChangeImpactArea =
  | 'api-surface'
  | 'models'
  | 'runtime'
  | 'build-metadata'
  | 'publish-workflow'
  | 'documentation'
  | 'custom-scaffold'
  | 'unknown';

export interface ChangeImpactDetail {
  area: ChangeImpactArea;
  paths: string[];
}

export interface ChangeImpactSummary {
  schemaVersion: 1;
  areas: ChangeImpactArea[];
  details: ChangeImpactDetail[];
  requiresVerification: boolean;
  summary: string;
}

export interface ChangeImpactInput {
  createdGeneratedFiles: string[];
  updatedGeneratedFiles: string[];
  unchangedGeneratedFiles: string[];
  deletedGeneratedFiles: string[];
  scaffoldedFiles: string[];
  preservedScaffoldFiles: string[];
  backedUpFiles: string[];
}

const IMPACT_AREA_ORDER: ChangeImpactArea[] = [
  'api-surface',
  'models',
  'runtime',
  'build-metadata',
  'publish-workflow',
  'documentation',
  'custom-scaffold',
  'unknown',
];

const VERIFICATION_TRIGGER_AREAS = new Set<ChangeImpactArea>([
  'api-surface',
  'models',
  'runtime',
  'build-metadata',
  'publish-workflow',
  'unknown',
]);

const BUILD_METADATA_FILES = new Set([
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'tsconfig.json',
  'tsconfig.build.json',
  'vite.config.ts',
  'vite.config.js',
  'vite.config.mjs',
  'vite.config.cjs',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'settings.gradle',
  'settings.gradle.kts',
  'gradle.properties',
  'package.swift',
  'cargo.toml',
  'cargo.lock',
  'go.mod',
  'go.sum',
  'pyproject.toml',
  'setup.py',
  'requirements.txt',
  'requirements-dev.txt',
  'pubspec.yaml',
  'analysis_options.yaml',
  'composer.json',
  'gemfile',
  'sdkwork-sdk.json',
]);

const DOCUMENTATION_FILES = new Set([
  'readme.md',
  'changelog.md',
  'contributing.md',
  'release-notes.md',
]);

export function analyzeChangeImpact(changes: ChangeImpactInput): ChangeImpactSummary {
  const relevantPaths = sortPaths([
    ...changes.createdGeneratedFiles,
    ...changes.updatedGeneratedFiles,
    ...changes.deletedGeneratedFiles,
    ...changes.scaffoldedFiles,
    ...changes.backedUpFiles,
  ]);
  const pathsByArea = new Map<ChangeImpactArea, Set<string>>();

  for (const relativePath of relevantPaths) {
    for (const area of classifyPath(relativePath)) {
      if (!pathsByArea.has(area)) {
        pathsByArea.set(area, new Set());
      }
      pathsByArea.get(area)!.add(relativePath);
    }
  }

  const areas = IMPACT_AREA_ORDER.filter((area) => pathsByArea.has(area));
  const details = areas.map((area) => ({
    area,
    paths: sortPaths(Array.from(pathsByArea.get(area) || [])),
  }));
  const requiresVerification = areas.some((area) => VERIFICATION_TRIGGER_AREAS.has(area));

  return {
    schemaVersion: 1,
    areas,
    details,
    requiresVerification,
    summary: buildImpactSummary(areas, requiresVerification),
  };
}

function classifyPath(relativePath: string): ChangeImpactArea[] {
  const normalizedPath = normalizePath(relativePath);
  const segments = normalizedPath.split('/').filter(Boolean);
  const fileName = segments[segments.length - 1] || normalizedPath;
  const lowerFileName = fileName.toLowerCase();
  const lowerSegments = segments.map((segment) => segment.toLowerCase());
  const areaSet = new Set<ChangeImpactArea>();

  if (lowerSegments[0] === 'custom') {
    areaSet.add('custom-scaffold');
  }

  if (isDocumentationPath(lowerSegments, lowerFileName)) {
    areaSet.add('documentation');
  }
  if (isPublishWorkflowPath(lowerSegments)) {
    areaSet.add('publish-workflow');
  }
  if (isBuildMetadataPath(lowerFileName)) {
    areaSet.add('build-metadata');
  }
  if (isRuntimePath(lowerSegments, lowerFileName)) {
    areaSet.add('runtime');
  }
  if (isModelPath(lowerSegments, lowerFileName)) {
    areaSet.add('models');
  }
  if (isApiSurfacePath(lowerSegments, lowerFileName)) {
    areaSet.add('api-surface');
  }

  if (areaSet.size === 0) {
    areaSet.add('unknown');
  }

  return IMPACT_AREA_ORDER.filter((area) => areaSet.has(area));
}

function isDocumentationPath(segments: string[], fileName: string): boolean {
  return DOCUMENTATION_FILES.has(fileName) || segments[0] === 'docs';
}

function isPublishWorkflowPath(segments: string[]): boolean {
  return segments[0] === 'bin'
    || (segments[0] === '.github' && segments[1] === 'workflows');
}

function isBuildMetadataPath(fileName: string): boolean {
  return BUILD_METADATA_FILES.has(fileName)
    || fileName.endsWith('.csproj')
    || fileName.endsWith('.gemspec');
}

function isRuntimePath(segments: string[], fileName: string): boolean {
  return segments.includes('http')
    || segments.includes('auth')
    || segments.includes('runtime')
    || segments.includes('transport')
    || fileName === 'http_client.py'
    || fileName === 'sdk_config.dart'
    || fileName === 'httpclient.cs'
    || fileName === 'httpclient.java'
    || fileName === 'httpclient.kt';
}

function isModelPath(segments: string[], fileName: string): boolean {
  return segments.includes('model')
    || segments.includes('models')
    || segments.includes('types')
    || segments.includes('schemas')
    || fileName === 'models.dart'
    || fileName === 'models.swift'
    || fileName === 'types.ts';
}

function isApiSurfacePath(segments: string[], fileName: string): boolean {
  return segments.includes('api')
    || segments.includes('apis')
    || segments.includes('service')
    || segments.includes('services')
    || fileName === 'api.ts'
    || fileName === 'api.dart'
    || fileName === 'api.cs'
    || fileName === 'api.swift'
    || fileName === 'api.go'
    || fileName === 'api.rb'
    || fileName === 'paths.ts'
    || fileName === 'paths.rs'
    || fileName === 'apipaths.java'
    || fileName === 'apipaths.cs'
    || fileName === 'apipaths.kt'
    || isClientEntrypoint(fileName);
}

function isClientEntrypoint(fileName: string): boolean {
  return fileName === '__init__.py'
    || fileName === 'lib.rs'
    || fileName === 'sdk.ts'
    || fileName === 'sdk.js'
    || fileName === 'client.py'
    || /(^|[-_])client\.(ts|js|dart|swift|go|rb|php)$/i.test(fileName)
    || /^sdkwork.*client\.(java|kt|cs|php)$/i.test(fileName);
}

function buildImpactSummary(
  areas: ChangeImpactArea[],
  requiresVerification: boolean
): string {
  if (areas.length === 0) {
    return 'No generated, scaffold, or backup changes detected. Verification can be skipped.';
  }

  if (!requiresVerification) {
    return 'Only documentation and custom scaffold changes were detected. Verification can be skipped.';
  }

  return `Detected impact areas: ${areas.join(', ')}. Verification is required.`;
}

function normalizePath(relativePath: string): string {
  return String(relativePath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/');
}

function sortPaths(paths: string[]): string[] {
  return Array.from(new Set(paths.map((path) => normalizePath(path))))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}
