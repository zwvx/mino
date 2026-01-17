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
    enable: boolean;
    hidden: boolean;
    require_auth: boolean;
    endpoint: Endpoint;
    schema: Schema[];
    limit: Limit;
    pricing: Pricing;
    concurrency: Concurrency;
    override: Override;
    filter_models: any[];
    scripts: Scripts;
    cooldown: Cooldown;
}

export interface Concurrency {
    identity: number;
    keys: Keys;
}

export interface Keys {
    same_key: number;
    max_usage_same_key: number;
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
    path: any[];
    models: any[];
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
    upstream_path: string;
}

export interface Scripts {
    checker: string;
    preflight: null;
}

export interface Cooldown {
    default: string;
    [key: string]: string;
}
