import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Todas las rutas con datos reales, como en Pelotheta fútbol: el jugador con más minutos (175), el
// último partido (142) y una estadística desglosada de cada entidad.
const ROUTES = [
  '/',
  '/equipo',
  '/jugadores',
  '/situaciones',
  '/comparar?jugador=175',
  '/actualizar',
  '/jugador/175',
  '/partido/142',
  '/estadistica/pts?entidad=jugador&id=175',
  '/estadistica/net_rating?entidad=equipo',
  '/privacidad',
];

for (const theme of ['light', 'dark'] as const) {
  for (const route of ROUTES) {
    test(`${route} sin problemas de accesibilidad (${theme})`, async ({ page, context, baseURL }) => {
      await context.addCookies([{ name: 'tema', value: theme, url: baseURL ?? 'http://localhost:3000' }]);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      // `load` y no `networkidle`: el servidor de desarrollo deja conexiones abiertas y la espera se cuelga.
      await page.goto(route, { waitUntil: 'load' });
      await expect(page.locator('#contenido')).toBeVisible();
      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      const summary = violations.map(
        (v) =>
          `${v.id} (${v.impact ?? 'sin impacto'}): ${String(v.nodes.length)} × ${v.nodes[0]?.target.join(' ') ?? ''}`,
      );
      expect(summary).toEqual([]);
    });
  }
}

for (const route of ROUTES) {
  test(`${route} sin desplazamiento horizontal`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'load' });
    await expect(page.locator('#contenido')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
