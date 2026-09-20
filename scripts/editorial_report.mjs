// Writes data/revisao-editorial.md: what in the source data a person should
// check with the churches before marking records as verified.
//
//   npm run report:editorial
//
// It lists and never changes anything — the data rule in the README is that
// records are corrected by the team, not silently by code.
import { readFileSync, writeFileSync } from 'node:fs';
import { bookOf } from '../src/bible.js';
import { normalizeChurch, rowsFromDirectoryFile, serviceLabel, sharedPhones, sortChurches } from '../src/directory.js';
import { collator, foldText } from '../src/text.js';

const read = (name) => JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url)));
const churches = sortChurches(rowsFromDirectoryFile(read('igrejas.json')).map((row) => normalizeChurch(row)));
const teachings = read('youtube-teachings.json');

const label = (church) => `ISTN — ${church.name}${church.region ? ` (${church.region}, ${church.country})` : ` (${church.country})`} \`${church.id}\``;
const lines = [];
const section = (title, intro, items) => {
  lines.push(`## ${title}`, '', intro, '');
  if (!items.length) lines.push('_Nada a assinalar._', '');
  else lines.push(...items, '');
};

// ------------------------------------------------------------------ igrejas --

const shared = [...sharedPhones(churches)].sort(([, a], [, b]) => b.length - a.length);
section('Mesmo número em vários registos',
  'Muitas vezes é o mesmo responsável anunciado para vários lugares; às vezes é um erro de cópia. Confirme com o responsável antes de verificar.',
  shared.map(([, list]) => `- **${list[0].leaderPhone}** — ${list.map((church) => `${label(church)} · ${church.leaderName || 'sem nome'}`).join('; ')}`));

const byCountryPrefix = { Angola: '244', Brasil: '55', Portugal: '351', Moçambique: '258', 'São Tomé e Príncipe': '239', Alemanha: '49', França: '33', Inglaterra: '44', 'Reino Unido': '44', Noruega: '47', Polónia: '48' };
section('Indicativo diferente do país do registo',
  'Pode estar certo (um responsável em Angola que acompanha uma comunidade noutro país), mas convém confirmar. O caso dos Estados Unidos já vinha assinalado: a mensagem original usava a bandeira da Libéria.',
  churches.filter((church) => {
    const digits = String(church.leaderPhone || '').replace(/\D/g, '');
    const expected = byCountryPrefix[church.country];
    return digits && (expected ? !digits.startsWith(expected) : church.modality === 'online');
  }).map((church) => `- ${label(church)} — ${church.leaderPhone}${church.note ? ` · nota: ${church.note}` : ''}`));

section('Horário incompleto',
  'Registos sem dia ou sem hora de culto.',
  churches.filter((church) => church.modality === 'physical' && (!church.services.length || church.services.some((service) => !service.time)))
    .map((church) => `- ${label(church)} — ${church.services.length ? church.services.map(serviceLabel).join('; ') : 'sem horário'}`));

const byPlace = new Map();
churches.filter((church) => church.modality === 'physical').forEach((church) => {
  const key = `${church.country}|${foldText(church.locality).replace(/[^a-z0-9]/g, '')}`;
  byPlace.set(key, [...(byPlace.get(key) || []), church]);
});
section('Localidades repetidas no mesmo país',
  'A importação juntou os horários de cada lugar num só registo (ver data/importacao-igrejas.md). O que aparecer aqui tem o mesmo nome e responsáveis diferentes: confirme se são dois lugares.',
  [...byPlace.values()].filter((list) => list.length > 1)
    .map((list) => `- ${list.map((church) => `${label(church)} · ${church.services.map(serviceLabel).join('; ') || 'sem horário'}`).join(' / ')}`));

section('Endereços a rever',
  'O endereço aparece tal como está na lista da equipa. Estas parecem ter um erro de digitação: confirme com o responsável e corrija no painel.',
  churches.filter((church) => church.address && church.countryCode === 'PT' && /\b\d{4}-\d{1,2}\b/.test(church.address))
    .map((church) => `- ${label(church)} — «${church.address}»: o código postal português tem sete algarismos (0000-000).`));

section('Sem endereço',
  'A lista não indica endereço: a página diz «Endereço a confirmar com o responsável».',
  churches.filter((church) => church.modality === 'physical' && !church.address).map((church) => `- ${label(church)}`));

