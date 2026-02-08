import type { EndpointTypeConfig } from './endpoint-types'

export interface ProviderConfig {
    provider: Provider
}

export interface Header {
    key: string;
    value: string;
}

export interface Provider {
    id: string;
    keys_id: string;
    keys_metadata?: { key: string; value: any }[];
    enable: boolean;
    hidden: boolean;
    require_auth: boolean;
    endpoint: Endpoint;
    schema: Schema[];
    endpoint_types?: EndpointTypeConfig[];
    limit: Limit;
    pricing: Pricing;
    concurrency: Concurrency;
    override: Override;
    filter_models: string[];
    remap_models?: Record<string, string>;
    scripts: Scripts;
    cooldown: Cooldown;
    page?: Page;
}

export interface Concurrency {
    identity: number;
    keys: Keys;
}

export interface Keys {
    same_key: number;
    max_usage_same_key: number;
    key_stay_active?: boolean;
}

export interface Endpoint {
    default: string;
    [key: string]: string;
}

export interface Limit {
    payload: Payload;
}

export interface Payload {
    input: number;
    output: number;
}

export interface Override {
    headers: Header[];
    path: PathOverride[];
    models: any[];
    strip_mode?: 'default' | 'minimal';
}

export interface PathOverride {
    path: string;
    status: number;
}

export interface Pricing {
    input: Put;
    output: Put;
}

export interface Put {
    value: number;
    token_scale: number;
}

export interface Schema {
    id: string;
    base?: string;
    upstream_path: string;
}

export interface Scripts {
    checker: string | null;
    preflight: string | null;
    response_validation?: string | null;
}

export interface Cooldown {
    default: string;
    [key: string]: string;
}

export interface PageFeatureOptions {
    interval?: string
    [key: string]: any
}

export interface PageFeature {
    id: string
    options?: PageFeatureOptions
}

export interface Page {
    message?: string
    features?: PageFeature[]
}
