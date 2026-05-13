import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0B132B',
        tide: '#1C2541',
        foam: '#F8F7F4',
        mint: '#5BC0BE',
      },
    },
  },
  plugins: [],
};

export default config;