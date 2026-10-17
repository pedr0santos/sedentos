/** Cores e fontes vêm das variáveis CSS em src/styles/index.css */
const cor = (v) => `rgb(var(${v}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: cor('--primary-rgb'),
        secondary: cor('--secondary-rgb'),
        dark: cor('--dark-rgb'),
        bg: cor('--bg-rgb'),
        texto: cor('--text-rgb'),
        muted: cor('--text-muted-rgb'),
        success: cor('--success-rgb'),
        warning: cor('--warning-rgb'),
        danger: cor('--danger-rgb'),
      },
      fontFamily: { sans: ['var(--font)'], titulo: ['var(--font-titulo)'] },
      backgroundImage: { gradiente: 'var(--gradient)' },
    },
  },
  plugins: [],
};
