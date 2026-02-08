import { describe, expect, test } from 'bun:test'
import { OpenAIRequest } from '@/server/schema/openai'
import { AnthropicRequest } from '@/server/schema/anthropic'
import { GeminiRequest } from '@/server/schema/gemini'

const ONE_PIXEL_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

describe('Schema Attachments', () => {
    test('OpenAIRequest should extract attachments', async () => {
        const req = new Request('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
        })
        const schema = new OpenAIRequest(req)
        const body = JSON.stringify({
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: 'What is this?' },
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:image/png;base64,${ONE_PIXEL_PNG}`
                            }
                        }
                    ]
                }
            ]
        })
        const buffer = new TextEncoder().encode(body).buffer as ArrayBuffer
        const attachments = await schema.getAttachments(buffer)

        expect(attachments).toHaveLength(1)
        expect(attachments[0]!.mimetype).toBe('image/png')
        expect(attachments[0]!.size).toBeGreaterThan(0)
    })

    test('AnthropicRequest should extract attachments', async () => {
        const req = new Request('https://api.anthropic.com/v1/messages', {
            method: 'POST',
        })
        const schema = new AnthropicRequest(req)
        const body = JSON.stringify({
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: 'What is this?' },
                        {
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: 'image/png',
                                data: ONE_PIXEL_PNG
                            }
                        }
                    ]
                }
            ]
        })
        const buffer = new TextEncoder().encode(body).buffer as ArrayBuffer
        const attachments = await schema.getAttachments(buffer)

        expect(attachments).toHaveLength(1)
        expect(attachments[0]!.mimetype).toBe('image/png')
        expect(attachments[0]!.size).toBeGreaterThan(0)
    })

    test('GeminiRequest should extract attachments', async () => {
        const req = new Request('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent', {
            method: 'POST',
        })
        const schema = new GeminiRequest(req)
        const body = JSON.stringify({
            contents: [
                {
                    parts: [
                        { text: 'What is this?' },
                        {
                            inlineData: {
                                mimeType: 'image/png',
                                data: ONE_PIXEL_PNG
                            }
                        }
                    ]
                }
            ]
        })
        const buffer = new TextEncoder().encode(body).buffer as ArrayBuffer
        const attachments = await schema.getAttachments(buffer)

        expect(attachments).toHaveLength(1)
        expect(attachments[0]!.mimetype).toBe('image/png')
        expect(attachments[0]!.size).toBeGreaterThan(0)
    })
})
