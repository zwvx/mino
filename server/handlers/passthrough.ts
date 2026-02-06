import { EndpointHandler } from './base'

export class PassthroughHandler extends EndpointHandler {
    type = 'passthrough' as const
}
