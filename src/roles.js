// The ministry's hierarchy, in one place. The panel and the app both read it,
// and the abbreviation shown before a name is derived from the role rather than
// stored with it — so a promotion changes the name everywhere on its own.

export const ROLES = [
  { id: 'apostolo',       label: 'Apóstolo',        short: 'Ap.',      gender: 'masculino' },
  { id: 'bispo',          label: 'Bispo',           short: 'Bp.',      gender: 'masculino' },
  { id: 'bispo_auxiliar', label: 'Bispo Auxiliar',  short: 'Bp. Aux.', gender: 'masculino' },
  { id: 'pastor',         label: 'Pastor',          short: 'Pr.',      gender: 'masculino' },
  { id: 'pastor_auxiliar',label: 'Pastor Auxiliar', short: 'Pr. Aux.', gender: 'masculino' },
  { id: 'discipulo',      label: 'Discípulo',       short: 'Disc.',    gender: 'masculino' },
  { id: 'obreiro',        label: 'Obreiro',         short: 'Obr.',     gender: 'masculino' },
  { id: 'futuro_obreiro', label: 'Futuro Obreiro',  short: 'Fut. Obr.',gender: 'masculino' },
  { id: 'dona',           label: 'Dona',            short: 'Dona',     gender: 'feminino'  },
  { id: 'obreira',        label: 'Obreira',         short: 'Obr.',     gender: 'feminino'  },
  { id: 'futura_obreira', label: 'Futura Obreira',  short: 'Fut. Obr.',gender: 'feminino'  }
];

export const MINISTER_ROLES = ['apostolo', 'bispo', 'bispo_auxiliar', 'pastor', 'pastor_auxiliar', 'discipulo'];

const byId = (role) => ROLES.find((item) => item.id === role);

export const roleLabel = (role) => byId(role)?.label || role || '';
export const roleShort = (role) => byId(role)?.short || '';
export const isMinisterRole = (role) => MINISTER_ROLES.includes(role);
export const rolesForGender = (gender) => ROLES.filter((role) => role.gender === gender);

// "Bp. Rufino Boaz". The stored name never carries the abbreviation.
export function servantName(servo) {
  if (!servo?.full_name) return '';
  const short = roleShort(servo.role);
  return short ? `${short} ${servo.full_name}` : servo.full_name;
}
