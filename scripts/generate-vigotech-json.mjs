import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { Events, Videos, Source } = require('metagroup-schema-tools')

const YOUTUBE_RECENT_VIDEOS_LIMIT = 50

const shouldSuppressLog = (args) => {
  const text = args
    .map((arg) => {
      if (arg instanceof Error) {
        return `${arg.name} ${arg.message}`
      }

      if (typeof arg === 'string') {
        return arg
      }

      if (arg && typeof arg === 'object' && 'message' in arg && typeof arg.message === 'string') {
        return String(arg.message)
      }

      return String(arg)
    })
    .join(' ')

  return (
    text.includes('Server responded to') ||
    text.includes("Method doesn't allow unregistered callers") ||
    text.includes('GaxiosError') ||
    text.includes('Status code 404') ||
    text.includes('INVALID_AUTH') ||
    text.includes('Not Found')
  )
}

const originalConsoleLog = console.log
const originalConsoleError = console.error

console.log = (...args) => {
  if (shouldSuppressLog(args)) {
    return
  }

  originalConsoleLog(...args)
}

console.error = (...args) => {
  if (shouldSuppressLog(args)) {
    return
  }

  originalConsoleError(...args)
}

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = resolve(rootDir, 'public')

const sourceFile = process.env.VIGOTECH_MEMBERS_SOURCE_FILE ?? resolve(publicDir, 'vigotech.json')

const generatedFile =
  process.env.VIGOTECH_MEMBERS_SOURCE_GENERATED_FILE ??
  resolve(publicDir, 'vigotech-generated.json')

const schemaFile =
  process.env.VIGOTECH_MEMBERS_SCHEMA_FILE ?? resolve(publicDir, 'vigotech-schema.json')

const readJson = async (filePath) => JSON.parse(await readFile(filePath, 'utf8'))

const readJsonOrDefault = async (filePath, fallback) => {
  try {
    return await readJson(filePath)
  } catch {
    return fallback
  }
}

const toArray = (value) => {
  if (!value) {
    return []
  }

  return Array.isArray(value) ? value : [value]
}

const warnFallback = (label, error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.warn(`[generate:data] ${label}: ${message}`)
}

const hasObjectValue = (value) => Boolean(value && typeof value === 'object')

const hasArrayItems = (value) => Array.isArray(value) && value.length > 0

const getVideoId = (video) =>
  video && typeof video === 'object' && typeof video.id === 'string' && video.id.length > 0
    ? video.id
    : null

const combineVideoData = (current, incoming) => {
  if (!current) {
    return incoming
  }

  return {
    ...current,
    ...incoming,
    title: incoming.title ?? current.title,
    pubDate: incoming.pubDate ?? current.pubDate ?? null,
    thumbnails: incoming.thumbnails ?? current.thumbnails,
  }
}

const mergeVideoLists = (...lists) => {
  const orderedIds = []
  const videosById = new Map()
  const passthroughVideos = []

  for (const list of lists) {
    if (!Array.isArray(list)) {
      continue
    }

    for (const video of list) {
      const videoId = getVideoId(video)

      if (!videoId) {
        passthroughVideos.push(video)
        continue
      }

      if (!videosById.has(videoId)) {
        orderedIds.push(videoId)
      }

      videosById.set(videoId, combineVideoData(videosById.get(videoId), video))
    }
  }

  return [...orderedIds.map((videoId) => videosById.get(videoId)), ...passthroughVideos]
}

const getYoutubeUploadsPlaylistId = (channelId) => {
  if (typeof channelId !== 'string' || channelId.length < 3 || !channelId.startsWith('UC')) {
    return null
  }

  return `UU${channelId.slice(2)}`
}

const getYoutubeInitialData = async (url) => {
  const response = await fetch(url, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
      'accept-language': 'en-US,en;q=0.9',
    },
  })

  if (!response.ok) {
    throw new Error(`failed to fetch ${url}: ${response.status}`)
  }

  const html = await response.text()
  const match = html.match(/var ytInitialData = (\{.*?\});<\/script>/s)

  if (!match) {
    throw new Error(`ytInitialData not found for ${url}`)
  }

  return JSON.parse(match[1])
}

const collectNodesByKey = (value, key, results = []) => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectNodesByKey(item, key, results))
    return results
  }

  if (!value || typeof value !== 'object') {
    return results
  }

  if (key in value) {
    results.push(value[key])
  }

  Object.values(value).forEach((item) => collectNodesByKey(item, key, results))
  return results
}

const getRendererText = (value) => {
  if (!value) {
    return null
  }

  if (typeof value.simpleText === 'string') {
    return value.simpleText
  }

  if (Array.isArray(value.runs)) {
    return (
      value.runs
        .map((run) => run?.text ?? '')
        .join('')
        .trim() || null
    )
  }

  return null
}

