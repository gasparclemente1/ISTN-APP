import assert from 'node:assert/strict';
import { messages } from '../src/locales/messages.js';
import { language, locale, setLanguage, t, th, onLanguageChange, languageSelector } from '../src/i18n.js';
import { header, navigation, externalHint } from '../src/views/shared.js';
import { teachingsPage } from '../src/views/teachings.js';
import { profileView } from '../src/profile.js';
import { formatPostDate } from '../src/posts.js';
import { countryName } from '../src/countries.js';
import { recurrenceLabel } from '../src/meetings.js';

const inLanguage = (code, fn) => {
  setLanguage(code, { remember: false });
  try { return fn(); } finally { setLanguage('pt', { remember: false }); }
};

test('as traduções têm os mesmos valores dinâmicos e não contêm HTML', () => {
  const tokens = (text) => [...text.matchAll(/\{\d+\}/g)].map(([token]) => token).sort();
  for (const [source, translations] of Object.entries(messages)) {
    for (const lang of ['en', 'fr', 'es']) {
      assert.ok(translations[lang]?.trim(), `${source}: ${lang}`);
      assert.deepEqual(tokens(translations[lang]), tokens(source), `${source}: ${lang}`);
      assert.doesNotMatch(translations[lang], /<\/?[a-z]/i);
    }
  }
});

test('seletor, navegação e acessibilidade mudam sem alterar os endereços', () => {
  for (const [code, home, lang] of [['en', 'Home', 'en-GB'], ['fr', 'Accueil', 'fr-FR'], ['pt', 'Início', 'pt-PT'], ['es', 'Inicio', 'es-ES']]) {
    inLanguage(code, () => {
      assert.equal(locale(), lang);
      assert.match(navigation('home'), new RegExp(`<span>${home}</span>`));
      assert.match(navigation('home'), /href="\/ensinos"/);
      assert.match(languageSelector(), new RegExp(`value="${code}" selected`));
      assert.match(header(), /data-language/);
      assert.equal(externalHint().includes('noutra janela'), code === 'pt');
    });
  }
});

test('o idioma é guardado e relido; bloqueio de armazenamento não impede a troca', async () => {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map();
  const events = [];
  const unsubscribe = onLanguageChange((value) => events.push(value));
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value)
    }});
    setLanguage('fr');
    assert.deepEqual([...values.values()], ['fr']);
    const fresh = await import('../src/i18n.js?persist-test');
    assert.equal(fresh.language(), 'fr');
    assert.equal(fresh.hasLanguagePreference(), true);
    assert.equal(setLanguage('de'), false);
    assert.equal(language(), 'fr');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
    assert.doesNotThrow(() => setLanguage('en'));
    const blocked = await import('../src/i18n.js?blocked-test');
    assert.equal(blocked.language(), 'pt');
    assert.deepEqual(events, ['fr', 'en']);
  } finally {
    unsubscribe();
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete globalThis.localStorage;
    setLanguage('pt', { remember: false });
  }
});

test('conteúdo editorial e valores dos filtros ficam intactos em inglês e francês', () => {
  const state = {
    teachings: [{ id: 'test', title: 'Palavra original <texto>', biblicalReference: 'João 3:16', publishedAt: '2024-01-01', url: 'https://www.youtube.com/watch?v=abcdefghijk', service: 'Culto de domingo' }],
    teachingFilters: { query: '', category: 'Todas', year: '', book: '', sort: 'recent', savedOnly: false, page: 1 }
  };
  for (const code of ['en', 'fr', 'es']) inLanguage(code, () => {
    const html = teachingsPage(state);
    assert.match(html, /Palavra original &lt;texto&gt;/);
    // The reference is read in the reader's language; the book filter's value stays the stored name.
    assert.match(html, new RegExp(({ en: 'John 3:16', fr: 'Jean 3:16', es: 'Juan 3:16' })[code]));
    assert.match(html, /data-value="Cultos"/);
    assert.match(html, /value="João"/);
    assert.ok(html.includes(({ en: 'John (1)', fr: 'Jean (1)', es: 'Juan (1)' })[code]));
    assert.doesNotMatch(html, /\{\d+\}/);
  });
});

test('datas, países e recorrências seguem o idioma escolhido', () => {
  inLanguage('en', () => {
    assert.equal(countryName('NO'), 'Norway');
    assert.equal(formatPostDate('2026-10-04T10:55:00Z', new Date('2026-10-04T11:00:00Z')), '5 min ago');
    assert.equal(recurrenceLabel({ recurrence: 'weekly', weekdays: [0, 6] }), 'Sunday, Saturday');
  });
  inLanguage('fr', () => {
    assert.equal(countryName('NO'), 'Norvège');
    assert.equal(recurrenceLabel({ recurrence: 'monthly_last', weekdays: [6] }), 'Dernier samedi de chaque mois');
  });
});

test('perfil apresenta a língua efetiva e as quatro opções suportadas', () => {
  inLanguage('fr', () => {
    const html = profileView({ state: { profile: { display_name: 'Pessoa Teste', language: 'pt' }, profileSheet: 'language', churchOptions: [] }, escapeHtml: (s) => String(s ?? ''), header: () => '', navigation: () => '' });
    assert.match(html, /Choisissez la langue de l’application/);
    assert.match(html, /value="fr" checked/);
    assert.match(html, /Español/);
  });
});

