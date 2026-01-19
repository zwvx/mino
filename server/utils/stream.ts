export interface ProxyStreamOptions {
    signal?: AbortSignal
}

export function proxyResponseStream(
    response: Response,
    onComplete: (responseBody: string) => void,
    options?: ProxyStreamOptions
) {
    if (!response.body) {
        onComplete('')
        return response
    }

    const decoder = new TextDecoder()
    let body = ''
    let cleanupCalled = false
    let upstreamCancelled = false

    const safeCleanup = () => {
        if (cleanupCalled) return
        cleanupCalled = true
        body += decoder.decode()
        onComplete(body)
    }

    const cancelUpstream = (reason?: unknown) => {
        if (upstreamCancelled) return
        upstreamCancelled = true
        reader.cancel(reason).catch(() => { })
    }

    const reader = response.body.getReader()

    const clientStream = new ReadableStream({
        async pull(controller) {
            try {
                const { done, value } = await reader.read()

                if (done) {
                    controller.close()
                    safeCleanup()
                    return
                }

                body += decoder.decode(value, { stream: true })
                controller.enqueue(value)
            } catch (err) {
                controller.error(err) // conn reset, timeout, etc.
                safeCleanup()
            }
        },
        cancel(reason) {
            cancelUpstream(reason)
            safeCleanup()
        }
    })

    if (options?.signal) {
        options.signal.addEventListener('abort', () => {
            cancelUpstream(options.signal?.reason)
        }, { once: true })
    }

    return new Response(clientStream, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
    })
}

export interface InterceptedStream {
    firstChunk: string
    createStream: () => ReadableStream<Uint8Array>
}

export async function interceptFirstChunk(response: Response): Promise<InterceptedStream | null> {
    if (!response.body) {
        return null
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    try {
        const { done, value } = await reader.read()

        if (done || !value) {
            reader.releaseLock()
            return null
        }

        const firstChunk = decoder.decode(value, { stream: true })

        return {
            firstChunk,
            createStream: () => {
                return new ReadableStream<Uint8Array>({
                    start(controller) {
                        controller.enqueue(value)
                    },
                    async pull(controller) {
                        try {
                            const { done, value } = await reader.read()
                            if (done) {
                                controller.close()
                                return
                            }
                            controller.enqueue(value)
                        } catch (err) {
                            controller.error(err)
                        }
                    },
                    cancel(reason) {
                        reader.cancel(reason).catch(() => { })
                    }
                })
            }
        }
    } catch {
        reader.cancel().catch(() => { })
        return null
    }
}
