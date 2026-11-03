import type { Metadata } from 'next';
import { Montserrat, Noto_Sans } from 'next/font/google';

import './globals.css';

// next/font descarga las fuentes en el build y las sirve desde el propio sitio:
// no hay requests a Google desde el navegador del visitante (privacidad y CSP 'self').
const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-montserrat',
  display: 'swap',
});

// Respaldo solo para letras griegas (Θ del nombre, α, β y λ de las métricas).
const greek = Noto_Sans({
  subsets: ['greek'],
  weight: ['400', '700', '800'],
  variable: '--font-greek',
  display: 'swap',
});

// Render dinámico en todas las páginas: lo exige el nonce de la CSP, que cambia en cada
// request. Los datos igual se cachean 6 horas (ver lib/supabase/server.ts).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: 'Pelotheta Θ · Básquet', template: '%s · Pelotheta Θ' },
  description: 'Sistema de análisis de datos de Boca Juniors básquet (Liga Nacional). Proyecto de portfolio.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-AR" className={`${montserrat.variable} ${greek.variable}`}>
      <body>
        <main id="contenido" className="page">
          {children}
        </main>
        <footer className="page muted">
          Proyecto de portfolio sin fines comerciales. Datos: Liga Nacional de Básquet (laliganacional.com.ar). Las
          interfaces se publican por etapas.
        </footer>
      </body>
    </html>
  );
}
