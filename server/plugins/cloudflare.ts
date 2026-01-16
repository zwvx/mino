import { Elysia } from 'elysia'

export const ip = (app: Elysia) =>
    app.derive(({ request }) => {
        let ip = request.headers.get('cf-connecting-ip')
        let country = request.headers.get('cf-ipcountry')

        if (!Mino.isProduction && (!ip || !country)) {
            ip = '127.0.0.1'
            country = 'AQ'
        }

        return { ip, country }
    })
