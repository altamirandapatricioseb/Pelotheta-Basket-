// Selector de equipo de la landing (país → categoría → equipo). Los mismos diez países de Sudamérica
// que Pelotheta fútbol, con la liga de básquet de cada uno. Hoy solo hay datos de Boca: todo lo demás
// se muestra pero no se puede elegir (`available: false`). Cuando entre otro equipo, alcanza con
// marcarlo acá. Ligas y clubes de los otros países: temporada 2026 o 2026-27, revisados el 15-nov-2026.

export interface Team {
  slug: string;
  name: string;
  available: boolean;
}

export interface Category {
  slug: string;
  name: string;
  teams: Team[];
}

export interface Country {
  slug: string;
  name: string;
  /** Código de tres letras (FIBA), para la marca chica de cada país. */
  code: string;
  categories: Category[];
}

const team = (name: string, available = false): Team => ({
  slug: name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, ''),
  name,
  available,
});

const list = (names: string[]) => names.map((n) => team(n));

export const COUNTRIES: readonly Country[] = [
  {
    slug: 'argentina',
    name: 'Argentina',
    code: 'ARG',
    categories: [
      {
        slug: 'liga-nacional',
        name: 'Liga Nacional',
        teams: [
          team('Boca Juniors', true),
          ...list([
            'Quimsa',
            'Peñarol',
            'Atenas',
            'Gimnasia de Comodoro',
            'Argentino de Junín',
            'Instituto',
            'Independiente de Oliva',
            'Olímpico',
            'Platense',
            'Racing de Chivilcoy',
            'Lanús',
            'La Unión de Formosa',
            'Ferro',
            'Regatas Corrientes',
            'San Lorenzo',
            'Oberá',
            'San Martín de Corrientes',
          ]),
        ],
      },
      { slug: 'liga-argentina', name: 'Liga Argentina', teams: [] },
      { slug: 'liga-federal', name: 'Liga Federal', teams: [] },
    ],
  },
  {
    slug: 'brasil',
    name: 'Brasil',
    code: 'BRA',
    categories: [
      {
        slug: 'nbb',
        name: 'NBB',
        teams: list(['Flamengo', 'Franca', 'Minas', 'Pinheiros', 'Mogi', 'Bauru', 'Paulistano', 'Corinthians']),
      },
      { slug: 'liga-ouro', name: 'Liga Ouro', teams: [] },
    ],
  },
  {
    slug: 'uruguay',
    name: 'Uruguay',
    code: 'URU',
    categories: [
      {
        slug: 'liga-uruguaya',
        name: 'Liga Uruguaya de Básquetbol',
        teams: list([
          'Aguada',
          'Peñarol',
          'Nacional',
          'Defensor Sporting',
          'Biguá',
          'Malvín',
          'Goes',
          'Hebraica y Macabi',
        ]),
      },
      { slug: 'liga-de-ascenso', name: 'Liga de Ascenso', teams: [] },
    ],
  },
  {
    slug: 'chile',
    name: 'Chile',
    code: 'CHI',
    categories: [
      {
        slug: 'liga-nacional',
        name: 'Liga Nacional de Básquetbol',
        teams: list([
          'Colegio Los Leones',
          'Universidad de Concepción',
          'CD Valdivia',
          'Puerto Montt Basket',
          'Municipal Puente Alto',
          'ABA Ancud',
          'Colo-Colo',
          'Universidad Católica',
        ]),
      },
      { slug: 'liga-dos', name: 'Liga DOS', teams: [] },
    ],
  },
  {
    slug: 'colombia',
    name: 'Colombia',
    code: 'COL',
    categories: [
      {
        slug: 'liga-profesional',
        name: 'Liga Profesional de Baloncesto',
        teams: list([
          'Paisas',
          'Toros del Valle',
          'Caimanes del Llano',
          'Motilones del Norte',
          'Caribbean Storm',
          'Sabios',
          'Piratas de Bogotá',
        ]),
      },
    ],
  },
  {
    slug: 'paraguay',
    name: 'Paraguay',
    code: 'PAR',
    categories: [
      {
        slug: 'liga-nacional',
        name: 'Liga Nacional de Básquetbol',
        teams: list([
          'Olimpia Kings',
          'Deportivo San José',
          'Colonias Gold',
          'Félix Pérez Cardozo',
          'Deportivo Amambay',
          'Deportivo Campo Alto',
          'San Alfonzo',
          'Ciudad Nueva',
        ]),
      },
    ],
  },
  {
    slug: 'ecuador',
    name: 'Ecuador',
    code: 'ECU',
    categories: [
      {
        slug: 'liga-basquet-pro',
        name: 'Liga Básquet Pro',
        teams: list([
          'Zamora Raptors',
          'Piratas de Los Lagos',
          'Importadora Alvarado',
          'Guerreros de Neumane',
          'Jorge Guzmán',
          'Cuenca Basket Club',
          'San Antonio Gold',
        ]),
      },
    ],
  },
  {
    slug: 'peru',
    name: 'Perú',
    code: 'PER',
    categories: [
      {
        slug: 'liga-nacional',
        name: 'Liga Nacional de Basketball',
        teams: list([
          'Liga Claretiana',
          'Lions',
          'Catequil',
          'Che Pibes',
          'Kings',
          'Halcones',
          'Comunicaciones',
          'Sonics',
        ]),
      },
      { slug: 'torneo-de-ascenso', name: 'Torneo Nacional de Ascenso', teams: [] },
    ],
  },
  {
    slug: 'bolivia',
    name: 'Bolivia',
    code: 'BOL',
    categories: [
      {
        slug: 'libobasquet',
        name: 'Libobásquet',
        teams: list(['Nacional Potosí', 'Universitario de Sucre', 'CAN Oruro', 'Leyendas', 'Aremis']),
      },
    ],
  },
  {
    slug: 'venezuela',
    name: 'Venezuela',
    code: 'VEN',
    categories: [
      {
        slug: 'spb',
        name: 'Superliga Profesional de Baloncesto',
        teams: list([
          'Cocodrilos de Caracas',
          'Marinos de Anzoátegui',
          'Trotamundos de Carabobo',
          'Guaiqueríes de Margarita',
          'Gaiteros del Zulia',
          'Spartans Distrito Capital',
          'Piratas de La Guaira',
          'Brillantes del Zulia',
        ]),
      },
    ],
  },
];

export const categoryAvailable = (c: Category) => c.teams.some((t) => t.available);
export const countryAvailable = (c: Country) => c.categories.some(categoryAvailable);

/** Resuelve lo elegido desde la URL contra las listas cerradas: lo que no existe o no tiene datos se ignora. */
export function resolveChoice(pais: string | null, categoria: string | null, equipo: string | null) {
  const country = COUNTRIES.find((c) => c.slug === pais && countryAvailable(c));
  const category = country?.categories.find((c) => c.slug === categoria && categoryAvailable(c));
  const team = category?.teams.find((t) => t.slug === equipo && t.available);
  return { country, category, team };
}
