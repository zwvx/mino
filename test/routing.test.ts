import { expect, test } from 'bun:test'
import { matchProvider } from '../server/utils/route'

const providers = [
    'deepseek',
    'deepseek/beta',
    'openai',
    'azure/openai/v2'
]

test('match simple provider', () => {
    const result = matchProvider('deepseek/chat/completions', providers)
    expect(result).toEqual({ provider: 'deepseek', endpoint: '/chat/completions' })
})

test('match nested provider', () => {
    const result = matchProvider('deepseek/beta/chat/completions', providers)
    expect(result).toEqual({ provider: 'deepseek/beta', endpoint: '/chat/completions' })
})

test('match exact provider', () => {
    const result = matchProvider('deepseek/beta', providers)
    expect(result).toEqual({ provider: 'deepseek/beta', endpoint: '/' })
})

test('match complex nested provider', () => {
    const result = matchProvider('azure/openai/v2/deployments', providers)
    expect(result).toEqual({ provider: 'azure/openai/v2', endpoint: '/deployments' })
})

test('no match', () => {
    const result = matchProvider('unknown/provider', providers)
    expect(result).toBeNull()
})

test('partial match fail', () => {
    const result = matchProvider('deep/chat', providers)
    expect(result).toBeNull()
})
