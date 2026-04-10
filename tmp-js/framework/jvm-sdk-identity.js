import { toSafeSnakeIdentifier } from './identifiers.js';
const EMPTY_RESERVED_WORDS = new Set();
const DEFAULT_GROUP_ID = 'com.sdkwork';
export function resolveJvmSdkIdentity(config) {
    const defaultArtifactId = `${config.sdkType}-sdk`;
    const coordinate = parseSdkCoordinate(config.packageName, defaultArtifactId);
    const packageRoot = resolvePackageRoot(config, coordinate.groupId, coordinate.artifactId);
    return {
        groupId: coordinate.groupId,
        artifactId: coordinate.artifactId,
        version: config.version,
        packageRoot,
        packagePath: packageRoot.replace(/\./g, '/'),
    };
}
function parseSdkCoordinate(rawPackageName, defaultArtifactId) {
    const raw = String(rawPackageName || '').trim();
    if (!raw) {
        return {
            groupId: DEFAULT_GROUP_ID,
            artifactId: defaultArtifactId,
        };
    }
    const parts = raw.split(':').map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
        return {
            groupId: parts[0],
            artifactId: parts[1],
        };
    }
    return {
        groupId: DEFAULT_GROUP_ID,
        artifactId: parts[0] || defaultArtifactId,
    };
}
function resolvePackageRoot(config, groupId, artifactId) {
    const explicitNamespace = String(config.namespace || '').trim();
    if (explicitNamespace) {
        return normalizeNamespace(explicitNamespace);
    }
    const groupSegments = splitNamespaceSegments(groupId);
    const artifactSegments = trimTrailingSdkSegment(splitIdentifierParts(artifactId).map(normalizePackageSegment));
    const dedupedArtifactSegments = artifactSegments.slice(calculateOverlap(groupSegments, artifactSegments));
    const combined = [...groupSegments, ...dedupedArtifactSegments].filter(Boolean);
    if (combined.length > 0) {
        return combined.join('.');
    }
    return normalizeNamespace(config.sdkType) || `${DEFAULT_GROUP_ID}.${normalizePackageSegment(config.sdkType)}`;
}
function normalizeNamespace(value) {
    const segments = splitNamespaceSegments(value);
    return segments.join('.');
}
function splitNamespaceSegments(value) {
    return String(value || '')
        .replace(/[\\/]+/g, '.')
        .split('.')
        .map((segment) => normalizePackageSegment(segment))
        .filter(Boolean);
}
function normalizePackageSegment(value) {
    return toSafeSnakeIdentifier(value, EMPTY_RESERVED_WORDS, 'pkg');
}
function splitIdentifierParts(value) {
    return String(value || '')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[^a-zA-Z0-9]+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
}
function trimTrailingSdkSegment(segments) {
    if (segments.length > 1 && segments[segments.length - 1] === 'sdk') {
        return segments.slice(0, -1);
    }
    return segments;
}
function calculateOverlap(groupSegments, artifactSegments) {
    const maxOverlap = Math.min(groupSegments.length, artifactSegments.length);
    for (let size = maxOverlap; size > 0; size -= 1) {
        const groupSuffix = groupSegments.slice(groupSegments.length - size);
        const artifactPrefix = artifactSegments.slice(0, size);
        if (groupSuffix.join('.') === artifactPrefix.join('.')) {
            return size;
        }
    }
    return 0;
}
