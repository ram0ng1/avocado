<?php

declare(strict_types=1);

namespace Ramon\Avocado\Controller;

class DeleteAuthImageController extends DeleteAssetController
{
    protected string $filePathSettingKey = 'avocado.auth_image';
}
