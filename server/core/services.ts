import type { Provider } from '@/types/provider'
import schemas, { type SchemaType } from '../schema'

import type { ProviderChecker } from '@/modules/checker/abstract'

export class MinoServices {
    async fetchProviderModels(provider: Provider, apiKey: string): Promise<string[]> {
        const schemaConfig = provider.schema[0]
        if (!schemaConfig) {
            throw new Error(`provider <${provider.id}> has no schema defined`)
        }

        const baseUrl = schemaConfig.base ?? provider.endpoint.default
        const modelsEndpoint = `${baseUrl}${schemaConfig.upstream_path}/models`

        const SchemaClass = schemas[schemaConfig.id as SchemaType]
        if (!SchemaClass) {
            throw new Error(`unknown schema <${schemaConfig.id}> for provider <${provider.id}>`)
        }

        const dummyRequest = new Request(modelsEndpoint, { method: 'GET' })
        const schema = new SchemaClass(dummyRequest)
        schema.setProviderKey(apiKey)

        const response = await fetch(modelsEndpoint, {
            method: 'GET',
            headers: schema.request.headers
        })

        if (!response.ok) {
            throw new Error(`failed to fetch models for <${provider.id}>: ${response.status} ${response.statusText}`)
        }

        const data = await response.json() as { data?: { id: string }[] }
        if (!data.data || !Array.isArray(data.data)) {
            throw new Error(`invalid models response for <${provider.id}>`)
        }

        return data.data.map((m) => m.id)
    }

    async checkProviderKeys(provider: Provider) {
        const script = provider.scripts.checker
        if (!script) {
            console.warn(`provider <${provider.id}> has no checker script defined. skipped`)
            return
        }

        const isExists = await Bun.file(`modules/checker/${script}.ts`).exists()
        if (!isExists) {
            console.error(`checker script <${script}> for provider <${provider.id}> does not exist`)
            return
        }

        const checker = await import(`@/modules/checker/${script}`) as { default: typeof ProviderChecker }
        const instance = new checker.default(provider)

        const rlKeys = await Mino.Database.getProviderKeysByState(provider.keys_id, 'ratelimited')
        const errorKeys = await Mino.Database.getProviderKeysByState(provider.keys_id, 'error')

        const providerKeys = [...rlKeys, ...errorKeys].map((key) => key.key)
        if (!providerKeys.length) {
            console.log(`provider <${provider.id}> has no keys to check`)
            return
        }

        console.log(`checking ${providerKeys.length} keys for provider <${provider.id}>`)

        for await (const key of providerKeys) {
            try {
                await Bun.sleep(instance.checkDelaySeconds * 1000)
                const result = await instance.check(key)

                await Mino.Database.setProviderKeyState(key, result.result as any, false)
                if (result.metadata) {
                    await Mino.Database.setProviderKeyMetadata(key, result.metadata)
                }

                switch (result.result) {
                    case 'active':
                        console.log(`[Checker] provider <${provider.id}> key <${key.slice(0, 12)}...>: active. meta: ${JSON.stringify(result.metadata)}`)
                        break
                    case 'disabled':
                        console.log(`[Checker] provider <${provider.id}> key <${key.slice(0, 12)}...>: disabled. meta: ${JSON.stringify(result.metadata)}`)
                        break
                    default:
                        break
                }
            } catch (err) {
                console.error(`failed to check provider key <${provider.id}> <${key.slice(0, 12)}...>:`, err)
            }
        }

        console.log(`provider <${provider.id}> check completed`)
    }
}