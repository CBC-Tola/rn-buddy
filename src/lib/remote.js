const TIMEOUT_MS = 5000;

// Returns parsed JSON, or null on any failure (offline, timeout, 404).
// rn-buddy must keep working without internet.
async function getJson(url, init = {}) {
  try {
    const response = await fetch(url, {
      ...init,
      headers: { 'user-agent': 'rn-buddy', ...init.headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

// Maintenance and New Architecture status for many packages in one request.
// Result: { [name]: { newArchitecture: 'supported' | 'untested' | ..., unmaintained?: true } }
// Packages the directory doesn't know are left out.
export async function checkPackages(names) {
  if (names.length === 0) return {};
  const data = await getJson('https://reactnative.directory/api/libraries/check', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ packages: names }),
  });
  return data ?? {};
}

// Library info from React Native Directory (https://reactnative.directory).
export async function directoryInfo(name) {
  const data = await getJson(
    `https://reactnative.directory/api/libraries?search=${encodeURIComponent(name)}&limit=10`,
  );
  const lib = data?.libraries?.find((library) => library.npmPkg === name);
  if (!lib) return null;

  return {
    description: lib.github?.description ?? null,
    hasNativeCode: lib.github?.hasNativeCode ?? null,
    unmaintained: Boolean(lib.unmaintained),
    weeklyDownloads: lib.npm?.weekDownloads ?? null,
    repo: lib.githubUrl ?? null,
  };
}

// The package.json of the latest version on npm, or null if the package doesn't exist (or we're offline).
export async function npmLatest(name) {
  return getJson(`https://registry.npmjs.org/${name.replace('/', '%2F')}/latest`);
}

// The "description" field from the package's latest version on npm.
export async function npmDescription(name) {
  return (await npmLatest(name))?.description ?? null;
}

// Tries React Native Directory first, then npm.
export async function describeOnline(name) {
  const lib = await directoryInfo(name);
  if (lib?.description) return { note: lib.description, source: 'React Native Directory' };

  const description = await npmDescription(name);
  if (description) return { note: description, source: 'npm' };

  return null;
}

// npm's dist-tags for a package ({ latest: '1.2.3', next: ... }), or null.
// The abbreviated metadata is much smaller than the full document.
export async function npmDistTags(name) {
  const data = await getJson(`https://registry.npmjs.org/${name.replace('/', '%2F')}`, {
    headers: { accept: 'application/vnd.npm.install-v1+json' },
  });
  return data?.['dist-tags'] ?? null;
}
