import { Html } from '@elysiajs/html'
import { ProviderFeature, type FeatureData } from './abstract'
import { listProviderImages, type ImageEntry } from '@/server/utils/image-store'

export interface GalleryData extends FeatureData {
    images: ImageEntry[]
    updatedAt: number
}

class ImageGallery extends ProviderFeature {
    readonly id = 'image_gallery'
    readonly displayName = 'recent generations'

    async collect(): Promise<GalleryData> {
        const images = await listProviderImages(this.provider.id)
        return { images, updatedAt: Date.now() }
    }

    render(data: GalleryData | null): JSX.Element {
        if (!data || data.images.length === 0) {
            return <div class="text-[#555] text-xs">no images yet</div>
        }

        return (
            <div>
                <div class="columns-2 md:columns-3 gap-2.5">
                    {data.images.map(img => (
                        <a
                            href={`/gallery/${this.provider.id}/${img.filename}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="block mb-2.5 break-inside-avoid group"
                        >
                            <div class="relative bg-[#141414] border border-[#222] rounded overflow-hidden hover:border-[#444] transition-colors duration-300">
                                <img
                                    src={`/gallery/${this.provider.id}/thumb/${img.filename}`}
                                    alt={img.model}
                                    loading="lazy"
                                    class="w-full block"
                                />
                                <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[#000000cc] to-transparent px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                    <div class="font-mono text-[10px] text-white truncate">{img.model}</div>
                                    <div class="font-mono text-[9px] text-white">{this.timeAgo(img.timestamp)}</div>
                                </div>
                            </div>
                        </a>
                    ))}
                </div>
                <div class="text-[#444] text-[10px] text-right mt-2">
                    {data.images.length} image{data.images.length !== 1 ? 's' : ''} • updated {this.timeAgo(data.updatedAt)}
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

export default ImageGallery
