import { defineCollection, z } from 'astro:content'

import { documentSources } from './lib/vigotech/documents'
import { loadVigotechSources, slugify, toLocalGroupLogo } from './lib/vigotech/source'

type EventEntry = {
  id: string
  groupId: string
  groupName: string
  groupLogo: string | null
  title: string
  description: string | null
  date: number
  dateISO: string
  location: string | null
  link: string | null
}

type VideoEntry = {
  id: string
  sourceId: string
  groupId: string
  groupName: string
  groupLogo: string | null
  title: string
  player: string
  url: string | null
  publishedAt: number | null
  thumbnail: string | null
}

const groups = defineCollection({
  loader: async () => {
    const { source, generated } = await loadVigotechSources()
    const sourceMembers = source.members ?? {}
    const generatedMembers = generated.members ?? {}
    const keys = new Set([...Object.keys(sourceMembers), ...Object.keys(generatedMembers)])

    return [...keys].map((key) => {
      const fromSource = sourceMembers[key] ?? {}
      const fromGenerated = generatedMembers[key] ?? {}
      const sourceLinks = (fromSource.links ?? {}) as Record<string, string>
      const generatedLinks = (fromGenerated.links ?? {}) as Record<string, string>
      const links = { ...sourceLinks, ...generatedLinks }
      const name =
        ((fromGenerated.name as string | undefined) ??
          (fromSource.name as string | undefined) ??
          key) ||
        key
      const videoList = fromGenerated.videoList
      const videoCount = Array.isArray(videoList)
        ? videoList.length
        : videoList && typeof videoList === 'object'
          ? Object.keys(videoList as Record<string, unknown>).length
          : 0
      return {
        id: key,
        key,
        slug: slugify(key),
        name,
        logo: toLocalGroupLogo(
          (fromGenerated.logo as string | undefined) ??
            (fromSource.logo as string | undefined) ??
            null,
        ),
        links,
        inactive:
          (fromSource.inactive as boolean | undefined) ??
          (fromGenerated.inactive as boolean | undefined) ??
          false,
        hasVideos: videoCount > 0,
        videoCount,
      }
    })
  },
  schema: z.object({
    key: z.string(),
    slug: z.string(),
    name: z.string(),
    logo: z.string().nullable(),
    links: z.record(z.string(), z.string()).default({}),
    inactive: z.boolean().default(false),
    hasVideos: z.boolean(),
    videoCount: z.number(),
  }),
})

const events = defineCollection({
  loader: async () => {
    const useMockEvents = process.env.VIGOTECH_MOCK_EVENTS === 'true'
    const { generated, source } = await loadVigotechSources()
    const members = generated.members ?? {}
    const sourceMembers = source.members ?? {}
    const entries: EventEntry[] = []

    const resolveGroupLogo = (groupId: string): string | null => {
      const generatedMember = members[groupId] as Record<string, unknown> | undefined
      const sourceMember = sourceMembers[groupId] as Record<string, unknown> | undefined
      return toLocalGroupLogo(
        (generatedMember?.logo as string | undefined) ??
          (sourceMember?.logo as string | undefined) ??
          null,
      )
    }

    const pushEvent = (groupId: string, groupName: string, eventRaw: unknown) => {
      if (!eventRaw || typeof eventRaw !== 'object') {
        return
      }

      const event = eventRaw as Record<string, unknown>
      const dateRaw = event.date
      const parsedDate =
        typeof dateRaw === 'number'
          ? dateRaw
          : typeof dateRaw === 'string'
            ? Date.parse(dateRaw)
            : Number.NaN

      if (!Number.isFinite(parsedDate)) {
        return
      }

      const title =
        (event.title as string | undefined) ??
        (event.name as string | undefined) ??
        `Upcoming event from ${groupName}`

      entries.push({
        id: `${groupId}-${parsedDate}-${slugify(title)}`,
        groupId,
        groupName,
        groupLogo: resolveGroupLogo(groupId),
        title,
        description: (event.description as string | undefined) ?? null,
        date: parsedDate,
        dateISO: new Date(parsedDate).toISOString(),
        location: (event.location as string | undefined) ?? null,
        link: (event.link as string | undefined) ?? (event.url as string | undefined) ?? null,
      })
    }

    pushEvent('root', generated.name ?? 'VigoTech Alliance', generated.nextEvent)

    for (const [groupId, member] of Object.entries(members)) {
      const groupName = ((member.name as string | undefined) ?? groupId) || groupId
      pushEvent(groupId, groupName, member.nextEvent)
    }

    if (useMockEvents) {
      const mergedGroups = new Map<string, string>()

      for (const [groupId, member] of Object.entries(sourceMembers)) {
        mergedGroups.set(groupId, ((member.name as string | undefined) ?? groupId) || groupId)
      }

      for (const [groupId, member] of Object.entries(members)) {
        mergedGroups.set(groupId, ((member.name as string | undefined) ?? groupId) || groupId)
      }

      const groupsWithEvents = new Set(entries.map((entry) => entry.groupId))
      const now = Date.now()
      const groupEntries = [...mergedGroups.entries()].filter(
        ([groupId]) => !groupsWithEvents.has(groupId),
      )
      const fallbackCount = Math.min(Math.max(0, 10 - entries.length), groupEntries.length)

      for (let index = 0; index < fallbackCount; index += 1) {
        const [groupId, groupName] = groupEntries[index]
        const fakeDate = now + (index + 1) * 1000 * 60 * 60 * 24 * 7
        const title = `${groupName} Meetup Session ${index + 1}`

        entries.push({
          id: `fake-${groupId}-${fakeDate}`,
          groupId,
          groupName,
          groupLogo: resolveGroupLogo(groupId),
          title,
          description: `Synthetic event generated for development preview of ${groupName}.`,
          date: fakeDate,
          dateISO: new Date(fakeDate).toISOString(),
          location: 'Vigo / Galicia',
          link: null,
        })
      }
    }

    return entries
  },
  schema: z.object({
    groupId: z.string(),
    groupName: z.string(),
    groupLogo: z.string().nullable(),
    title: z.string(),
    description: z.string().nullable(),
    date: z.number(),
    dateISO: z.string(),
    location: z.string().nullable(),
    link: z.string().nullable(),
  }),
})

