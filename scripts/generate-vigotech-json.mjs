import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { Events, Videos, Source } = require('metagroup-schema-tools')

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

  if (sourceList.some((source) => source?.type === 'youtube') && !process.env.YOUTUBE_API_KEY) {
    if (hasArrayItems(fallback)) {
      warnFallback(`keeping previous videoList for ${label}`, 'missing YOUTUBE_API_KEY')
      return fallback
    }

    return fallback ?? []
  }

  try {
    const videoList = await Videos.getGroupVideos(sourceList, 6, {
      youtubeApiKey: process.env.YOUTUBE_API_KEY,
      member,
    })

    if (hasArrayItems(videoList)) {
      return videoList
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