const normalizeRendererThumbnails = (thumbnailList) => {
  if (!Array.isArray(thumbnailList) || thumbnailList.length === 0) {
    return undefined
  }

  const [defaultThumb, mediumThumb, highThumb, standardThumb = highThumb] = thumbnailList

  return {
    default: defaultThumb,
    medium: mediumThumb ?? defaultThumb,
    high: highThumb ?? mediumThumb ?? defaultThumb,
    standard: standardThumb ?? highThumb ?? mediumThumb ?? defaultThumb,
  }
}

const getYoutubeArchiveVideos = async (channelId) => {
  const playlistId = getYoutubeUploadsPlaylistId(channelId)
  if (!playlistId) {
    return []
  }

  const initialData = await getYoutubeInitialData(
    `https://www.youtube.com/playlist?list=${playlistId}`,
  )
  const renderers = collectNodesByKey(initialData, 'playlistVideoRenderer')

  return renderers
    .map((renderer) => {
      const videoId = typeof renderer?.videoId === 'string' ? renderer.videoId : null
      if (!videoId) {
        return null
      }

      return {
        player: 'youtube',
        id: videoId,
        title: getRendererText(renderer.title) ?? videoId,
        pubDate: null,
        thumbnails: normalizeRendererThumbnails(renderer.thumbnail?.thumbnails),
      }
    })
    .filter(Boolean)
}

const getNextEvent = (member, sources, fallback, label) => {
  const sourceList = toArray(sources)

  if (
    sourceList.some((source) => source?.type === 'eventbrite') &&
    !process.env.EVENTBRITE_OAUTH_TOKEN
  ) {
    if (hasObjectValue(fallback)) {
      warnFallback(`keeping previous nextEvent for ${label}`, 'missing EVENTBRITE_OAUTH_TOKEN')
      return fallback
    }

    return null
  }

  try {
    const nextEvents = Events.getGroupNextEvents(sourceList, {
      eventbriteToken: process.env.EVENTBRITE_OAUTH_TOKEN,
      member,
    })

    const nextEvent = Array.isArray(nextEvents) ? (nextEvents[0] ?? null) : (nextEvents ?? null)

    if (hasObjectValue(nextEvent)) {
      return nextEvent
    }

    if (hasObjectValue(fallback)) {
      warnFallback(`keeping previous nextEvent for ${label}`, 'no upcoming events fetched')
      return fallback
    }

    return null
  } catch (error) {
    warnFallback(`using previous nextEvent for ${label}`, error)
    return fallback ?? null
  }
}

const getVideoList = async (member, sources, fallback, label) => {
  const sourceList = toArray(sources)

  try {
    const videoList = await Videos.getGroupVideos(sourceList, YOUTUBE_RECENT_VIDEOS_LIMIT, {
      youtubeApiKey: process.env.YOUTUBE_API_KEY,
      member,
    })

    const youtubeSources = sourceList.filter(
      (source) => source?.type === 'youtube' && source?.channel_id,
    )
    const youtubeArchiveLists = await Promise.all(
      youtubeSources.map(async (source) => {
        try {
          return await getYoutubeArchiveVideos(source.channel_id)
        } catch (error) {
          warnFallback(`using partial youtube archive for ${label}`, error)
          return []
        }
      }),
    )

    const mergedVideoList = mergeVideoLists(...youtubeArchiveLists, videoList)

    if (hasArrayItems(mergedVideoList)) {
      return mergedVideoList
    }

    if (hasArrayItems(fallback)) {
      warnFallback(`keeping previous videoList for ${label}`, 'no videos fetched')
      return fallback
    }

    return Array.isArray(videoList) ? videoList : (fallback ?? [])
  } catch (error) {
    warnFallback(`using previous videoList for ${label}`, error)
    return fallback ?? []
  }
}

const main = async () => {
  const [source, schema, previousGenerated] = await Promise.all([
    readJson(sourceFile),
    readJson(schemaFile),
    readJsonOrDefault(generatedFile, {}),
  ])

  const validation = Source.validate(source, schema)
  if (validation.errors.length > 0) {
    const details = validation.errors
      .map((error) => `${error.property} ${error.message}`.trim())
      .join('\n')
    throw new Error(`Invalid vigotech source data:\n${details}`)
  }

  const generated = structuredClone(source)
  generated.nextEvent = getNextEvent(
    generated,
    generated.events,
    previousGenerated.nextEvent ?? null,
    'root',
  )

  const members = generated.members ?? {}
  const previousMembers = previousGenerated.members ?? {}
  for (const [memberKey, memberValue] of Object.entries(members)) {
    if (!memberValue || typeof memberValue !== 'object') {
      continue
    }

    const member = memberValue
    const previousMember = previousMembers[memberKey] ?? {}
    member.nextEvent = getNextEvent(
      member,
      member.events,
      previousMember.nextEvent ?? null,
      memberKey,
    )
    member.videoList = await getVideoList(
      member,
      member.videos,
      previousMember.videoList ?? [],
      memberKey,
    )
    generated.members[memberKey] = member
  }

  await writeFile(generatedFile, `${JSON.stringify(generated, null, 2)}\n`)
  console.log(`Generated ${generatedFile}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
