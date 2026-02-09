import type { EndpointType, EndpointTypeConfig } from '@/types/endpoint-types'
import type { SchemaRequestType } from '../schema'
import { EndpointHandler } from './base'
import { ChatCompletionHandler } from './chat_completion'
import { ImageGenerationHandler } from './image_generation'
import { PassthroughHandler } from './passthrough'

export { EndpointHandler } from './base'
export { ChatCompletionHandler } from './chat_completion'
export { ImageGenerationHandler } from './image_generation'
export { PassthroughHandler } from './passthrough'

function matchPattern(path: string, pattern: string): boolean {
    if (pattern === '*') return true

    if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$')
        return regex.test(path)
    }

    return path === pattern || path.endsWith(pattern)
}

export function resolveEndpointType(
    path: string,
    overrides?: EndpointTypeConfig[],
    schema?: SchemaRequestType
): EndpointType {
    if (overrides) {
        for (const override of overrides) {
            for (const pattern of override.patterns) {
                if (matchPattern(path, pattern)) {
                    return override.type
                }
            }
        }
    }

    if (schema) {
        return schema.getEndpointType(path)
    }

    return 'passthrough'
}

export function getHandler(type: EndpointType, schema?: SchemaRequestType): EndpointHandler {
    switch (type) {
        case 'chat_completion':
            if (!schema) throw new Error('chat_completion requires schema')
            return new ChatCompletionHandler(schema)
        case 'image_generation':
            if (!schema) throw new Error('image_generation requires schema')
            return new ImageGenerationHandler(schema)
        case 'passthrough':
        default:
            return new PassthroughHandler()
    }
}

