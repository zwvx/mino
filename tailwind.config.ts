import type { Config } from 'tailwindcss'

export default {
    content: ['server/views/*.{ts,tsx}', 'server/scripts/features/*.tsx'],
    theme: {
        extend: {}
    },
    plugins: []
} satisfies Config