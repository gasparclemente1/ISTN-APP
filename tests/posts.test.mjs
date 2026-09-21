import assert from 'node:assert/strict';
import { REACTIONS, reactionFor, authorName, canComment, canPublish, formatPostDate, isHighlighted, linksIn, normalizeCommunities, normalizePost, postShareText, publishScopeOf, reactionGroups, sortPosts, videosIn, visiblePosts } from '../src/posts.js';

const authors = new Map([['u1', { id: 'u1', display_name: 'Rufino Boaz', servo_role: 'bispo', verified: true }],
  ['u2', { id: 'u2', display_name: 'Membro Comum', servo_role: null, verified: false }]]);
const churches = [{ dbId: 'c1', name: 'Kifica' }];

test('um anúncio junta autor, imagens, reações e comentários', () => {
  const post = normalizePost({
    id: 'p1', author_id: 'u1', church_id: 'c1', title: 'Vigília', body: 'Sexta às 20:00',
    highlighted: true, published_at: '2026-09-17T10:00:00Z',
    post_images: [{ url: 'https://x/2.jpg', sort_order: 2 }, { url: 'https://x/1.jpg', sort_order: 1 }]
  }, {
    authors, churches,
    reactions: [{ post_id: 'p1', kind: 'amem' }, { post_id: 'p1', kind: 'amem' }, { post_id: 'p1', kind: 'gosto' }, { post_id: 'outro', kind: 'amem' }],
    comments: [{ post_id: 'p1' }, { post_id: 'outro' }]
  });
  assert.equal(post.scope, 'ISTN — Kifica');
  assert.deepEqual(post.images.map((image) => image.url), ['https://x/1.jpg', 'https://x/2.jpg']);
  assert.deepEqual(post.reactions, { amem: 2, gosto: 1 });
  assert.equal(post.reactionTotal, 3);
  assert.equal(post.commentCount, 1);
  assert.equal(post.author.display_name, 'Rufino Boaz');
  assert.equal(normalizePost({ id: 'p2', author_id: 'u2', body: 'x' }, { authors }).scope, 'Toda a ISTN');
});

test('a função precede o nome só de quem está verificado', () => {
  assert.equal(authorName(authors.get('u1')), 'Bp. Rufino Boaz');
  assert.equal(authorName(authors.get('u2')), 'Membro Comum');
  assert.equal(authorName({ display_name: 'X', servo_role: 'bispo', verified: false }), 'X');
  assert.equal(authorName(null), 'Sem nome');
});

test('um destaque com data deixa de o ser quando essa data passa', () => {
  const hoje = new Date('2026-09-17T12:00:00Z');
  assert.equal(isHighlighted({ highlighted: true }, hoje), true);
  assert.equal(isHighlighted({ highlighted: false, highlightUntil: '2026-12-31' }, hoje), false);
  assert.equal(isHighlighted({ highlighted: true, highlightUntil: '2026-09-17' }, hoje), true);
  assert.equal(isHighlighted({ highlighted: true, highlightUntil: '2026-09-16' }, hoje), false);
});

test('destacados primeiro, depois os mais recentes', () => {
  const hoje = new Date('2026-09-17T12:00:00Z');
  const posts = [
    { id: 'a', publishedAt: '2026-09-17T09:00:00Z', highlighted: false },
    { id: 'b', publishedAt: '2026-09-10T09:00:00Z', highlighted: true },
    { id: 'c', publishedAt: '2026-09-16T09:00:00Z', highlighted: false }
  ];
  assert.deepEqual(sortPosts(posts, hoje).map((post) => post.id), ['b', 'a', 'c']);
});

test('cada pessoa vê o que é para toda a ISTN e o da sua igreja', () => {
  const posts = [{ id: 'a', churchId: null }, { id: 'b', churchId: 'c1' }, { id: 'c', churchId: 'c2' }];
  assert.deepEqual(visiblePosts(posts, { churchDbId: 'c1' }).map((post) => post.id), ['a', 'b']);
  assert.deepEqual(visiblePosts(posts).map((post) => post.id), ['a']);
});

