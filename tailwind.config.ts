import type { Config } from 'tailwindcss'

export default {
    content: ['server/views/*.{ts,tsx}'],
    theme: {
        extend: {}
    },
    plugins: []
} satisfies Config