test('interpolação não reinterpreta conteúdo e escapa texto de interface', () => {
  inLanguage('en', () => {
    assert.equal(t('Chave desconhecida'), 'Chave desconhecida');
    assert.equal(t('Copiar {5}', { 5: 'texto {0}' }), 'Copy texto {0}');
    assert.equal(th('A < B & C'), 'A &lt; B &amp; C');
  });
});

test('nomes bíblicos e nome completo da igreja nos quatro idiomas', async () => {
  const { ministryText } = await import('../src/i18n.js');
  const { homePage } = await import('../src/views/home.js');
  const { prayersPage } = await import('../src/views/prayers.js');
  for (const [code, name, church] of [
    ['pt', 'Elias', 'Igreja Salvação de Todas as Nações · Sol da Justiça'],
    ['en', 'Elijah', 'Salvation of All Nations Church · Sun of Righteousness'],
    ['fr', 'Élie', 'Église du Salut de Toutes les Nations · Soleil de Justice'],
    ['es', 'Elías', 'Iglesia Salvación de Todas las Naciones · Sol de Justicia']
  ]) inLanguage(code, () => {
    assert.equal(t('Elias'), name);
    assert.equal(t('Igreja Salvação de Todas as Nações · Sol da Justiça'), church);
    assert.equal(ministryText('Pregação do Profeta Elias'), `Pregação do ${t('Profeta Elias')}`);
    const html = homePage({ posts: [], meetings: [], latestVideos: {}, videosLoading: false });
    assert.ok(html.includes(church));
    assert.ok(html.includes(`<strong>${name}</strong>`));
    // main's prayer route, feed and author features remain; no old announcements tab.
    assert.match(html, /href="\/oracoes"/);
    assert.match(html, /class="home-feed"/);
    assert.match(navigation('prayers'), /href="\/oracoes" aria-current="page"/);
    assert.doesNotMatch(navigation('home'), /href="\/anuncios"/);
    const prayers = prayersPage({ prayers: [], prayerThemes: [] });
    assert.ok(prayers.includes(t('Orações do Profeta Elias.')));
    assert.ok(prayers.includes(t('Ainda não há orações')));
  });
});

test('a localização preserva os nomes dos membros e as opções de moderação de main', async () => {
  const { personPage } = await import('../src/views/person.js');
  const { postCard } = await import('../src/views/posts.js');
  inLanguage('es', () => {
    const author = { display_name: 'Elias Santos', verified: false };
    assert.match(personPage({ people: { member: author }, posts: [] }, 'member'), /Elias Santos/);
    const post = { id: 'post', authorId: 'member', author, title: 'Título original', body: 'Texto original', images: [], publishedAt: '2026-10-04', scope: 'Toda a ISTN', reactions: {}, commentCount: 0 };
    const html = postCard({ profile: { id: 'member' }, myReactions: {} }, post);
    assert.match(html, /Elias Santos/);
    assert.match(html, /href="\/pessoas\/member"/);
    assert.match(html, /Título original/);
    assert.match(html, /data-action="edit-post"/);
  });
});

test('deteção respeita a ordem do navegador e variantes regionais', async () => {
  const { detectLanguage } = await import('../src/i18n.js');
  assert.equal(detectLanguage(['nb-NO', 'fr-CA', 'en-US']), 'fr');
  assert.equal(detectLanguage(['es-MX', 'pt-BR']), 'es');
  assert.equal(detectLanguage(['PT_br']), 'pt');
  assert.equal(detectLanguage(['en-US']), 'en');
  assert.equal(detectLanguage(['nb-NO', 'de-DE']), 'pt');
});

test('escolha manual prevalece sobre perfil e deteção automática', async () => {
  const fresh = await import('../src/i18n.js?priority-test');
  fresh.useProfileLanguage('fr');
  assert.equal(fresh.language(), 'fr');
  fresh.setLanguage('es');
  fresh.useProfileLanguage('en');
  assert.equal(fresh.language(), 'es');
  fresh.useProfileLanguage(null);
  assert.equal(fresh.language(), 'es');
});

test('primeira visita usa idiomas do navegador sem guardar uma preferência manual', async () => {
  const names = ['navigator', 'document', 'localStorage'];
  const previous = Object.fromEntries(names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  try {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { languages: ['nb-NO', 'es-MX', 'en-US'] } });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { documentElement: {} } });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null, setItem: () => { throw new Error('must not save auto selection'); } } });
    const fresh = await import('../src/i18n.js?browser-first-visit');
    assert.equal(fresh.language(), 'es');
    assert.equal(fresh.hasLanguagePreference(), false);
    assert.equal(document.documentElement.lang, 'es-ES');
    fresh.useProfileLanguage('fr');
    assert.equal(fresh.language(), 'fr');
    fresh.useProfileLanguage(null);
    assert.equal(fresh.language(), 'es');
  } finally {
    for (const name of names) {
      if (previous[name]) Object.defineProperty(globalThis, name, previous[name]);
      else delete globalThis[name];
    }
  }
});
