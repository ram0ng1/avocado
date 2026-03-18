import Link from 'flarum/common/components/Link';
import humanTime from 'flarum/common/helpers/humanTime';

import tagIcon from 'ext:flarum/tags/common/helpers/tagIcon';
import tagLabel from 'ext:flarum/tags/common/helpers/tagLabel';
import sortTags from 'ext:flarum/tags/common/utils/sortTags';

// Returns true when the hex color is perceptually dark (YIQ < 128).
function colorIsDark(hex) {
  if (!hex || typeof hex !== 'string') return false;

  let c = hex.replace('#', '').trim();
  if (c.length === 3) {
    c = c.split('').map((ch) => ch + ch).join('');
  }

  if (!/^[0-9a-fA-F]{6}$/.test(c)) return false;

  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

export default class AvocadoTagsPage {
  // Called via override(): first arg is the original function, second is pinned tags array
  tagTileListView(_, pinned) {
    return <ul className="Avocado-TagTiles">{pinned.map(this.tagTileView.bind(this))}</ul>;
  }

  tagTileView(_, tag) {
    const lastPostedDiscussion = tag.lastPostedDiscussion();
    const children = sortTags(tag.children() || []);
    const tagIconNode = tagIcon(tag, {}, { useColor: false });

    if (tagIconNode?.attrs?.style?.backgroundColor) {
      delete tagIconNode.attrs.style.backgroundColor;
    }

    const colorClass = tag.color()
      ? (colorIsDark(tag.color()) ? 'colored colored--dark-bg' : 'colored colored--light-bg')
      : '';

    return (
      <li className={'Avocado-TagTile ' + colorClass} style={{ '--tag-bg': tag.color() }}>
        <Link className="Avocado-TagTile-info" href={app.route.tag(tag)}>
          <div className="Avocado-TagTile-icon">{tagIconNode}</div>
          <div className="Avocado-TagTile-content">
            <h3 className="Avocado-TagTile-name">{tag.name()}</h3>
            <p className="Avocado-TagTile-description">{tag.description()}</p>
            {children && children.length ? (
              <div className="Avocado-TagTile-children">
                {children.map((child) => [
                  <Link key={`tag-child-${child.id()}`} href={app.route.tag(child)} className="TagLabel">{child.name()}</Link>,
                  ' ',
                ])}
              </div>
            ) : (
              ''
            )}
            {lastPostedDiscussion ? (
              <Link
                className="Avocado-TagTile-lastPostedDiscussion"
                href={app.route.discussion(lastPostedDiscussion, lastPostedDiscussion.lastPostNumber())}
              >
                <span className="Avocado-TagTile-lastPostedDiscussion-title">{lastPostedDiscussion.title()}</span>
                {humanTime(lastPostedDiscussion.lastPostedAt())}
              </Link>
            ) : (
              <span className="Avocado-TagTile-lastPostedDiscussion" />
            )}
          </div>
        </Link>
      </li>
    );
  }

  // Called via override(): first arg is original function, second is cloud tags array
  cloudView(_, cloud) {
    return <div className="Avocado-TagCloud">{cloud.map((tag) => [tagLabel(tag, { link: true, key: `tag-cloud-${tag.id()}` }), ' '])}</div>;
  }
}
