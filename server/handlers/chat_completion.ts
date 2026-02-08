import { EndpointHandler } from './base'
import type { SchemaRequestType } from '../schema'

export class ChatCompletionHandler extends EndpointHandler {
    type = 'chat_completion' as const

    constructor(private schema: SchemaRequestType) {
        super()
    }

    override get trackUnits() {
        return true
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

    override getInputUnits(body: ArrayBuffer): number {
        return this.schema.getRequestToken(body) ?? 0
    }

    override getMaxOutputUnits(body: ArrayBuffer): number | null {
        return this.schema.getMaxTokens(body)
    }

    override parseResponse(content: string) {
        const result = this.schema.parseSSEChatResponse(content)
        return {
            content: result.content,
            units: result.tokenCount
        }
    }
}
