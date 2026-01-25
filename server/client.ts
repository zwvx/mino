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

if (window.location.pathname === '/') {
    indexScript()
}