# Revisión de accesos

Trimestral. Próxima: febrero de 2027.

## 4-nov-2026

| Cuenta o clave | Quién accede | Dónde vive | Última rotación |
|---|---|---|---|
| GitHub (repositorio y Actions) | Dueño | — | — |
| Vercel | Dueño | — | — |
| Supabase (panel) | Dueño | — | — |
| Clave secreta de Supabase | Pipeline | GitHub Secrets, `.env` local | Al crear el proyecto (3-nov-2026) |
| Clave publicable de Supabase | Web, keepalive, test de RLS | Vercel, GitHub Secrets | No requiere (pública) |
| `REVALIDATE_SECRET` | Pipeline y web | GitHub Secrets, Vercel, `.env` local | Al crearlo |
| API-Basketball | Nadie (fuente desactivada) | `.env` local | No se usa |
| `powerbi_reader` | Power BI del dueño | Contraseña fuera del repositorio | Sin login hasta que el dueño la active |

2FA en GitHub, Vercel y Supabase: no confirmado por el dueño. Riesgo aceptado (R16): las cuentas
no se pueden verificar desde el repositorio; el impacto de un acceso indebido se limita con RLS (la
base no acepta escrituras sin la clave secreta) y con el backup cifrado mensual.

Clave del backup: la privada está en la máquina del dueño (`~/.pelotheta-basquet/backup-age.key` (par propio, distinto del de fútbol)), fuera del
repositorio; la pública en `config/backup_age_recipient.txt`. Si se pierde la privada, los backups
viejos quedan ilegibles: se genera un par nuevo y se reemplaza la pública.
