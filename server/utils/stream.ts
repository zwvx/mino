export function proxyResponseStream(response: Response, onComplete: (responseBody: string) => void) {
    if (!response.body) {
        onComplete('')
        return response
    }

    const decoder = new TextDecoder()
    let body = ''

    const { readable, writable } = new TransformStream({
        transform(chunk, controller) {
            body += decoder.decode(chunk, { stream: true })
            controller.enqueue(chunk)
        },
        flush() {
            body += decoder.decode()
        }
    })

    response.body.pipeTo(writable).then(() => {
        onComplete(body)
    }).catch(() => {
        onComplete(body)
    })

    return new Response(readable, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
    })
}
