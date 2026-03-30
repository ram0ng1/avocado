<?php

declare(strict_types=1);

namespace Ramon\Avocado\Controller;

use Flarum\Api\Controller\AbstractDeleteController;
use Flarum\Http\RequestUtil;
use Flarum\Settings\SettingsRepositoryInterface;
use Illuminate\Contracts\Filesystem\Factory;
use Illuminate\Contracts\Filesystem\Filesystem;
use Psr\Http\Message\ServerRequestInterface;

abstract class DeleteAssetController extends AbstractDeleteController
{
    protected Filesystem $uploadDir;

    abstract protected string $filePathSettingKey;

    public function __construct(
        protected SettingsRepositoryInterface $settings,
        Factory $filesystemFactory
    ) {
        $this->uploadDir = $filesystemFactory->disk('flarum-assets');
    }

    #[\Override]
    protected function delete(ServerRequestInterface $request): void
    {
        RequestUtil::getActor($request)->assertAdmin();

        $path = $this->settings->get($this->filePathSettingKey);
        $this->settings->set($this->filePathSettingKey, null);

        if ($path && $this->uploadDir->exists($path)) {
            $this->uploadDir->delete($path);
        }
    }
}
