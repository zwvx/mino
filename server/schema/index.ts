import { AnthropicRequest } from './anthropic'
import { GeminiRequest } from './gemini'
import { OpenAIRequest } from './openai'
import { SchemaRequest } from './base'

export { SchemaRequest }

export const schemas = {
    anthropic: AnthropicRequest,
    gemini: GeminiRequest,
    openai: OpenAIRequest
}

export type SchemaType = keyof typeof schemas

export type SchemaRequestType = AnthropicRequest | GeminiRequest | OpenAIRequest

export default schemas