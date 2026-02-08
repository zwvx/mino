import { SchemaRequest } from './base'
import { estimateTokenCount } from 'tokenx'
import type { Attachment } from '@/types/attachment'
import { fileTypeFromBuffer } from 'file-type'

export class OpenAIRequest extends SchemaRequest {
    protected override endpointPatterns = {
        chat_completion: ['/chat/completions'],
        image_generation: ['/images/generations', '/images/edits', '/images/variations']
    }

    override setProviderKey(key: string) {
        this.request.headers.set('authorization', `Bearer ${key}`)
    }

    override isChatCompletionEndpoint() {
        return this.request.url.endsWith('/chat/completions')
    }

    override isModelListEndpoint(): boolean {
        const url = new URL(this.request.url)
        return url.pathname.endsWith('/models') || url.pathname.endsWith('/models/')
    }

    override getRequestToken(bodyBuffer: ArrayBuffer): number | null {
        try {
            const decoder = new TextDecoder()
            const body = decoder.decode(bodyBuffer)
            const json = JSON.parse(body)

            if (!json.messages || !Array.isArray(json.messages)) {
                return null
            }

            let text = ''
            for (const message of json.messages) {
                text += (message.role || '') + ' '
                if (typeof message.content === 'string') {
                    text += message.content + ' '
                } else if (Array.isArray(message.content)) {
                    for (const part of message.content) {
                        if (part.type === 'text') {
                            text += (part.text || '') + ' '
                        }
                    }
                }
            }

            return estimateTokenCount(text)
        } catch {
            return null
        }
    }

    override getModelId(bodyBuffer: ArrayBuffer): string | null {
        try {
            const decoder = new TextDecoder()
            const body = decoder.decode(bodyBuffer)
            const json = JSON.parse(body)
            return json.model || null
        } catch {
            return null
        }
    }

    override getMaxTokens(bodyBuffer: ArrayBuffer): number | null {
        try {
            const decoder = new TextDecoder()
            const body = decoder.decode(bodyBuffer)
            const json = JSON.parse(body)
            return json.max_completion_tokens ?? json.max_tokens ?? null
        } catch {
            return null
        }
    }

    override parseSSEChatResponse(content: string) {
        try {
            let result = ''

            if (content.trim().startsWith('{')) {
                const json = JSON.parse(content)
                if (json.choices && Array.isArray(json.choices)) {
                    for (const choice of json.choices) {
                        result += (choice.message?.content || '')
                    }
                }
            } else {
                const lines = content.split('\n')
                for (const line of lines) {
                    if (line.trim() === 'data: [DONE]') continue
                    if (line.startsWith('data: ')) {
                        try {
                            const json = JSON.parse(line.slice(6))
                            if (json.choices && Array.isArray(json.choices)) {
                                for (const choice of json.choices) {
                                    result += (choice.delta?.content || '')
                                }
                            }
                        } catch { }
                    }
                }
            }

            return {
                content: result,
                tokenCount: estimateTokenCount(result)
            }
        } catch {
            return {
                content: '',
                tokenCount: 0
            }
        }
    }

    override getObjectModel(modelId: string): Record<string, any> {
        return {
            id: modelId,
            object: 'model',
            created: Date.now(),
            owned_by: 'mino'
        }
    }

    override rewriteModelInBody(bodyBuffer: ArrayBuffer, newModelId: string): ArrayBuffer {
        try {
            const decoder = new TextDecoder()
            const body = decoder.decode(bodyBuffer)
            const json = JSON.parse(body)
            json.model = newModelId
            return new TextEncoder().encode(JSON.stringify(json)).buffer as ArrayBuffer
        } catch {
            return bodyBuffer
        }
    }

    override async getAttachments(bodyBuffer: ArrayBuffer): Promise<Attachment[]> {
        const attachments: Attachment[] = []
        try {
            const decoder = new TextDecoder()
            const body = decoder.decode(bodyBuffer)
            const json = JSON.parse(body)

            if (json.messages && Array.isArray(json.messages)) {
                for (const message of json.messages) {
                    if (Array.isArray(message.content)) {
                        for (const part of message.content) {
                            if (part.type === 'image_url' && part.image_url?.url) {
                                const url = part.image_url.url
                                if (url.startsWith('data:')) {
                                    const base64Data = url.split(',')[1]
                                    if (base64Data) {
                                        const buffer = Buffer.from(base64Data, 'base64')
                                        const type = await fileTypeFromBuffer(buffer)
                                        attachments.push({
                                            mimetype: type?.mime || 'unknown',
                                            data: buffer,
                                            size: buffer.length
                                        })
                                    }
                                }
                            }
                            if (part.type === 'input_audio' && part.input_audio?.data) {
                                const base64Data = part.input_audio.data
                                const buffer = Buffer.from(base64Data, 'base64')
                                const type = await fileTypeFromBuffer(buffer)
                                attachments.push({
                                    mimetype: type?.mime || part.input_audio.format || 'unknown',
                                    data: buffer,
                                    size: buffer.length
                                })
                            }
                            if (part.type === 'file' && part.file?.file_data) {
                                const base64Data = part.file.file_data
                                const buffer = Buffer.from(base64Data, 'base64')
                                const type = await fileTypeFromBuffer(buffer)
                                attachments.push({
                                    mimetype: type?.mime || 'unknown',
                                    data: buffer,
                                    filename: part.file.filename,
                                    size: buffer.length
                                })
                            }
                        }
                    }
                }
            }
        } catch { }
        return attachments
    }
}