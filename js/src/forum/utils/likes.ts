import app from 'flarum/forum/app';

/**
 * Curtidas do primeiro post de uma discussão, como o card as mostra.
 *
 * As listas não pedem mais `include=firstPost` (o servidor renderizava o post
 * inteiro por card), então o caminho normal é o par de atributos que a
 * discussão traz da listagem (Api\DiscussionLikeFields). O post do store
 * continua tendo a palavra final quando está lá com o dado: ele é o que se
 * atualiza ao curtir (resposta do PATCH), na página da discussão e no refetch
 * do tempo real.
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
 * Toggle the "liked" state of a discussion's first post with optimistic UI.
 *
 * Centralizes the like/unlike flow shared by HomePage, AllDiscussionsPage,
 * AvocadoSearchPage, AvocadoDiscussionsSearchPage, TagPage and UserProfilePage.
 * Each page holds its own `likingIds` set to gate concurrent clicks per card,
 * and an optional `selfActionIds` set lets the realtime handler skip the pop
 * animation for likes the user just performed (avoids self-echo).
 */
export function toggleDiscussionLike(discussion: any, likingIds: Set<string>, selfActionIds?: Set<string>): void {
  const id = discussion.id?.();
  if (!id || likingIds.has(id)) return;

  let firstPost = discussion.firstPost?.();
  let stub = false;
  if (!firstPost) {
    // Lista sem o post no store (o caso normal agora): o linkage basta. Um
    // modelo vazio com o id recebe o PATCH, e a resposta dele (que traz
    // likesCount e likes) o completa — em vez de buscar o post antes do clique.
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
