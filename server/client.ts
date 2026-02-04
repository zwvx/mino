import { RWS } from './utils/rws'

function formatUptime(ms: number): string {
    const s = Math.floor(ms / 1000)
    const days = Math.floor(s / 86400)
    const hours = Math.floor(s / 3600) % 24
    const minutes = Math.floor(s / 60) % 60
    const seconds = s % 60

    if (days > 0) return `${days}d ${hours}h ${minutes}m ${seconds}s`
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
    if (minutes > 0) return `${minutes}m ${seconds}s`
    return `${seconds}s`
}

class Cursor {
    private canvas: HTMLCanvasElement | null = null
    private ctx: CanvasRenderingContext2D | null = null
    private cursorPath: Path2D
    private dpr = 1

    private cursors = new Map<string, {
        targetX: number,
        targetY: number,
        currentX: number,
        currentY: number,
        color: string,
        lastUpdate: number
    }>()

    private clicks: Array<{ x: number, y: number, color: string, startTime: number }> = []
    private myClientId: string | null = null
    private animationFrame: number | null = null
    private resizeTimeout: number | null = null
    private lastSend = 0

    private readonly THROTTLE_MS = 50
    private readonly LERP_FACTOR = 0.15
    private readonly CLICK_DURATION = 400
    private readonly IDLE_TIMEOUT = 5000
    private readonly MIN_OPACITY = 0.3

    constructor(private ws: RWS) {
        this.cursorPath = this.createCursorPath()
    }

    init(clientId: string | null) {
        this.myClientId = clientId
        this.canvas = document.getElementById('cursor-canvas') as HTMLCanvasElement
        if (!this.canvas) return

        this.ctx = this.canvas.getContext('2d')
        this.dpr = window.devicePixelRatio || 1
        this.resizeCanvas()

        const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0

        if (clientId && !isTouchDevice) {
            this.initMouseTracking()
        }

        window.addEventListener('resize', () => this.debouncedResize())
        new ResizeObserver(() => this.debouncedResize()).observe(document.body)

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.stopAnimation()
            } else if (this.cursors.size > 0 || this.clicks.length > 0) {
                this.startAnimation()
            }
        })
    }

    private createCursorPath(): Path2D {
        return new Path2D('M6.63564 2.28753C5.98325 1.75037 5 2.21445 5 3.05952V17.0583C5 17.9844 6.15025 18.413 6.75622 17.7127L10.2799 13.6402C10.5648 13.3109 10.9788 13.1217 11.4142 13.1217L17.0061 13.1217C17.9444 13.1217 18.3661 11.9461 17.6418 11.3497L6.63564 2.28753Z')
    }

    private debouncedResize() {
        if (this.resizeTimeout) clearTimeout(this.resizeTimeout)
        this.resizeTimeout = setTimeout(() => this.resizeCanvas(), 100) as unknown as number
    }

    private resizeCanvas() {
        if (!this.canvas) return
        const width = window.innerWidth
        const height = window.innerHeight

        this.canvas.width = width * this.dpr
        this.canvas.height = height * this.dpr

        this.ctx?.scale(this.dpr, this.dpr)
        this.render()
    }

    private initMouseTracking() {
        document.addEventListener('mousemove', (e) => {
            const now = Date.now()
            if (now - this.lastSend < this.THROTTLE_MS) return
            this.lastSend = now

            this.ws.send(JSON.stringify({
                type: 'cursor.move',
                data: { x: e.pageX, y: e.pageY }
            }))
        })

        document.addEventListener('mousedown', (e) => {
            this.ws.send(JSON.stringify({
                type: 'cursor.click',
                data: { x: e.pageX, y: e.pageY }
            }))
        })
    }

    private startAnimation() {
        if (this.animationFrame) return
        const loop = () => {
            this.render()
            if (this.cursors.size > 0 || this.clicks.length > 0) {
                this.animationFrame = requestAnimationFrame(loop)
            } else {
                this.animationFrame = null
            }
        }
        loop()
    }

    private stopAnimation() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame)
            this.animationFrame = null
        }
    }

    private render() {
        if (!this.ctx || !this.canvas) return

        const width = this.canvas.width / this.dpr
        const height = this.canvas.height / this.dpr

        this.ctx.save()
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
        this.ctx.clearRect(0, 0, width, height)

        const scrollX = window.scrollX
        const scrollY = window.scrollY

        const now = Date.now()
        this.clicks = this.clicks.filter(click => {
            const elapsed = now - click.startTime
            if (elapsed > this.CLICK_DURATION) return false

            const screenX = click.x - scrollX
            const screenY = click.y - scrollY

            if (screenX < -50 || screenY < -50 || screenX > width + 50 || screenY > height + 50) return true

            const progress = elapsed / this.CLICK_DURATION
            const radius = 20 * progress
            const alpha = 1 - progress

            this.ctx!.beginPath()
            this.ctx!.arc(screenX, screenY, radius, 0, Math.PI * 2)
            this.ctx!.globalAlpha = alpha
            this.ctx!.strokeStyle = click.color
            this.ctx!.lineWidth = 2 * (1 - progress * 0.5)
            this.ctx!.stroke()
            this.ctx!.globalAlpha = 1
            return true
        })

        this.cursors.forEach((cursor) => {
            cursor.currentX += (cursor.targetX - cursor.currentX) * this.LERP_FACTOR
            cursor.currentY += (cursor.targetY - cursor.currentY) * this.LERP_FACTOR

            const screenX = cursor.currentX - scrollX
            const screenY = cursor.currentY - scrollY

            if (screenX < -50 || screenY < -50 || screenX > width + 50 || screenY > height + 50) return

            const idleTime = now - cursor.lastUpdate
            const opacity = idleTime > this.IDLE_TIMEOUT
                ? this.MIN_OPACITY
                : 1 - ((1 - this.MIN_OPACITY) * Math.min(idleTime / this.IDLE_TIMEOUT, 1))

            this.ctx!.save()
            this.ctx!.globalAlpha = opacity
            this.ctx!.translate(screenX - 5, screenY - 2)
            this.ctx!.fillStyle = cursor.color
            this.ctx!.fill(this.cursorPath)
            this.ctx!.restore()
        })

        this.ctx.restore()
    }

    handleList(data: Array<{ clientId: string, x: number, y: number, color: string }>) {
        for (const cursor of data) {
            if (cursor.clientId === this.myClientId) continue
            this.cursors.set(cursor.clientId, {
                targetX: cursor.x,
                targetY: cursor.y,
                currentX: cursor.x,
                currentY: cursor.y,
                color: cursor.color,
                lastUpdate: Date.now()
            })
        }
        if (this.cursors.size > 0) this.startAnimation()
    }

    handleUpdate(data: { clientId: string, x: number, y: number, color: string }) {
        if (data.clientId === this.myClientId) return

        const existing = this.cursors.get(data.clientId)
        if (existing) {
            existing.targetX = data.x
            existing.targetY = data.y
            existing.color = data.color
            existing.lastUpdate = Date.now()
        } else {
            this.cursors.set(data.clientId, {
                targetX: data.x,
                targetY: data.y,
                currentX: data.x,
                currentY: data.y,
                color: data.color,
                lastUpdate: Date.now()
            })
        }
        this.startAnimation()
    }

    handleRemove(data: { clientId: string }) {
        this.cursors.delete(data.clientId)
    }

    handleClick(data: { clientId: string, x: number, y: number, color: string }) {
        if (data.clientId === this.myClientId) return
        this.clicks.push({ x: data.x, y: data.y, color: data.color, startTime: Date.now() })
        this.startAnimation()
    }
}

