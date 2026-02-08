export type EndpointType = 'chat_completion' | 'image_generation' | 'passthrough'

export interface EndpointTypeConfig {
    type: EndpointType
    patterns: string[]
}
