'use strict';

/**
 * ESLint rule: i18n/no-hardcoded-text
 *
 * Catches user-facing strings written as literals instead of going through the
 * translator (`app.translator.trans('avocado.…')` + locale/*.yml). At
 * code-generation time it's easy to leave a label hardcoded in one language;
 * this rule fails the build so it never ships untranslated.
 *
 * Flags:
 *  1. JSXText nodes that contain a letter — e.g.  <button>Salvar</button>
 *  2. A curated set of human-facing string ATTRIBUTES with a literal value:
 *       aria-label, title, alt, label
 *     e.g.  <button aria-label="Voltar">
 *
 * `placeholder` is intentionally NOT in the set: its value is often a format
 * example (`center top`, `fas fa-times`, an SVG snippet) rather than prose, and
 * the genuinely user-facing placeholders already go through trans() by
 * convention. Flagging it produced mostly false positives.
 *
 * Does NOT flag (so false positives stay low):
 *  - Whitespace / punctuation / number-only text (no letter).
 *  - Dynamic attributes: aria-label={app.translator.trans(...)} (not a Literal).
 *  - Any attribute outside the curated set (className, key, href, type, role…).
 *
 * Escape hatch for legitimate non-text literals (CSS value / icon-class example
 * placeholders, single glyphs): an `eslint-disable-next-line
 * i18n/no-hardcoded-text` comment on the line, exactly like any other rule.
 */

// Attributes whose string value is shown to (or read to) the user.
const TEXT_ATTRS = new Set(['aria-label', 'title', 'alt', 'label']);

const HAS_LETTER = /\p{L}/u;

/** Resolve a JSX attribute name to its string form ('aria-label', 'title', …). */
function attrName(attr) {
  const n = attr.name;
  if (!n) return null;
  if (n.type === 'JSXIdentifier') return n.name;
  // Namespaced attrs (rare): <x foo:bar="…"> → 'foo:bar'
  if (n.type === 'JSXNamespacedName') return `${n.namespace.name}:${n.name.name}`;
  return null;
}

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow hardcoded user-facing strings in JSX — route them through app.translator.trans() + locale files so the theme stays translatable.',
    },
    messages: {
      hardcodedText:
        'Hardcoded UI text "{{ text }}". Use app.translator.trans(\'avocado.…\') with a key in locale/*.yml instead of a literal.',
      hardcodedAttr:
        'Hardcoded "{{ attr }}" text "{{ text }}". Pass app.translator.trans(\'avocado.…\') instead of a string literal (or eslint-disable the line if it is a format example, not prose).',
    },
  },

  create(context) {
    return {
      JSXText(node) {
        const text = node.value.trim();
        if (text.length < 2 || !HAS_LETTER.test(text)) return;

        context.report({
          node,
          messageId: 'hardcodedText',
          data: { text: text.length > 40 ? text.slice(0, 40) + '…' : text },
        });
      },

      JSXAttribute(node) {
        const name = attrName(node);
        if (name === null || !TEXT_ATTRS.has(name)) return;

        // Only literal string values are hardcoded; {expr} is dynamic.
        const value = node.value;
        if (!value || value.type !== 'Literal' || typeof value.value !== 'string') return;

        const text = value.value.trim();
        if (text.length < 2 || !HAS_LETTER.test(text)) return;

        context.report({
          node: value,
          messageId: 'hardcodedAttr',
          data: { attr: name, text: text.length > 40 ? text.slice(0, 40) + '…' : text },
        });
      },
    };
  },
};
