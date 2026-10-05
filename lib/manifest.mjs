// The installed app's name and shortcuts, in the language the reader chose.
//
// manifest.webmanifest holds one language, so the page asks for
// /manifest.webmanifest?lang=en and the words come from the same catalogue the
// app uses. The sigla ISTN-SJ is a brand and stays as it is in every language.
import { messages } from '../src/locales/messages.js';

const LOCALES = { en: 'en-GB', fr: 'fr-FR', es: 'es-ES' };
const say = (source, lang) => messages[source]?.[lang] ?? source;

export const isManifestLanguage = (lang) => Object.hasOwn(LOCALES, lang);

export function localizedManifest(base, lang) {
  if (!isManifestLanguage(lang)) return base;
  return {
    ...base,
    name: say('ISTN-SJ — Igreja Salvação de Todas as Nações', lang),
    description: say(base.description, lang),
    lang: LOCALES[lang],
    shortcuts: (base.shortcuts || []).map((shortcut) => ({
      ...shortcut,
      name: say(shortcut.name, lang),
      short_name: say(shortcut.short_name, lang),
      description: say(shortcut.description, lang)
    }))
  };
}
