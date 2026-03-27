import app from 'flarum/forum/app';

export default function forumSetting(key: string, fallback: string): string {
  const value = app.forum.attribute<string>(`avocado.${key}`);

  if (typeof value === 'undefined' || value === null) {
    return fallback;
  }

  return value;
}
