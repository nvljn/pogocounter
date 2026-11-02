let catalog: Promise<Record<string, string> | undefined> | undefined;

/** Share one optional local artwork index between the selected boss and search rows. */
export async function previewUrl(key: string): Promise<string | undefined> {
  const base = new URL(import.meta.env.BASE_URL, location.href);
  catalog ??= fetch(new URL('preview-manifest.json', base)).then(async response => {
    if (!response.ok) return undefined;
    const data = await response.json() as { entries?: Record<string, string> };
    return data.entries;
  }).catch(() => undefined);
  const path = (await catalog)?.[key];
  return path && /^previews\/[a-f0-9]{20}\.webp$/.test(path) ? new URL(path, base).href : undefined;
}
