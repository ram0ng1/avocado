import app from 'flarum/forum/app';

/**
 * Curtidas do primeiro post de uma discussão, como o card mostra. As listas não
 * pedem `include=firstPost` (o servidor renderizaria o post inteiro por card),
 * então o normal são os atributos da discussão (Api\DiscussionLikeFields). O
 * post do store tem a palavra final quando está lá: é ele que se atualiza ao
 * curtir, na página da discussão e no refetch do realtime.
 */
export function firstPostLikes(discussion: any): { count: number; liked: boolean } {
  const post = discussion?.firstPost?.();
  const attrCount = discussion?.attribute?.('avocadoFirstPostLikesCount');
  const attrLiked = !!discussion?.attribute?.('avocadoFirstPostLiked');

  const postCount = post?.attribute?.('likesCount');
  const count = typeof postCount === 'number' ? postCount : typeof attrCount === 'number' ? attrCount : 0;

  // `likes` só vale quando a relação veio no payload do post (Show, PATCH); um
  // post vindo de um include de listagem chega sem ela e não diz nada.
  const user = app.session.user;
  const liked = !user ? false : post?.data?.relationships?.likes ? ((post.likes?.() || []) as any[]).some((u: any) => u === user) : attrLiked;

  return { count, liked };
}

/**
 * Alterna o like do primeiro post com UI otimista. Cada página tem seu
 * `likingIds` para travar cliques simultâneos por card; `selfActionIds` deixa o
 * realtime pular a animação do like que o próprio usuário fez.
 */
export function toggleDiscussionLike(discussion: any, likingIds: Set<string>, selfActionIds?: Set<string>): void {
  const id = discussion.id?.();
  if (!id || likingIds.has(id)) return;

  let firstPost = discussion.firstPost?.();
  let stub = false;
  if (!firstPost) {
    // Lista sem o post no store (o caso normal): o linkage basta. Um model vazio
    // com o id recebe o PATCH, e a resposta (com likesCount e likes) o completa.
    const postId = discussion.data?.relationships?.firstPost?.data?.id;
    if (!postId) return;
    firstPost = app.store.pushObject({ type: 'posts', id: String(postId), attributes: {} } as any);
    if (!firstPost) return;
    stub = true;
  }

  const { liked } = firstPostLikes(discussion);

  likingIds.add(id);
  selfActionIds?.add(id);
  m.redraw();

  firstPost
    .save({ isLiked: !liked })
    .then(() => {
      likingIds.delete(id);
      m.redraw();
    })
    .catch(() => {
      // O modelo vazio não fica no store se o PATCH falhou: o card volta a ler
      // os atributos da discussão.
      if (stub && typeof firstPost.attribute('likesCount') !== 'number') app.store.remove(firstPost);
      likingIds.delete(id);
      selfActionIds?.delete(id);
      m.redraw();
    });
}
