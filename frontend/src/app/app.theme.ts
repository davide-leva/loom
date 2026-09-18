import { definePreset } from '@primeng/themes';
import Aura from '@primeng/themes/aura';

// Riprende il preset Aura e la palette blu del login di movex-web.
export const theme = definePreset(Aura, {
  semantic: {
    colorScheme: {
      light: {
        surface: { 200: '#f8f8f8' },
        card: { color: '#ffffff' },
        primary: {
          50: '#eef5fc', 100: '#d1e4f6', 200: '#a3c8ed',
          300: '#75ade4', 400: '#4791db', 500: '#1976d2',
          600: '#145ea8', 700: '#0f477e', 800: '#0a2f54',
          900: '#05182a'
        }
      }
    }
  }
});
