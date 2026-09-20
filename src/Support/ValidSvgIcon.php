<?php

declare(strict_types=1);

namespace Ramon\Avocado\Support;

use Closure;
use Flarum\Locale\TranslatorInterface;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Regra de validação: o valor precisa ser um SVG que o sanitizador entende e
 * caber no limite dele.
 */
final class ValidSvgIcon implements ValidationRule
{
    public function __construct(
        private readonly TranslatorInterface $translator
    ) {
    }

    #[\Override]
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || trim($value) === '') {
            return;
        }

        if (strlen($value) > SvgIconSanitizer::MAX_BYTES) {
            $fail($this->translator->trans('ramon-avocado.api.tag_icon_svg_too_large', [
                'max' => round(SvgIconSanitizer::MAX_BYTES / 1024),
            ]));

            return;
        }

        if (SvgIconSanitizer::sanitize($value) === null) {
            $fail($this->translator->trans('ramon-avocado.api.tag_icon_svg_invalid'));
        }
    }
}
