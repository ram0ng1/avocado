<?php

/*
 * This file is part of ramon/avocado.
 *
 * Copyright (c) 2026 Ramon.
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

declare(strict_types=1);

namespace Ramon\Avocado\Controller;

class DeleteLinkIconSvgController extends DeleteAssetController
{
    protected string $filePathSettingKey = 'avocado.link_icon_svg';
}