test('as comunidades da ISTN: ML, Acção Social, Grupo Jovem', () => {
  const rows = [
    { id: 'k1', slug: 'ml', name: 'Mulher no Lar', short_name: 'ML', description: 'Movimento das mulheres da igreja.' },
    { id: 'k2', slug: 'accao-social', name: 'Acção Social' },
    { id: 'sem-nome', slug: 'x' }
  ];
  const communities = normalizeCommunities(rows);
  assert.deepEqual(communities.map((community) => community.shortName), ['ML', 'Acção Social']);
  // Sem nome não é comunidade nenhuma; uma etiqueta sem palavra não etiqueta nada.
  assert.equal(communities.length, 2);
});

test('a etiqueta da comunidade acompanha o anúncio', () => {
  const communities = normalizeCommunities([{ id: 'k1', slug: 'ml', name: 'Mulher no Lar', short_name: 'ML' }]);
  const post = normalizePost({ id: 'p1', body: 'Encontro do ML', community_id: 'k1' }, { communities });
  assert.equal(post.communityId, 'k1');
  assert.equal(post.community.shortName, 'ML');
  // Uma comunidade que já não existe não inventa etiqueta, e o anúncio continua a ler-se.
  assert.equal(normalizePost({ id: 'p2', body: 'x', community_id: 'apagada' }, { communities }).community, null);
  assert.equal(normalizePost({ id: 'p3', body: 'x' }, { communities }).community, null);
});

test('filtrar o feed por comunidade não esconde o que é da igreja de cada um', () => {
  const posts = [
    { id: 'a', churchId: null, communityId: 'k1' },
    { id: 'b', churchId: 'c1', communityId: 'k1' },
    { id: 'c', churchId: 'c1', communityId: null },
    { id: 'd', churchId: 'c2', communityId: 'k1' }
  ];
  assert.deepEqual(visiblePosts(posts, { churchDbId: 'c1', community: 'k1' }).map((post) => post.id), ['a', 'b']);
  assert.deepEqual(visiblePosts(posts, { churchDbId: 'c1', community: '' }).map((post) => post.id), ['a', 'b', 'c']);
});

test('quem reagiu, junto por reação e o maior grupo à frente', () => {
  const people = [
    { user_id: 'u1', kind: 'gosto', display_name: 'Ana' },
    { user_id: 'u2', kind: 'curtir', display_name: 'Bento' },
    { user_id: 'u3', kind: 'gosto', display_name: 'Célia' },
    { user_id: 'u4', kind: 'amem', display_name: 'Dinis' },
    { user_id: 'u5', kind: 'inventada', display_name: 'Ninguém' }
  ];
  const groups = reactionGroups(people);
  assert.deepEqual(groups.map((group) => [group.reaction.kind, group.people.length]), [['gosto', 2], ['curtir', 1], ['amem', 1]]);
  assert.deepEqual(groups[0].people.map((person) => person.display_name), ['Ana', 'Célia']);
  assert.deepEqual(reactionGroups([]), []);
  assert.deepEqual(reactionGroups(), []);
});

test('quem pode publicar e quem pode comentar', () => {
  assert.equal(publishScopeOf(null), 'nenhum');
  assert.equal(publishScopeOf({ publish_scope: 'nenhum' }), 'nenhum');
  assert.equal(publishScopeOf({ publish_scope: 'igreja' }), 'igreja');
  // O Apóstolo publica para toda a ISTN sem precisar de autorização.
  assert.equal(publishScopeOf({ servo_claim_status: 'aprovado', servo_id: 's', servo: { role: 'apostolo' } }), 'global');
  // Um valor inventado não dá direitos.
  assert.equal(publishScopeOf({ publish_scope: 'tudo' }), 'nenhum');
  assert.equal(canPublish({ publish_scope: 'igreja' }), true);
  assert.equal(canPublish({ publish_scope: 'nenhum' }), false);

  assert.equal(canComment({ servo_claim_status: 'aprovado', servo_id: 's1' }), true);
  assert.equal(canComment({ servo_claim_status: 'pendente', servo_id: null }), false);
  assert.equal(canComment(null), false);
});

