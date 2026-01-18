import type { Provider } from '@/types/provider'
import schemas, { type SchemaType } from '../schema'

export class MinoServices {
    async fetchProviderModels(provider: Provider, apiKey: string): Promise<string[]> {
        const schemaConfig = provider.schema[0]
        if (!schemaConfig) {
            throw new Error(`provider ${provider.id} has no schema defined`)
        }

        const baseUrl = schemaConfig.base ?? provider.endpoint.default
        const modelsEndpoint = `${baseUrl}${schemaConfig.upstream_path}/models`

        const SchemaClass = schemas[schemaConfig.id as SchemaType]
        if (!SchemaClass) {
            throw new Error(`unknown schema ${schemaConfig.id} for provider ${provider.id}`)
        }

        const dummyRequest = new Request(modelsEndpoint, { method: 'GET' })
        const schema = new SchemaClass(dummyRequest)
        schema.setProviderKey(apiKey)

        const response = await fetch(modelsEndpoint, {
            method: 'GET',
            headers: schema.request.headers
        })

        if (!response.ok) {
            throw new Error(`failed to fetch models for ${provider.id}: ${response.status} ${response.statusText}`)
        }

        const data = await response.json() as { data?: { id: string }[] }
        if (!data.data || !Array.isArray(data.data)) {
            throw new Error(`invalid models response for ${provider.id}`)
        }

        return data.data.map((m) => m.id)
    }
}