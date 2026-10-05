import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BOOKS, bookOf, portugueseQuery, referenceLabel } from '../src/bible.js';
import { filterTeachings } from '../src/library.js';
import { messages } from '../src/locales/messages.js';
import { setLanguage, t } from '../src/i18n.js';
import { PROPHECY } from '../src/views/churches.js';

const inLanguage = (code, fn) => {
  setLanguage(code, { remember: false });
  try { return fn(); } finally { setLanguage('pt', { remember: false }); }
};
const library = (() => { const data = JSON.parse(readFileSync(new URL('../data/youtube-teachings.json', import.meta.url), 'utf8')); return data.teachings || data; })();
const base = { category: 'Todas', year: '', book: '', sort: 'recent', savedOnly: false };
const ids = (query) => filterTeachings(library, { ...base, query }).map((item) => item.id).join(',');

test('cada livro é reconhecido pelo nome em qualquer das quatro línguas, e sempre como o mesmo livro', () => {
  for (const book of BOOKS) {
    for (const lang of ['en', 'fr', 'es']) {
      const spelled = messages[book][lang];
      assert.equal(bookOf(`${spelled} 3:16`)?.name, book, `${lang}: ${spelled}`);
    }
  }
});

test('a pesquisa que a própria interface sugere funciona: «Juan 3», «John 3» e «Jean 3» dão o que «João 3» dá', () => {
  const portuguese = ids('João 3');
  assert.ok(portuguese.length > 0, 'a biblioteca tem mensagens em João 3');
  for (const query of ['Juan 3', 'John 3', 'Jean 3', 'juan 3', 'JOHN 3']) assert.equal(ids(query), portuguese, query);
  assert.equal(ids('Romans'), ids('Romanos'));
  assert.equal(ids('Isaiah'), ids('Isaías'));
  assert.equal(ids('Galatians'), ids('Gálatas'));
});

test('uma pesquisa que não é um livro continua igual', () => {
  assert.equal(portugueseQuery('fé e obras'), 'fé e obras');
  assert.equal(ids('avivamento'), filterTeachings(library, { ...base, query: 'avivamento' }).map((item) => item.id).join(','));
});

test('a referência aparece na língua da pessoa, e em português fica como foi escrita', () => {
  assert.equal(referenceLabel('João 5:1-15'), 'João 5:1-15');
  assert.equal(inLanguage('en', () => referenceLabel('João 5:1-15')), 'John 5:1-15');
  assert.equal(inLanguage('fr', () => referenceLabel('João 5:1-15')), 'Jean 5:1-15');
  assert.equal(inLanguage('es', () => referenceLabel('João 5:1-15')), 'Juan 5:1-15');
  assert.equal(inLanguage('en', () => referenceLabel('1Timóteo 6:12')), '1 Timothy 6:12');
  assert.equal(inLanguage('fr', () => referenceLabel('1 Coríntios 1:21')), '1 Corinthiens 1:21');
  assert.equal(inLanguage('es', () => referenceLabel('Tiago 2:14')), 'Santiago 2:14');
  assert.equal(inLanguage('en', () => referenceLabel('Daniel')), 'Daniel');
  assert.equal(inLanguage('en', () => referenceLabel('Filémon 1:6')), 'Philemon 1:6');
  assert.equal(inLanguage('es', () => referenceLabel('Job 1:21')), 'Job 1:21');
  assert.equal(inLanguage('en', () => referenceLabel('Tema livre')), 'Tema livre');
  assert.equal(referenceLabel(''), '');
});

test('a citação do Profeta, as frases do Perfil e as mensagens do servidor têm tradução', () => {
  for (const source of [PROPHECY,
    'O seu contacto está oculto: só a equipa ISTN-SJ o vê. A escolha é sua, e pode mudá-la quando quiser.',
    'Autorizou a ISTN-SJ a mostrar o seu número. Por agora a aplicação só mostra o contacto de quem serve na igreja: até lá, o seu continua a ser visto apenas pela equipa.',
    'Esta reunião já não está disponível.',
    'A participação dentro da App ainda não está ativa nesta reunião. Pode entrar pelo Zoom.',
    'Pedido inválido.', 'Não foi possível abrir a reunião. Tente novamente.',
    'Não tem permissão para acrescentar orações.', 'Não tem permissão para alterar esta oração.',
    'Escolha um áudio MP3, M4A, AAC, OGG ou WAV.']) {
    for (const lang of ['en', 'fr', 'es']) assert.notEqual(inLanguage(lang, () => t(source)), source, `${lang}: ${source.slice(0, 50)}`);
  }
});

