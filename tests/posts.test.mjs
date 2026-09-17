import assert from 'node:assert/strict';
import { authorName, canComment, canPublish, formatPostDate, isHighlighted, normalizePost, publishScopeOf, sortPosts, visiblePosts } from '../src/posts.js';

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
