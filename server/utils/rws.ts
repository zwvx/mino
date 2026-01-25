type RWSConfig = {
    reconnectInterval?: number
    maxRetries?: number
    backoffMultiplier?: number
    maxReconnectInterval?: number
    debug?: boolean
}

type RWSEventMap = {
    "open": Event
    "message": MessageEvent
    "close": CloseEvent
    "error": Event
}

export class RWS {
    private ws: WebSocket | null = null
    private url: string
    private config: Required<RWSConfig>
    private retries = 0
    private shouldReconnect = true
    private listeners: { [K in keyof RWSEventMap]: Set<(event: RWSEventMap[K]) => void> } = {
        open: new Set(),
        message: new Set(),
        close: new Set(),
        error: new Set()
    }

    constructor(url: string, config: RWSConfig = {}) {
        this.url = url
        this.config = {
            reconnectInterval: 1000,
            maxRetries: Infinity,
            backoffMultiplier: 1.5,
            maxReconnectInterval: 30000,
            debug: false,
            ...config
        }
    }

    connect() {
        this.shouldReconnect = true
        this.attemptConnect()
    }

    private attemptConnect() {
        try {
            this.ws = new WebSocket(this.url)

            this.ws.onopen = (event) => {
                this.retries = 0
                this.log(`connected to ${this.url}`)
                this.emit('open', event)
            }

            this.ws.onmessage = (event) => {
                this.emit('message', event)
            }

            this.ws.onclose = (event) => {
                this.emit('close', event)
                if (this.shouldReconnect) {
                    this.scheduleReconnect()
                }
            }

            this.ws.onerror = (event) => {
                this.emit('error', event)
            }

        } catch (e) {
            console.error('[RWS] connection error:', e)
            this.scheduleReconnect()
        }
    }

    private scheduleReconnect() {
        if (!this.shouldReconnect) return

        if (this.retries >= this.config.maxRetries) {
            console.error(`[RWS] max retries reached for ${this.url}`)
            return
        }

        const delay = Math.min(
            this.config.reconnectInterval * Math.pow(this.config.backoffMultiplier, this.retries),
            this.config.maxReconnectInterval
        )

        this.log(`reconnecting in ${delay}ms... (attempt ${this.retries + 1})`)

        setTimeout(() => {
            this.retries++
            this.attemptConnect()
        }, delay)
    }

    send(data: string | ArrayBuffer | ArrayBufferView | Blob) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(data)
        } else {
            console.warn('[RWS] not connected, cannot send message')
        }
    }

    close() {
        this.shouldReconnect = false
        if (this.ws) {
            this.ws.close()
        }
    }

    on<K extends keyof RWSEventMap>(event: K, listener: (event: RWSEventMap[K]) => void) {
        this.listeners[event].add(listener)
        return () => this.off(event, listener)
    }

    off<K extends keyof RWSEventMap>(event: K, listener: (event: RWSEventMap[K]) => void) {
        this.listeners[event].delete(listener)
    }

    private emit<K extends keyof RWSEventMap>(event: K, payload: RWSEventMap[K]) {
        this.listeners[event].forEach(listener => listener(payload))
    }

    private log(message: string) {
        if (this.config.debug) {
            console.log(`[RWS] ${message}`)
        }
    }
}