test('«servo» é Serviteur, Servant e Siervo, sempre, e nunca «membro»', () => {
  const servo = Object.entries(messages).filter(([source]) => /\bservos?\b/i.test(source));
  assert.ok(servo.length >= 5);
  for (const [source, value] of servo) {
    assert.match(value.en, /servant/i, source);
    assert.match(value.fr, /serviteur/i, source);
    assert.match(value.es, /siervo/i, source);
    assert.doesNotMatch(value.en, /ministry member/i, source);
  }
});

test('o Profeta Elias traduz-se em cada língua', () => {
  assert.deepEqual(['en', 'fr', 'es'].map((lang) => messages['Profeta Elias'][lang]), ['Prophet Elijah', 'Prophète Élie', 'Profeta Elías']);
  assert.equal(inLanguage('en', () => t('Elias é Deus')), 'Elijah is God');
});

test('os países do mapa e das listas são traduzidos pelo código, não só os que alguém listou à mão', async () => {
  const { countryLabel, countryName, ISTN_COUNTRIES } = await import('../src/countries.js');
  const said = (lang, name) => inLanguage(lang, () => countryLabel(name));
  assert.equal(said('fr', 'Reino Unido'), 'Royaume-Uni');
  assert.equal(said('fr', 'Estados Unidos'), 'États-Unis');
  assert.equal(said('fr', 'República Democrática do Congo'), 'République démocratique du Congo');
  assert.equal(said('en', 'Reino Unido'), 'United Kingdom');
  assert.equal(said('en', 'Estados Unidos'), 'United States');
  assert.equal(said('en', 'República Democrática do Congo'), 'Democratic Republic of the Congo');
  assert.equal(said('es', 'República Democrática do Congo'), 'República Democrática del Congo');
  assert.equal(said('es', 'Estados Unidos'), 'Estados Unidos');
  // The catalogue's own choices still win, and Portuguese is left as written.
  assert.equal(said('en', 'Estados Unidos da América'), 'United States of America');
  assert.equal(countryLabel('Reino Unido'), 'Reino Unido');
  // Anything that is not a country is said as before, or left alone.
  assert.equal(said('fr', 'Igrejas online'), 'Églises en ligne');
  assert.equal(said('fr', 'Lugar que não existe'), 'Lugar que não existe');
  // Every country the ISTN is in reads in the reader's language.
  for (const lang of ['en', 'fr', 'es']) for (const code of ISTN_COUNTRIES) {
    const portuguese = countryName(code, 'pt-PT');
    const expected = inLanguage(lang, () => countryName(code));
    assert.equal(said(lang, portuguese), expected, `${lang}: ${portuguese}`);
  }
});

test('os temas das orações traduzem-se, e a pesquisa encontra-os pelo nome traduzido', async () => {
  const { filterPrayers } = await import('../src/prayers.js');
  const themes = { 'Finanças e portas abertas': ['Finances and open doors', 'Finances et portes ouvertes', 'Finanzas y puertas abiertas'],
    'Libertação Geral': ['General deliverance', 'Délivrance générale', 'Liberación general'],
    'Câncer & Coma': ['Cancer & Coma', 'Cancer & coma', 'Cáncer y coma'], 'Doenças': ['Illnesses', 'Maladies', 'Enfermedades'],
    'Oração geral': ['General prayer', 'Prière générale', 'Oración general'], 'Outros': ['Other', 'Autres', 'Otros'] };
  for (const [source, [en, fr, es]] of Object.entries(themes)) {
    assert.equal(inLanguage('en', () => t(source)), en);
    assert.equal(inLanguage('fr', () => t(source)), fr);
    assert.equal(inLanguage('es', () => t(source)), es);
  }
  const prayers = [{ id: 'a', title: 'Oração contra o câncer', description: 'Para quem tem algum câncer/cancro', themeId: 'x', theme: { name: 'Câncer & Coma' } }];
  assert.equal(inLanguage('fr', () => filterPrayers(prayers, { query: 'maladies' })).length, 0);
  assert.equal(inLanguage('fr', () => filterPrayers(prayers, { query: 'cancer' })).length, 1);
  assert.equal(inLanguage('es', () => filterPrayers(prayers, { query: 'cáncer y coma' })).length, 1);
});
