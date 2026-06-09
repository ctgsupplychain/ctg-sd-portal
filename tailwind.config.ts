import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Signal design system palette
        cloud: '#F4F2EE',
        sand: '#E4DDD3',
        ink: '#1F2937',
        inkSoft: '#4B5563',
        teal: '#0E5C56',
        tealLight: '#DCEAE8',
        amber: '#E8A33D',
        red: '#C5453F',
        green: '#2F9E68',
        // Deprecated aliases — retained during migration, remove once unused
        brand: {
          dark: '#1A2535',
          accent: '#048A81',
          warn: '#E07B39',
        }
      },
      fontFamily: {
        heading: ['Cambria', 'Georgia', '"Times New Roman"', 'serif'],
        body: ['Calibri', '"Segoe UI"', 'Tahoma', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
