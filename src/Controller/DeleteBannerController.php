<?php

declare(strict_types=1);

namespace Ramon\Avocado\Controller;

class DeleteBannerController extends DeleteAssetController
{
    protected string $filePathSettingKey = 'avocado.hero_image';
}
