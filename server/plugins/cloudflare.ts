import { Elysia } from 'elysia'

export const ip = (app: Elysia) =>
    app.derive(async ({ request, status }) => {
        let ip = request.headers.get('cf-connecting-ip')
        let country = request.headers.get('cf-ipcountry')

        if (!Mino.isProduction && (!ip || !country)) {
            ip = '127.0.0.1'
            country = 'AQ'
        }

        if (ip) {
            if (await Mino.Memory.isSubnetBlocked(ip)) {
                console.warn(`known blocked ip range trying to access mino:`, ip)
                return status(403, 'Your IP range is blocked, either due to a known public cloud server provider or an intentional ban.')
            }
        }

        return { ip, country }
    })