test('as datas leem-se como as pessoas falam', () => {
  const now = new Date('2026-09-17T12:00:00Z');
  assert.equal(formatPostDate('2026-09-17T11:59:40Z', now), 'agora');
  assert.equal(formatPostDate('2026-09-17T11:30:00Z', now), 'há 30 min');
  assert.equal(formatPostDate('2026-09-17T09:00:00Z', now), 'há 3 h');
  assert.equal(formatPostDate('2026-09-16T09:00:00Z', now), 'ontem');
  assert.equal(formatPostDate('2026-09-14T09:00:00Z', now), 'há 3 dias');
  assert.equal(formatPostDate('2026-08-01T09:00:00Z', now), '01/08/2026');
  assert.equal(formatPostDate('não é data', now), '');
});


test('as seis reações incluem os emojis pedidos e a opção especial', () => {
  assert.deepEqual(REACTIONS.filter((reaction) => !reaction.special).map((reaction) => reaction.emoji), ['👍', '❤️', '🙏🏾', '🎉', '😭']);
  assert.equal(REACTIONS.length, 6);
  assert.equal(new Set(REACTIONS.map((reaction) => reaction.kind)).size, 6);
  assert.equal(REACTIONS.find((reaction) => reaction.special).label, 'Elias é Deus');
});

test('reações antigas conservam o significado e entram nos totais com as novas', () => {
  assert.equal(reactionFor('amem').label, 'Amém');
  assert.equal(reactionFor('gosto').emoji, '❤️');
  assert.equal(reactionFor('desconhecida'), null);
  const reactions = ['amem', ...REACTIONS.map((reaction) => reaction.kind)]
    .map((kind) => ({ post_id: 'p1', kind }));
  const post = normalizePost({ id: 'p1' }, { reactions });
  assert.equal(post.reactionTotal, 7);
  assert.equal(post.reactions.elias_deus, 1);
  assert.equal(post.reactions.amem, 1);
});

test('vídeos num anúncio: os do YouTube, uma vez cada, no máximo três', () => {
  const body = 'Vejam https://youtu.be/SBntJhzgKDM. E de novo https://www.youtube.com/watch?v=SBntJhzgKDM&t=10, '
    + 'https://youtube.com/shorts/Qw3rty12345 (curto), https://youtu.be/Aaaaaa11111 https://youtu.be/Bbbbbb22222 e https://exemplo.ao/x';
  const videos = videosIn(body);
  assert.deepEqual(videos.map((video) => video.id), ['SBntJhzgKDM', 'Qw3rty12345', 'Aaaaaa11111']);
  assert.equal(videos[0].url, 'https://www.youtube.com/watch?v=SBntJhzgKDM');
  assert.equal(videos[0].thumbnail, 'https://i.ytimg.com/vi/SBntJhzgKDM/hqdefault.jpg');
  assert.deepEqual(videosIn('Sem vídeos aqui.'), []);
});

test('endereços num anúncio, sem a pontuação que fecha a frase', () => {
  assert.deepEqual(linksIn('Veja https://exemplo.ao/a?b=1&c=2, e (https://exemplo.ao/b).'), ['https://exemplo.ao/a?b=1&c=2', 'https://exemplo.ao/b']);
  assert.deepEqual(linksIn('nada'), []);
});

test('partilhar um anúncio envia o título e a primeira linha', () => {
  assert.equal(postShareText({ title: 'Vigília', body: '\n\nSexta às 20:00.\n\nMais.' }), 'Vigília\nSexta às 20:00.');
  assert.equal(postShareText({ title: 'Só título', body: '' }), 'Só título');
  assert.equal(postShareText({ title: '', body: 'Culto no sábado.' }), 'Culto no sábado.');
  assert.ok(postShareText({ title: '', body: 'x'.repeat(300) }).length <= 140);
});
