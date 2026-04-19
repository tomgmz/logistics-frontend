'use client';
import * as React from 'react';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#ffffff' },
    secondary: { main: '#4df9ed' },
    background: { default: '#0a0a0a', paper: '#1b1b1b' },
  },
  typography: {
    fontFamily: '"Alegreya Sans SC", sans-serif',
    button: { textTransform: 'none', fontFamily: '"Alegreya Sans SC", sans-serif' },
  },
  shape: { borderRadius: 15 },
  components: {
    MuiCssBaseline: { styleOverrides: { body: { backgroundColor: '#0a0a0a' } } },
    MuiAppBar: { styleOverrides: { root: { boxShadow: 'none', backgroundImage: 'none' } } },
  },
});

export default function ThemeRegistry({ children }: { children: React.ReactNode }) {
  return (
    <AppRouterCacheProvider options={{ key: 'mui-style' }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}