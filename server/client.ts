import { RWS } from './utils/rws'

async function indexScript() {
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new RWS(`${wsProto}//${window.location.host}/mino`)

    const state = {
        session: null as string | null
    }

    const wsMethods = {
        'init': async ({ session }: any) => {
            if (state.session && state.session !== session) {
                window.location.reload()
                return
            }

            state.session = session
            console.log('mino session:', state.session)
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