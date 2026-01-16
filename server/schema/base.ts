export class SchemaRequest {
    request: Request

    constructor(request: Request) {
        this.request = request
    }

    setProviderKey(key: string) { }

    stripHeaders() {
        const headers = ['host', 'content-length', 'connection', 'accept-encoding']
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
}
