import type { EndpointType } from '@/types/endpoint-types'
import { fileTypeFromBuffer } from 'file-type'
import type { Attachment } from '@/types/attachment'

export class SchemaRequest {
    request: Request
    additionalStripHeaders: string[] = []

    protected endpointPatterns: Partial<Record<EndpointType, string[]>> = {}

    constructor(request: Request) {
        this.request = request
    }

    getEndpointType(path: string): EndpointType {
        for (const [type, patterns] of Object.entries(this.endpointPatterns)) {
            if (patterns && patterns.some(p => path.endsWith(p) || path === p)) {
                return type as EndpointType
            }
        }
        return 'passthrough'
    }

    setProviderKey(key: string) { }

    stripHeaders() {
        const headers = [
            'host',
            'content-length',
            'connection',
            'accept-encoding',
            'x-forwarded-for',
            'x-forwarded-proto',
            'x-forwarded-host',
            'x-forwarded-port',
            'x-real-ip',
            'x-request-id',
            'cf-connecting-ip',
            'cf-ray',
            'cf-visitor',
            'cf-ipcountry',
            'cdn-loop',
            'referer',
            'origin',
            'x-title',
            'http-referer',
            ...this.additionalStripHeaders
        ]

        for (const header of headers) {
            this.request.headers.delete(header)
        }
    }

    stripHeadersMinimal(overrideHeaders: { key: string; value: string }[] = []) {
        const allowedHeaders = new Set([
            'content-type',
            'accept',
        ])

        for (const header of overrideHeaders) {
            allowedHeaders.add(header.key.toLowerCase())
        }

        const headersToDelete: string[] = []
        this.request.headers.forEach((_, key) => {
            if (!allowedHeaders.has(key.toLowerCase())) {
                headersToDelete.push(key)
            }
        })

        for (const header of headersToDelete) {
            this.request.headers.delete(header)
        }
    }

    overrideHeaders(headers: { key: string, value: string }[]) {
        for (const header of headers) {
            this.request.headers.set(header.key, header.value)
        }
    }

    cleanupResponseHeaders(headers: Headers) {
        const stripHeaders = ['content-encoding', 'content-length', 'transfer-encoding', 'connection']
        for (const header of stripHeaders) {
            headers.delete(header)
        }
    }

    errorObject(message: string, type: string, code: string | null = null, param: string | null = null) {
        return {
            error: {
                message, type, code, param
            }
        }
    }

    isChatCompletionEndpoint() {
        return false
    }

    isModelListEndpoint() {
        return false
    }

    getRequestToken(bodyBuffer: ArrayBuffer): number | null {
        return 0
    }

    parseSSEChatResponse(content: string) {
        return {
            content: '',
            tokenCount: 0
        }
    }

    getObjectModel(modelId: string): Record<string, any> {
        return {}
    }

    getModelId(bodyBuffer: ArrayBuffer): string | null {
        return null
    }

    getMaxTokens(bodyBuffer: ArrayBuffer): number | null {
        return null
    }

    getObjectModels(modelIds: string[]): Record<string, any> {
        return {
            data: modelIds.map((m) => this.getObjectModel(m)),
            object: 'list'
        }
    }

    rewriteModelInBody(bodyBuffer: ArrayBuffer, newModelId: string): ArrayBuffer {
        return bodyBuffer
    }

    async getAttachments(bodyBuffer: ArrayBuffer): Promise<Attachment[]> {
        return []
    }

    parseModelsResponse(data: Record<string, any>): string[] {
        if (data.data && Array.isArray(data.data)) {
            return data.data.map((m: { id: string }) => m.id)
        }
        return []
    }

    distillQuery(searchParams: URLSearchParams): URLSearchParams {
        return searchParams
    }
}

