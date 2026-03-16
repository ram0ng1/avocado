import Link from 'flarum/common/components/Link';
import humanTime from 'flarum/common/helpers/humanTime';

import tagIcon from 'ext:flarum/tags/common/helpers/tagIcon';
import tagLabel from 'ext:flarum/tags/common/helpers/tagLabel';
import sortTags from 'ext:flarum/tags/common/utils/sortTags';

export default class AvocadoTagsPage {
  // Called via override(): first arg is the original function, second is pinned tags array
  tagTileListView(_, pinned) {
    return <ul className="Avocado-TagTiles">{pinned.map(this.tagTileView.bind(this))}</ul>;
  }

  tagTileView(_, tag) {
    const lastPostedDiscussion = tag.lastPostedDiscussion();
    const children = sortTags(tag.children() || []);
    const tagIconNode = tagIcon(tag, {}, { useColor: false });

    if (tagIconNode.attrs && tagIconNode.attrs.style && tagIconNode.attrs.style.backgroundColor) {
      delete tagIconNode.attrs.style.backgroundColor;
    }

    return (
      <li className={'Avocado-TagTile ' + (tag.color() ? 'colored' : '')} style={{ '--tag-bg': tag.color() }}>
        <Link className="Avocado-TagTile-info" href={app.route.tag(tag)}>
          <div className="Avocado-TagTile-icon">{tagIconNode}</div>
          <div className="Avocado-TagTile-content">
            <h3 className="Avocado-TagTile-name">{tag.name()}</h3>
            <p className="Avocado-TagTile-description">{tag.description()}</p>
            {children && children.length ? (
              <div className="Avocado-TagTile-children">
                {children.map((child) => [
                  <Link href={app.route.tag(child)} className="TagLabel">{child.name()}</Link>,
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
    return <div className="Avocado-TagCloud">{cloud.map((tag) => [tagLabel(tag, { link: true }), ' '])}</div>;
  }
}
