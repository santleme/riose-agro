export function initialGraphicsDomain(search, benchmarkFixtureMode) {
  if (benchmarkFixtureMode) return 'beef';
  return new URLSearchParams(search).get('scene') === 'dairy' ? 'dairy' : 'beef';
}

export async function loadImageEntriesConcurrently(entries, loadImage) {
  const loadedEntries = await Promise.all(entries.map(async ([key, url]) => [key, await loadImage(url)]));
  return Object.fromEntries(loadedEntries);
}