async function indexScript() {
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new RWS(`${wsProto}//${window.location.host}/mino`)
    const cursor = new Cursor(ws)

    const uptimeEl = document.getElementById('uptime')
    const serverStart = Number(uptimeEl?.dataset.start) || 0
    const serverNow = Number(uptimeEl?.dataset.now) || Date.now()
    const clientNow = Date.now()
    const offset = clientNow - serverNow

    const state = {
        session: null as string | null,
    }

    const updateUptime = () => {
        const now = Date.now()
        const currentServerTime = now - offset
        const uptime = Math.max(0, currentServerTime - serverStart)
        if (uptimeEl) uptimeEl.textContent = formatUptime(uptime)
    }

    updateUptime()
    setInterval(updateUptime, 1000)

    const wsMethods = {
        'init': async ({ session }: any) => {
            if (state.session && state.session !== session) {
                window.location.reload()
                return
            }

            state.session = session
            console.log('mino session:', state.session)
        },
        'cursor.init': async ({ clientId }: any) => {
            cursor.init(clientId)
        },
        'cursor.list': async (data: any) => {
            cursor.handleList(data)
        },
        'cursor.update': async (data: any) => {
            cursor.handleUpdate(data)
        },
        'cursor.remove': async (data: any) => {
            cursor.handleRemove(data)
        },
        'cursor.click': async (data: any) => {
            cursor.handleClick(data)
        },
        'provider.info': async (data: Record<string, Record<string, string>>[]) => {
            for (const provider of data) {
                const keys = provider.keys
                const spent = provider.spent

                if (!keys || !keys.id || !spent || !spent.id) {
                    continue
                }

                document.getElementById(keys.id)!.textContent = keys.value ?? '-'
                document.getElementById(spent.id)!.textContent = spent.value ?? '-'
            }
        },
        'active.session': async ({ value }: any) => {
            document.getElementById('active-session')!.textContent = value
        },
        'total.tokens': async ({ value }: any) => {
            document.getElementById('total-tokens')!.textContent = value.toLocaleString()
        },
        'motd.update': async ({ html }: any) => {
            const el = document.getElementById('motd-content')
            if (el) {
                el.innerHTML = html
                if (html) {
                    el.classList.remove('hidden')
                } else {
                    el.classList.add('hidden')
                }
            }
        }
    }

    ws.on('message', (event) => {
        const payload = JSON.parse(event.data)
        if (!payload.type || !payload.data) return

        if (wsMethods[payload.type as keyof typeof wsMethods]) {
            wsMethods[payload.type as keyof typeof wsMethods](payload.data)
        }
    })

    ws.connect()
}

async function verifyScript() {
    (window as any).onTurnstileVerify = async (token: string) => {
        const statusEl = document.getElementById('verify-status')
        if (!statusEl) return

        statusEl.textContent = 'verifying...'

        try {
            const res = await fetch('/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            })

            const data = await res.json()
            if (data.success) {
                statusEl.innerHTML = '<span class="text-[#60d860]">verified. you can go back and continue.</span>'
            } else {
                statusEl.innerHTML = '<span class="text-[#d86060]">verification failed. try again.</span>'
            }
        } catch {
            statusEl.innerHTML = '<span class="text-[#d86060]">error. try again.</span>'
        }
    }
}

if (window.location.pathname === '/') {
    indexScript()
} else if (window.location.pathname === '/verify') {
    verifyScript()
}