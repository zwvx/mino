import { EndpointHandler } from './base'
import type { SchemaRequestType } from '../schema'

export class ImageGenerationHandler extends EndpointHandler {
    type = 'image_generation' as const

    constructor(private schema: SchemaRequestType) {
        super()
    }

    override get validateModel() {
        return true
    }

    override getModelId(body: ArrayBuffer): string | null {
        return this.schema.getModelId(body)
    }

    override rewriteModel(body: ArrayBuffer, newModel: string): ArrayBuffer {
        return this.schema.rewriteModelInBody(body, newModel)
    }
}
