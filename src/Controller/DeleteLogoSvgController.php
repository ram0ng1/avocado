<?php

declare(strict_types=1);

namespace Ramon\Avocado\Controller;

class DeleteLogoSvgController extends DeleteAssetController
{
    protected string $filePathSettingKey = 'avocado.logo_svg';
}
