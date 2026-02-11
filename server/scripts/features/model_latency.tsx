import { Html } from '@elysiajs/html'
import { ProviderFeature, type FeatureData } from './abstract'

interface ModelStats {
    avg: number
    min: number
    max: number
    count: number
}

interface LatencyData extends FeatureData {
    stats: Record<string, ModelStats>
    updatedAt: number
}

class ModelLatency extends ProviderFeature {
    readonly id = 'model_latency'
    readonly displayName = 'avg model response'

    async collect(): Promise<LatencyData> {
        const stats = Mino.Memory.getModelLatencyStats(this.provider.id)
        return { stats, updatedAt: Date.now() }
    }

    render(data: LatencyData | null): JSX.Element {
        if (!data || Object.keys(data.stats).length === 0) {
            return <div class="text-[#555] text-xs">no data yet</div>
        }

        const sortedModels = Object.entries(data.stats).sort(([, a], [, b]) => a.avg - b.avg)

        return (
            <div class="space-y-2">
                <div class="grid gap-2">
                    {sortedModels.map(([modelId, stat]) => (
                        <div class="bg-[#141414] border border-[#222] rounded px-2.5 pb-2 pt-[9px] flex flex-col hover:border-[#333] transition-colors duration-300">
                            <div class="flex justify-between font-mono text-[11px] items-center leading-none mb-1.5">
                                <span class="text-[#888] truncate pr-2" title={modelId}>{modelId}</span>
                                <span class="text-[#ccc] shrink-0">{(stat.avg / 1000).toFixed(2)}s</span>
                            </div>

                            <div class="flex items-center gap-2">
                                <div class="flex-1 h-1 bg-[#222] rounded overflow-hidden">
                                    <div
                                        class="h-full bg-[#333]"
                                        style={`width: ${Math.min((stat.avg / 10000) * 100, 100)}%`}
                                    />
                                </div>
                                <div class="text-[9px] text-[#555] font-mono whitespace-nowrap">
                                    {(stat.min / 1000).toFixed(2)}s - {(stat.max / 1000).toFixed(2)}s
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    private timeAgo(ts: number): string {
        const diff = Date.now() - ts
        const mins = Math.floor(diff / 60000)
        if (mins < 1) return 'just now'
        if (mins < 60) return `${mins}m ago`
        return `${Math.floor(mins / 60)}h ago`
    }
}

export default ModelLatency
