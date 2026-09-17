// The ministry's hierarchy, in one place. The panel and the app both read it,
// and the abbreviation shown before a name is derived from the role rather than
// stored with it — so a promotion changes the name everywhere on its own.

export const ROLES = [
  { id: 'apostolo',       label: 'Apóstolo',        short: 'Ap.',      gender: 'masculino', badge: 'dourado' },
  { id: 'bispo',          label: 'Bispo',           short: 'Bp.',      gender: 'masculino', badge: 'azul' },
  { id: 'bispo_auxiliar', label: 'Bispo Auxiliar',  short: 'Bp. Aux.', gender: 'masculino', badge: 'azul' },
  { id: 'pastor',         label: 'Pastor',          short: 'Pr.',      gender: 'masculino', badge: 'azul' },
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

// Gold for the Apóstolo, blue for Bispos, Bispos Auxiliares and Pastores.
// Every other verified servant gets the plain mark: the badge says the account
// is confirmed, and only the first two ranks are set apart by colour.
export const badgeTier = (role) => byId(role)?.badge || 'neutro';
export const isMinisterRole = (role) => MINISTER_ROLES.includes(role);
export const rolesForGender = (gender) => ROLES.filter((role) => role.gender === gender);

// What a member may ask to be verified as. The Apóstolo is left out: there is
// one, the founder, and the database refuses the request too.
export const claimableRoles = (gender) => rolesForGender(gender).filter((role) => role.id !== 'apostolo');

// "Bp. Rufino Boaz". The stored name never carries the abbreviation.
export function servantName(servo) {
  if (!servo?.full_name) return '';
  const short = roleShort(servo.role);
  return short ? `${short} ${servo.full_name}` : servo.full_name;
}

// The verified seal, the scalloped disc used everywhere for this purpose. It
// sits right after the name, like on Facebook or X — a mark, not a label, so it
// does not compete with the name it certifies.
//
// Only the ranks that carry a colour get it. The seal's shape is what says
// "notable"; giving it to every verified servant would empty the gold and the
// blue of the meaning they are there to carry.
export function verifiedSeal(role, { title = 'Conta verificada' } = {}) {
  const tier = badgeTier(role);
  if (tier === 'neutro') return '';
  return `<svg class="verified-seal tier-${tier}" viewBox="0 0 24 24" width="16" height="16" role="img" aria-label="${title}"><title>${title}</title>`
    + `<path class="seal-disc" d="M10.89 2.35Q12.00 1.00 13.11 2.35Q14.23 3.69 15.86 3.08Q17.50 2.47 17.79 4.20Q18.08 5.92 19.80 6.21Q21.53 6.50 20.92 8.14Q20.31 9.77 21.65 10.89Q23.00 12.00 21.65 13.11Q20.31 14.23 20.92 15.86Q21.53 17.50 19.80 17.79Q18.08 18.08 17.79 19.80Q17.50 21.53 15.86 20.92Q14.23 20.31 13.11 21.65Q12.00 23.00 10.89 21.65Q9.77 20.31 8.14 20.92Q6.50 21.53 6.21 19.80Q5.92 18.08 4.20 17.79Q2.47 17.50 3.08 15.86Q3.69 14.23 2.35 13.11Q1.00 12.00 2.35 10.89Q3.69 9.77 3.08 8.14Q2.47 6.50 4.20 6.21Q5.92 5.92 6.21 4.20Q6.50 2.47 8.14 3.08Q9.77 3.69 10.89 2.35Z" />`
    + '<path class="seal-check" d="M7.6 12.3l3 3 5.8-6.2" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />'
    + '</svg>';
}

// For every other verified servant: a quiet outlined check, used where a line
// of text would not fit — a list being scanned, for instance.
export function quietCheck(title = 'Servo verificado') {
  return `<svg class="quiet-check" viewBox="0 0 24 24" width="14" height="14" role="img" aria-label="${title}"><title>${title}</title>`
    + '<circle cx="12" cy="12" r="9.5" fill="none" stroke-width="1.6" />'
    + '<path d="M8 12.2l2.8 2.8 5.2-5.6" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />'
    + '</svg>';
}
