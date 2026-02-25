import { Elysia } from 'elysia'
import { FileLogger } from '../utils/file-logger'

const blockedLogger = FileLogger.get('blocked-requests', 'json')

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
                blockedLogger.append({
                    ip,
                    country,
                    method: request.method,
                    url: request.url,
                    reason: 'IP Range Blocked (CIDR)'
                })
                return status(403, 'Your IP range is blocked, likely a cloud provider or an intentional ban.')
            }
        }

        return { ip, country }
    })
