export class SchemaRequest {
    request: Request
    additionalStripHeaders: string[] = []

    constructor(request: Request) {
        this.request = request
    }

    setProviderKey(key: string) { }

    stripHeaders() {
        const headers = ['host', 'content-length', 'connection', 'accept-encoding', ...this.additionalStripHeaders]
        for (const header of headers) {
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

    getRequestToken(bodyBuffer: ArrayBuffer) {
        return 0
    }

    parseSSEChatResponse(content: string) {
        return {
            content: '',
            tokenCount: 0
        }
    }
}
