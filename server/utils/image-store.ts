import { fileTypeFromBuffer } from 'file-type'
import { readdir, unlink, mkdir } from 'node:fs/promises'
import sharp from 'sharp'
import { Logger } from './logger'

const TEMP_DIR = 'temp'
const THUMBS_DIR = 'temp/.thumbs'

export function sanitize(value: string): string {
    return value.replace(/[\/\\]/g, '-').replace(/[^a-zA-Z0-9._-]/g, '')
}

function buildFilename(provider: string, model: string, timestamp: number, index: number, ext: string): string {
    return `${sanitize(provider)}_${sanitize(model)}_${timestamp}_${index}.${ext}`
}

function parseTimestampFromFilename(filename: string): number | null {
    const parts = filename.split('_')
    if (parts.length < 4) return null

    const tsStr = parts[parts.length - 2]
    const ts = Number(tsStr)
    return Number.isFinite(ts) && ts > 0 ? ts : null
}

function parseModelFromFilename(filename: string): string {
    const parts = filename.split('_')
    if (parts.length < 4) return 'unknown'
    return parts.slice(1, -2).join('_')
}

async function detectExtension(buffer: Buffer): Promise<string> {
    try {
        const type = await fileTypeFromBuffer(buffer)
        return type?.ext || 'bin'
    } catch {
        return 'bin'
    }
}

async function saveBuffer(buffer: Buffer, provider: string, model: string, index: number): Promise<string | null> {
    try {
        const timestamp = Date.now()
        const ext = await detectExtension(buffer)
        const filename = buildFilename(provider, model, timestamp, index, ext)
        const filepath = `${TEMP_DIR}/${filename}`

        await Bun.write(filepath, buffer)
        Logger.info(`[IMAGE] saved ${filepath} (${(buffer.length / 1024).toFixed(1)}KB)`)
        return filepath
    } catch (err) {
        Logger.error('[IMAGE] failed to save image:', err)
        return null
    }
}

export async function saveImageFromResponse(responseBody: string, provider: string, model: string): Promise<void> {
    try {
        const json = JSON.parse(responseBody)
        const data = json.data as { b64_json?: string, url?: string }[] | undefined
        if (!Array.isArray(data) || data.length === 0) return

        for (let i = 0; i < data.length; i++) {
            const entry = data[i]
            if (!entry) continue

            if (entry.b64_json) {
                const buffer = Buffer.from(entry.b64_json, 'base64')
                await saveBuffer(buffer, provider, model, i)
                continue
            }

            if (entry.url) {
                try {
                    const res = await fetch(entry.url, { signal: AbortSignal.timeout(30_000) })
                    if (!res.ok) continue

                    const buffer = Buffer.from(await res.arrayBuffer())
                    await saveBuffer(buffer, provider, model, i)
                } catch (err) {
                    Logger.error(`[IMAGE] failed to fetch url for index ${i}:`, err)
                }
            }
        }
    } catch { }
}

export async function cleanupTempImages(maxAgeMs: number): Promise<void> {
    try {
        const entries = await readdir(TEMP_DIR)
        const now = Date.now()
        let removed = 0

        for (const entry of entries) {
            if (entry === '.thumbs') continue

            const ts = parseTimestampFromFilename(entry)
            if (ts === null) continue

            if (now - ts > maxAgeMs) {
                try {
                    await unlink(`${TEMP_DIR}/${entry}`)
                    // also remove its thumbnail if it exists
                    await unlink(`${THUMBS_DIR}/${entry}.webp`).catch(() => { })
                    removed++
                } catch { }
            }
        }

        if (removed > 0) {
            Logger.info(`[IMAGE] cleaned up ${removed} expired file(s)`)
        }
    } catch (err) {
        Logger.error('[IMAGE] cleanup failed:', err)
    }
}

export async function getOrCreateThumbnail(filename: string): Promise<Buffer | null> {
    try {
        await mkdir(THUMBS_DIR, { recursive: true })

        const thumbPath = `${THUMBS_DIR}/${filename}.webp`
        const thumbFile = Bun.file(thumbPath)

        if (await thumbFile.exists()) {
            return Buffer.from(await thumbFile.arrayBuffer())
        }

        const srcFile = Bun.file(`${TEMP_DIR}/${filename}`)
        if (!await srcFile.exists()) return null

        const srcBuffer = Buffer.from(await srcFile.arrayBuffer())
        const metadata = await sharp(srcBuffer).metadata()

        if (!metadata.width || !metadata.height) return null

        const thumbBuffer = await sharp(srcBuffer)
            .resize({
                width: Math.round(metadata.width * 0.7),
                height: Math.round(metadata.height * 0.7),
                fit: 'inside',
                withoutEnlargement: true
            })
            .webp({ quality: 80 })
            .toBuffer()

        await Bun.write(thumbPath, thumbBuffer)
        Logger.info(`[IMAGE] thumbnail created ${thumbPath} (${(thumbBuffer.length / 1024).toFixed(1)}KB)`)
        return thumbBuffer
    } catch (err) {
        Logger.error('[IMAGE] thumbnail generation failed:', err)
        return null
    }
}

export interface ImageEntry {
    filename: string
    model: string
    timestamp: number
}

export async function listProviderImages(provider: string): Promise<ImageEntry[]> {
    try {
        const prefix = sanitize(provider) + '_'
        const entries = await readdir(TEMP_DIR)
        const images: ImageEntry[] = []

        for (const entry of entries) {
            if (!entry.startsWith(prefix)) continue

            const ts = parseTimestampFromFilename(entry)
            if (ts === null) continue

            images.push({
                filename: entry,
                model: parseModelFromFilename(entry),
                timestamp: ts
            })
        }

        images.sort((a, b) => b.timestamp - a.timestamp)
        return images
    } catch {
        return []
    }
}
