'use strict';

/**
 * ESLint rule: mithril-key/consistent-child-keys
 *
 * Detects the two patterns that cause Mithril reconciliation crashes:
 *
 * ── Pattern A ─────────────────────────────────────────────────────────────────
 * Direct JSX children where SOME have `key` and some don't.
 *
 *   <div>
 *     <Nav />            ← no key  ← ERROR
 *     <Main key="m" />   ← has key
 *   </div>
 *
 * ── Pattern B ─────────────────────────────────────────────────────────────────
 * A ternary / conditional where ONE branch carries a `key` but a SIBLING element
 * in the same parent does not.
 *
 * ── Pattern C ─────────────────────────────────────────────────────────────────
 * A JSXExpressionContainer wrapping an iterator (.map/.flatMap/.filter) as a
 * sibling of a JSXElement WITH a `key` prop.
 *
 * Mithril's normalizeChildren checks the RAW children array BEFORE flattening.
 * An array returned by .map() has no `.key` property → treated as "unkeyed".
 * A sibling JSXElement with key → inconsistent → crash.
 *
 *   <div>
 *     {items.map(i => <a key={i.id}>...</a>)}   ← array: no outer key ← ERROR
 *     <a key="--all">All</a>                     ← has key
 *   </div>
 *
 * Fix: combine into a single spread array so Mithril receives ONE argument:
 *   <div>
 *     {[
 *       ...items.map(i => <a key={i.id}>...</a>),
 *       <a key="--all">All</a>,
 *     ]}
 *   </div>
 */

// ── helpers ──────────────────────────────────────────────────────────────────

/** Returns true when a JSXOpeningElement has a `key` prop */
function hasKeyProp(jsxElement) {
  return jsxElement.openingElement.attributes.some(
    (attr) => attr.type === 'JSXAttribute' && attr.name && attr.name.name === 'key'
  );
}

/**
 * Returns true when an expression is an iterator call (.map / .flatMap / .filter).
 * We only check the most common patterns — enough to catch practical bugs.
 */
function isIteratorCall(expr) {
  if (!expr) return false;
  // expr.type === 'CallExpression' with callee as MemberExpression
  if (expr.type !== 'CallExpression') return false;
  const callee = expr.callee;
  if (!callee || callee.type !== 'MemberExpression') return false;
  const prop = callee.property;
  if (!prop) return false;
  const name = prop.name || (prop.type === 'Identifier' ? prop.name : null);
  return name === 'map' || name === 'flatMap' || name === 'filter';
}

/**
 * Given a single AST child node of a JSX parent, yield descriptor objects:
 *   { node, hasKey, isArray }
 *
 * `isArray` = true means this slot is a JS array (from an iterator), which
 * Mithril treats as "unkeyed" at the outer normalizeChildren level regardless
 * of whether its items have keys.
 *
 * We cover:
 *   - Bare JSXElement                  <Foo />
 *   - Logical &&                       {x && <Foo key="k" />}
 *   - Ternary                          {x ? <A key="a" /> : <B key="b" />}
 *   - Iterator expression container    {items.map(...)}
 *   - Spread array                     {[...items.map(...), <a key="x" />]}  ← SAFE, skip
 */
function slotsOf(child) {
  if (child.type === 'JSXElement') {
    return [{ node: child, hasKey: hasKeyProp(child), isArray: false }];
  }

  if (child.type === 'JSXExpressionContainer') {
    const expr = child.expression;
    if (!expr || expr.type === 'JSXEmptyExpression') return [];

    // {condition && <Elem key="k" />}
    if (expr.type === 'LogicalExpression' && expr.operator === '&&') {
      const rhs = expr.right;
      if (rhs.type === 'JSXElement') {
        return [{ node: rhs, hasKey: hasKeyProp(rhs), isArray: false }];
      }
    }

    // {condition ? <A key="a" /> : <B key="b" />}
    if (expr.type === 'ConditionalExpression') {
      const slots = [];
      if (expr.consequent && expr.consequent.type === 'JSXElement') {
        slots.push({ node: expr.consequent, hasKey: hasKeyProp(expr.consequent), isArray: false });
      }
      if (expr.alternate && expr.alternate.type === 'JSXElement') {
        slots.push({ node: expr.alternate, hasKey: hasKeyProp(expr.alternate), isArray: false });
      }
      return slots;
    }

    // {items.map(...)} — iterator producing an array without outer key
    if (isIteratorCall(expr)) {
      return [{ node: child, hasKey: false, isArray: true }];
    }

    // {[...items.map(...), <a key="x" />]} — spread array, safe, skip entirely
    if (expr.type === 'ArrayExpression') {
      return []; // single unified array — Mithril sees one unkeyed arg, then flattens
    }
  }

  return [];
}

// ── rule ─────────────────────────────────────────────────────────────────────

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce consistent `key` usage among Mithril JSX siblings — mixing keyed and unkeyed siblings causes runtime reconciliation crashes.',
      url: 'https://mithril.js.org/render.html',
    },
    messages: {
      missingKey:
        'Mithril: missing `key` prop. When any sibling vnode has a `key`, all siblings must have one — otherwise Mithril crashes during reconciliation.',
      inconsistentTernaryKey:
        'Mithril: this element has a `key` but a sibling in the same parent does not. Add `key` to all siblings or remove it from this one.',
      iteratorNextToKeyedSibling:
        'Mithril: {iterator.map(...)} as a sibling of a keyed element causes a reconciliation crash. ' +
        'Mithril checks keys BEFORE flattening — the array has no outer key, making it "unkeyed". ' +
        'Fix: combine into a single spread array: {[...iterator.map(...), <Elem key="x" />]}.',
    },
  },

  create(context) {
    return {
      JSXElement(node) {
        // Collect all "vnode slots" from the direct children of this element.
        const slots = node.children.flatMap(slotsOf);

        if (slots.length < 2) return; // 0 or 1 slot → nothing to compare

        const keyed   = slots.filter((s) => s.hasKey && !s.isArray);
        const unkeyed = slots.filter((s) => !s.hasKey && !s.isArray);
        const arrays  = slots.filter((s) => s.isArray);

        // ── Pattern C: iterator array next to keyed sibling ───────────────────
        // An array from .map() (isArray) + at least one keyed sibling → crash.
        if (arrays.length > 0 && keyed.length > 0) {
          arrays.forEach(({ node: slotNode }) => {
            context.report({
              node: slotNode,
              messageId: 'iteratorNextToKeyedSibling',
            });
          });
          // Also report the keyed siblings so the developer sees both sides.
          keyed.forEach(({ node: slotNode }) => {
            context.report({
              node: slotNode,
              messageId: 'iteratorNextToKeyedSibling',
            });
          });
          return; // Reported Pattern C; no need to also report A/B.
        }

        // ── Patterns A & B: bare keyed vs unkeyed siblings ────────────────────
        if (keyed.length === 0 || unkeyed.length === 0) return; // all consistent

        // Report the minority side to minimise noise.
        const minority = keyed.length <= unkeyed.length ? keyed : unkeyed;
        const isMissingKey = minority === unkeyed;

        minority.forEach(({ node: slotNode }) => {
          context.report({
            node: slotNode,
            messageId: isMissingKey ? 'missingKey' : 'inconsistentTernaryKey',
          });
        });
      },
    };
  },
};