const videos = defineCollection({
  loader: async () => {
    const { generated } = await loadVigotechSources()
    const members = generated.members ?? {}
    const entries: VideoEntry[] = []

    for (const [groupId, member] of Object.entries(members)) {
      const rawList = member.videoList
      const videoList = Array.isArray(rawList)
        ? rawList
        : rawList && typeof rawList === 'object'
          ? Object.values(rawList as Record<string, unknown>)
          : []
      const groupName = ((member.name as string | undefined) ?? groupId) || groupId
      const groupLogo = toLocalGroupLogo((member.logo as string | undefined) ?? null)

      videoList.forEach((videoRaw, index) => {
        if (!videoRaw || typeof videoRaw !== 'object') {
          return
        }

        const video = videoRaw as Record<string, unknown>
        const sourceId =
          (video.id as string | undefined) ?? `${groupId}-${String(video.pubDate ?? index)}`
        const title = (video.title as string | undefined) ?? `${groupName} video ${index + 1}`
        const pubDate =
          typeof video.pubDate === 'number'
            ? video.pubDate
            : typeof video.pubDate === 'string'
              ? Date.parse(video.pubDate)
              : null

        const thumbnails =
          (video.thumbnails as Record<string, Record<string, unknown>> | undefined) ?? {}
        const thumbnail =
          (thumbnails.standard?.url as string | undefined) ??
          (thumbnails.high?.url as string | undefined) ??
          (thumbnails.medium?.url as string | undefined) ??
          (thumbnails.default?.url as string | undefined) ??
          null

        const player = (video.player as string | undefined) ?? 'youtube'
        const url =
          player === 'youtube'
            ? `https://www.youtube.com/watch?v=${sourceId}`
            : ((video.url as string | undefined) ?? null)

        entries.push({
          id: `${groupId}-${sourceId}`,
          sourceId,
          groupId,
          groupName,
          groupLogo,
          title,
          player,
          url,
          publishedAt: pubDate,
          thumbnail,
        })
      })
    }

    return entries
  },
  schema: z.object({
    sourceId: z.string(),
    groupId: z.string(),
    groupName: z.string(),
    groupLogo: z.string().nullable(),
    title: z.string(),
    player: z.string(),
    url: z.string().nullable(),
    publishedAt: z.number().nullable(),
    thumbnail: z.string().nullable(),
  }),
})

const friends = defineCollection({
  loader: async () => {
    const { friends } = await loadVigotechSources()

    if (Array.isArray(friends)) {
      return friends.map((item, index) => {
        const friend = item as Record<string, unknown>
        const name = (friend.name as string | undefined) ?? `Friend ${index + 1}`
        return {
          id: slugify(name) || `friend-${index + 1}`,
          name,
          logo: (friend.logo as string | undefined) ?? null,
          link: (friend.link as string | undefined) ?? (friend.web as string | undefined) ?? null,
        }
      })
    }

    return Object.entries(friends).map(([key, value]) => {
      const friend = (value ?? {}) as Record<string, unknown>
      const name = ((friend.name as string | undefined) ?? key) || key
      return {
        id: slugify(key) || key,
        name,
        logo: (friend.logo as string | undefined) ?? null,
        link: (friend.link as string | undefined) ?? (friend.web as string | undefined) ?? null,
      }
    })
  },
  schema: z.object({
    name: z.string(),
    logo: z.string().nullable(),
    link: z.string().nullable(),
  }),
})

const documents = defineCollection({
  loader: {
    name: 'vigotech-documents-loader',
    load: async ({ store, parseData, renderMarkdown }) => {
      store.clear()

      for (const document of documentSources) {
        let markdown = `# ${document.title}\n\nSource unavailable during build.`

        try {
          const response = await fetch(document.url)
          if (response.ok) {
            markdown = await response.text()
          }
        } catch {
          // Keep fallback content
        }

        const data = await parseData({
          id: document.id,
          data: {
            title: document.title,
            slug: document.slug,
            sourceUrl: document.url,
          },
        })

        store.set({
          id: document.id,
          data,
          rendered: await renderMarkdown(markdown),
        })
      }
    },
  },
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    sourceUrl: z.string().url(),
  }),
})

export const collections = {
  groups,
  events,
  videos,
  friends,
  documents,
}