// Places: the same name once accents, spacing and a silent "h" are ignored
// ("Baia" and "Bahia"), across localities and regions of one country.
const loose = (value) => foldText(value).replace(/[^a-z]/g, '').replace(/h/g, '');
const placeNames = new Map();
churches.forEach((church) => [church.locality, church.region].filter(Boolean).forEach((name) => {
  const key = `${church.country}|${loose(name)}`;
  placeNames.set(key, new Set([...(placeNames.get(key) || []), name]));
}));
// People: the names given for one phone number, once the rank abbreviation
// is set aside — "Bp. Rui Vaz" and "Bispo Rui Vaz" are the same writing, but
// "Marcelo Cassengue" and "Marcelo Cassange" are not.
const RANK = /^(ap|apostolo|bp|bispo|pr|p\.r|pastor|aux|auxiliar|disc|discipulo|obr|obreiro|dona)\.?\s+/i;
const bareName = (name) => { let value = name.trim(); while (RANK.test(foldText(value))) value = value.replace(/^\S+\s+/, ''); return value; };
const nameGroups = [...sharedPhones(churches).values()]
  .map((list) => new Set(list.map((church) => church.leaderName).filter(Boolean)))
  .filter((names) => new Set([...names].map((name) => foldText(bareName(name)))).size > 1);
section('Grafias diferentes do mesmo nome',
  'Lugares escritos de mais do que uma forma («Baia» e «Bahia»), e o mesmo número com nomes de responsável diferentes. O filtro por região trata variantes como regiões distintas até serem uniformizadas.',
  [
    ...[...placeNames.values()].filter((set) => set.size > 1).map((set) => `- Lugar: ${[...set].sort(collator.compare).map((value) => `«${value}»`).join(' / ')}`),
    ...nameGroups.map((set) => `- Responsável: ${[...set].sort(collator.compare).map((value) => `«${value}»`).join(' / ')}`)
  ]);

// ----------------------------------------------------------------- acervo ---

const withoutReference = teachings.filter((teaching) => !teaching.biblicalReference);
section('Pregações sem referência bíblica',
  `${withoutReference.length} de ${teachings.length} pregações não têm referência. Aparecem no acervo, mas não no filtro por livro.`,
  withoutReference.slice(0, 200).map((teaching) => `- ${teaching.publishedAt} · ${teaching.service || 'sem tipo'} · ${teaching.title} \`${teaching.id}\``));

const spellings = new Map();
teachings.forEach((teaching) => {
  const match = String(teaching.biblicalReference || '').trim().match(/^((?:[1-3]\s*)?[^\d:]+)/);
  const book = bookOf(teaching.biblicalReference);
  if (!match || !book) return;
  const written = match[1].trim();
  if (written === book.name) return;
  spellings.set(written, { book: book.name, count: (spellings.get(written)?.count || 0) + 1 });
});
section('Livros escritos de outra forma',
  'A aplicação agrupa-os corretamente no filtro, mas mostra a referência como foi escrita. Uniformizar na folha de origem evita a diferença.',
  [...spellings].sort(([a], [b]) => collator.compare(a, b)).map(([written, { book, count }]) => `- «${written}» → ${book} (${count})`));

const unknownBooks = teachings.filter((teaching) => teaching.biblicalReference && !bookOf(teaching.biblicalReference));
section('Referências que não correspondem a nenhum livro',
  'Não entram no filtro por livro.',
  unknownBooks.map((teaching) => `- «${teaching.biblicalReference}» — ${teaching.title} \`${teaching.id}\``));

const byVideo = new Map();
teachings.forEach((teaching) => {
  const key = String(teaching.url).split('&')[0];
  byVideo.set(key, [...(byVideo.get(key) || []), teaching]);
});
section('O mesmo vídeo com várias mensagens',
  'Não são duplicados: são mensagens diferentes dentro da mesma gravação longa. A aplicação abre cada uma no minuto em que começa, quando esse minuto está registado.',
  [...byVideo.values()].filter((list) => list.length > 1)
    .map((list) => `- ${list.map((teaching) => `${teaching.title} (${teaching.startsAt ? `a partir de ${teaching.startsAt}` : 'sem minuto de início'})`).join(' / ')}`));

const header = [
  '# Revisão editorial dos dados de origem',
  '',
  'Gerado por `npm run report:editorial` a partir dos ficheiros em `data/`. Não altera nenhum registo: serve para a equipa confirmar com as igrejas e corrigir no painel.',
  '',
  `${churches.length} registos do diretório · ${teachings.length} pregações.`,
  ''
];
writeFileSync(new URL('../data/revisao-editorial.md', import.meta.url), `${[...header, ...lines].join('\n').trimEnd()}\n`);
console.log('data/revisao-editorial.md atualizado.');
