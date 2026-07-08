import type {SanityClient} from '@sanity/client'

/** Best-effort preview title lookup across arbitrary document types. */
export async function resolveTitles(
  client: SanityClient,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()

  const rows = await client.fetch<{_id: string; title: string | null}[]>(
    `*[_id in $ids]{_id, "title": coalesce(title, name, heading, label, _type)}`,
    {ids: Array.from(new Set(ids))},
  )

  return new Map(rows.map((row) => [row._id, row.title ?? row._id]))
}
