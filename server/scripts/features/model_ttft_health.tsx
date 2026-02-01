import { Html } from '@elysiajs/html'
import { ProviderFeature, type FeatureData } from './abstract'
import schemas, { type SchemaType } from '@/server/schema'

interface TTFTPoint {
    ttft: number | null
    status: 'ok' | 'slow' | 'error'
    checkedAt: number
}

interface ModelHistory {
    id: string
    history: TTFTPoint[]
}

export interface TTFTData extends FeatureData {
    models: ModelHistory[]
    updatedAt: number
}

class ModelTTFTHealth extends ProviderFeature {
    readonly id = 'model_ttft_health'
    readonly displayName = 'model latency (ttft)'
    readonly historyLimit = 20

    async collect(): Promise<TTFTData> {
        const modelIds = Mino.Memory.getProviderModels(this.provider.id) || []
        if (modelIds.length === 0) {
            return { models: [], updatedAt: Date.now() }
        }

        const schemaConfig = this.provider.schema[0]
        if (!schemaConfig) {
            return { models: [], updatedAt: Date.now() }
        }

        const prevData = Mino.Memory.getFeatureData(this.provider.id, this.id) as TTFTData | null
        const historyMap = new Map<string, TTFTPoint[]>()

        if (prevData?.models) {
            for (const m of prevData.models) {
                historyMap.set(m.id, m.history)
            }
        }

        const results: ModelHistory[] = []

        for (const modelId of modelIds.slice(0, 5)) {
            const point = await this.measureModel(modelId, schemaConfig.id as SchemaType)

            let history = historyMap.get(modelId) || []
            history.push(point)
            if (history.length > this.historyLimit) {
                history = history.slice(-this.historyLimit)
            }

            results.push({
                id: modelId,
                history
            })

            await Bun.sleep(1500)
        }

        return { models: results, updatedAt: Date.now() }
    }

