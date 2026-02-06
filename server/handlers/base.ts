import type { EndpointType } from '@/types/endpoint-types'

export abstract class EndpointHandler {
    abstract type: EndpointType

    validateRequest(body: ArrayBuffer | null): string | null {
        return null
    }

    getModelId(body: ArrayBuffer): string | null {
        return null
    }

    rewriteModel(body: ArrayBuffer, newModel: string): ArrayBuffer {
        return body
    }

    getInputUnits(body: ArrayBuffer): number {
        return 0
    }

    getMaxOutputUnits(body: ArrayBuffer): number | null {
        return null
    }

    parseResponse(content: string): { content: string, units: number } {
        return { content: '', units: 0 }
    }

    get trackUnits(): boolean {
        return false
    }

    get validateModel(): boolean {
        return false
    }
}
