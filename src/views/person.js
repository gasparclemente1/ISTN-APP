// A pessoa por trás de um nome: o que é na ISTN, e o que publicou.
//
// Não é um perfil de rede social. O que aqui aparece já era público em todo o
// lado onde este nome aparece — o nome, a fotografia, a função e o selo, e a
// igreja apenas de quem tem o selo, porque a igreja de um servo já está no
// diretório ao lado do nome dele. A conta em si continua fechada: nem telefone,
// nem email, nem cidade, nem a igreja de um membro.
//
// Existe por uma razão simples: os nomes já se viam — em cima de um anúncio,
// debaixo de um comentário, na lista de quem reagiu — e não levavam a lado
// nenhum. E porque ver o que alguém escreveu antes é a melhor defesa que a
// congregação tem contra quem se faça passar por um bispo.
import { escapeHtml, safeUrl } from '../html.js';
import { icon } from '../icons.js';
import { authorName, sortPosts, visiblePosts } from '../posts.js';
import { roleLabel, verifiedSeal } from '../roles.js';
import { emptyState, errorState, loadingState, page, sectionHeading } from './shared.js';
import { postCard } from './posts.js';

function identity(person) {
  const name = authorName(person);
  const photo = safeUrl(person.photo_url);
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const role = person.verified ? roleLabel(person.servo_role) : '';
  return `<section class="person-card">
    <span class="person-avatar">${photo
      ? `<img src="${escapeHtml(photo)}" alt="" />`
      : `<span>${escapeHtml(initials || '·')}</span>`}</span>
    <h1>${escapeHtml(name)}${person.verified ? verifiedSeal(person.servo_role, { title: `Conta verificada · ${role}` }) : ''}</h1>
    <p class="person-role">${person.verified ? escapeHtml(role) : 'Membro da ISTN-SJ'}</p>
    ${person.church_name
      ? `<p class="person-church">${icon('church', { size: 16 })}${person.church_id
        ? `<a href="/igrejas/${escapeHtml(person.church_id)}">${escapeHtml(person.church_name)}</a>`
        : escapeHtml(person.church_name)}</p>`
      : ''}
  </section>`;
}

export function personPage(state, id) {
  const back = { title: 'Pessoa', back: 'home' };
  const person = state.people?.[id];
  if (person === null) {
    return page('person', { ...back, body: emptyState({ title: 'Pessoa não encontrada', text: 'Esta conta pode ter sido removida, ou ainda não deixou nada na aplicação.', action: '<a class="button button-dark" href="/">Voltar ao início</a>' }) });
  }
  if (!person) return page('person', { ...back, body: loadingState('A carregar…') });

  let published;
  if (state.postsError) published = errorState('Não foi possível carregar os anúncios.', 'retry-posts');
  else if (!state.posts) published = loadingState('A carregar os anúncios…');
  else {
    // Only what this reader may see anyway: the whole ISTN's, plus their own
    // church's. A page never shows more than the feed would.
    const mine = sortPosts(visiblePosts(state.posts, { churchDbId: state.myChurchDbId }).filter((post) => post.authorId === id));
    published = mine.length
      ? `<div class="post-list">${mine.map((post) => postCard(state, post)).join('')}</div>`
      : `<p class="hint">Ainda não publicou nenhum anúncio.</p>`;
  }

  const count = state.posts ? visiblePosts(state.posts, { churchDbId: state.myChurchDbId }).filter((post) => post.authorId === id).length : 0;
  const body = `${identity(person)}
    <section class="content-section">
      ${sectionHeading('Publicou', count === 1 ? '1 anúncio' : `${count} anúncios`)}
      ${published}
    </section>`;
  return page('person', { ...back, body });
}
