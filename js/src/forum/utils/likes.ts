import app from 'flarum/forum/app';

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
  const firstPost = discussion.firstPost?.();
  if (!firstPost) return;

  const id = discussion.id?.();
  if (!id || likingIds.has(id)) return;

  const likes = firstPost.likes?.() || [];
  const isLiked = !!(app.session.user && likes.some((u: any) => u === app.session.user));

  likingIds.add(id);
  selfActionIds?.add(id);
  m.redraw();

  firstPost
    .save({ isLiked: !isLiked })
    .then(() => {
      likingIds.delete(id);
      m.redraw();
    })
    .catch(() => {
      likingIds.delete(id);
      selfActionIds?.delete(id);
      m.redraw();
    });
}
