import cac from 'cac'

async function request(baseUrl: string, path: string, token: string, body?: Record<string, any>) {
    const res = await fetch(`${baseUrl}/admin${path}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : undefined
    })

    if (!res.ok) {
        console.error(await res.text())
        process.exit(1)
    }

    return await res.json()
}

export async function runAdmin() {
    const cli = cac('admin')

    cli
        .command('provider:reload [provider]', 'reload provider config')
        .option('--url <url>', 'base url (required)')
        .option('--token <token>', 'admin token (required)')
        .action(async (provider: string | undefined, options: { url?: string, token?: string }) => {
            if (!options.url) {
                console.error('error: --url <url> is required')
                process.exit(1)
            }

            if (!options.token) {
                console.error('error: --token <token> is required')
                process.exit(1)
            }

            const body: Record<string, any> = {}
            if (provider) body.provider = provider

            const data = await request(options.url, '/provider/reload', options.token, body)

            console.log(`reloaded: ${data.providers.join(', ')}`)
            if (data.refreshed) {
                console.log('session refreshed, clients will reload')
            }
        })

    cli.help()
    cli.parse()
}

if (import.meta.main) {
    runAdmin()
}