    private async measureModel(modelId: string, schemaType: SchemaType, retryCount = 0): Promise<TTFTPoint> {
        const maxRetries = Mino.Config.server.max_retry_count
        const identityKey = `feature:${this.id}`

        const schemaConfig = this.provider.schema.find(s => s.id === schemaType)
        if (!schemaConfig) {
            return { ttft: null, status: 'error', checkedAt: Date.now() }
        }

        const baseUrl = schemaConfig.base ?? this.provider.endpoint.default
        const endpoint = `${baseUrl}${schemaConfig.upstream_path}${this.getChatPath(schemaType)}`

        try {
            const keyData = await Mino.Memory.allocateKey(identityKey, this.provider)

            const dummyRequest = new Request(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            })

            const SchemaClass = schemas[schemaType]
            const schema = new SchemaClass(dummyRequest)
            schema.setProviderKey(keyData.key)
            schema.overrideHeaders(this.provider.override.headers)

            const body = this.buildRequestBody(schemaType, modelId)

            console.log(`[${this.id}] [${this.provider.id}] testing model ${modelId}`)
            const start = performance.now()

            const resp = await fetch(endpoint, {
                method: 'POST',
                headers: schema.request.headers,
                body: JSON.stringify(body)
            })

            if (!resp.ok) {
                const statusCode = resp.status
                const isRetryable = [401, 402, 403, 429].includes(statusCode) || statusCode >= 500

                if (isRetryable && retryCount < maxRetries) {
                    console.log(`[${this.id}] [${this.provider.id}] key failed (${statusCode}), retrying...`)

                    if (statusCode === 401) {
                        if (!this.provider.concurrency.keys.key_stay_active) {
                            await Mino.Database.setProviderKeyState(keyData.key, 'disabled')
                        }
                    } else if ([402, 429].includes(statusCode)) {
                        if (!this.provider.concurrency.keys.key_stay_active) {
                            await Mino.Database.setProviderKeyState(keyData.key, 'ratelimited')
                        }
                    }

                    Mino.Memory.invalidateKey(identityKey, this.provider.keys_id)
                    Mino.Memory.decrKeyConcurrency(keyData.key)

                    return this.measureModel(modelId, schemaType, retryCount + 1)
                }

                Mino.Memory.decrKeyConcurrency(keyData.key)
                console.error(`[${this.id}] [${this.provider.id}] failed to test model ${modelId}`, await resp.text())
                return { ttft: null, status: 'error', checkedAt: Date.now() }
            }

            if (!resp.body) {
                Mino.Memory.decrKeyConcurrency(keyData.key)
                return { ttft: null, status: 'error', checkedAt: Date.now() }
            }

            const reader = resp.body.getReader()
            await reader.read()
            const ttft = Math.round(performance.now() - start)
            reader.cancel()

            Mino.Memory.decrKeyConcurrency(keyData.key)

            return {
                ttft,
                status: ttft < 2000 ? 'ok' : 'slow',
                checkedAt: Date.now()
            }
        } catch (err) {
            console.error(`[${this.id}] [${this.provider.id}] error testing model ${modelId}:`, err)
            return { ttft: null, status: 'error', checkedAt: Date.now() }
        }
    }

    private getChatPath(schemaType: SchemaType): string {
        switch (schemaType) {
            case 'anthropic':
                return '/messages'
            case 'openai':
            case 'gemini':
            default:
                return '/chat/completions'
        }
    }

    private buildRequestBody(schemaType: SchemaType, modelId: string): Record<string, any> {
        switch (schemaType) {
            case 'anthropic':
                return {
                    model: modelId,
                    messages: [{ role: 'user', content: 'hi' }],
                    max_tokens: 1,
                    stream: true
                }
            case 'openai':
            case 'gemini':
            default:
                return {
                    model: modelId,
                    messages: [{ role: 'user', content: 'hi' }],
                    max_tokens: 1,
                    stream: true
                }
        }
    }

    render(data: TTFTData | null): JSX.Element {
        if (!data || data.models.length === 0) {
            return <div class="text-[#555] text-xs">no data yet</div>
        }

        return (
            <div class="space-y-2">
                <div class="grid gap-2">
                    {data.models.map(m => {
                        const latest = m.history[m.history.length - 1]
                        const history = [...m.history]

                        return (
                            <div class="bg-[#141414] border border-[#222] rounded px-2.5 py-2 flex flex-col gap-1.5 hover:border-[#333] transition-colors duration-300">
                                <div class="flex justify-between font-mono text-[11px] items-center leading-none">
                                    <span class="text-[#888] truncate">{m.id}</span>
                                    <span class={this.statusColor(latest?.status)}>
                                        {latest?.ttft !== null ? `${latest?.ttft}ms` : (latest?.status === 'error' ? 'err' : '-')}
                                    </span>
                                </div>
                                <div class="flex gap-[3px]">
                                    {history.map(point => (
                                        <div
                                            class={`w-2 h-2 rounded-[1px] ${this.statusBg(point.status)}`}
                                            title={point.ttft !== null ? `${point.ttft}ms` : 'error'}
                                        />
                                    ))}
                                </div>
                            </div>
                        )
                    })}
                </div>
                <div class="text-[#444] text-[10px] text-right">
                    updated {this.timeAgo(data.updatedAt)}
                </div>
            </div>
        )
    }

    private statusColor(status?: TTFTPoint['status']): string {
        if (!status) return 'text-[#555]'
        return status === 'ok' ? 'text-[#60d860]'
            : status === 'slow' ? 'text-[#d8b060]'
                : 'text-[#d86060]'
    }

    private statusBg(status: TTFTPoint['status']): string {
        return status === 'ok' ? 'bg-[#60d860]'
            : status === 'slow' ? 'bg-[#d8b060]'
                : 'bg-[#d86060]'
    }

    private timeAgo(ts: number): string {
        const diff = Date.now() - ts
        const mins = Math.floor(diff / 60000)
        if (mins < 1) return 'just now'
        if (mins < 60) return `${mins}m ago`
        return `${Math.floor(mins / 60)}h ago`
    }
}

export default ModelTTFTHealth
