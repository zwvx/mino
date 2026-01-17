export function matchProvider(requestPath: string, providerIds: string[]) {
    const sorted = providerIds.sort((a, b) => b.length - a.length)

    for (const id of sorted) {
        if (requestPath === id || requestPath.startsWith(id + '/')) {
            const endpoint = requestPath.slice(id.length)

            return {
                provider: id,
                endpoint: endpoint === '' ? '/' : endpoint
            }
        }
    }

    return null
}
