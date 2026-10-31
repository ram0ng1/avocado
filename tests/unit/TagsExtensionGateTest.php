<?php

declare(strict_types=1);

namespace Ramon\Avocado\Tests\unit;

use Flarum\Api\Client;
use Flarum\Extension\ExtensionManager;
use Flarum\Frontend\Document;
use Flarum\Http\SlugManager;
use Flarum\Settings\SettingsRepositoryInterface;
use Laminas\Diactoros\Response\JsonResponse;
use Laminas\Diactoros\ServerRequest;
use Mockery;
use Mockery\Adapter\Phpunit\MockeryPHPUnitIntegration;
use PHPUnit\Framework\TestCase;
use Ramon\Avocado\Content\PreloadHomeFeed;
use Ramon\Avocado\Content\PreloadShowcase;
use Ramon\Avocado\Support\ChangelogProducts;

/**
 * Com o flarum/tags instalado mas desligado a classe Tag continua carregável,
 * então `class_exists` não serve de guarda: o que vale é a extensão estar ativa.
 * Sem ela não há relação `tags` na API (include desconhecido é 400) nem filtro
 * por tag.
 */
final class TagsExtensionGateTest extends TestCase
{
    use MockeryPHPUnitIntegration;

    public function test_changelog_is_off_while_tags_is_disabled(): void
    {
        $products = new ChangelogProducts(
            $this->settings(['avocado.changelog_enabled' => '1']),
            Mockery::mock(SlugManager::class),
            $this->extensions(tagsEnabled: false),
        );

        $this->assertFalse($products->enabled());
    }

    public function test_changelog_follows_its_setting_while_tags_is_enabled(): void
    {
        $products = new ChangelogProducts(
            $this->settings(['avocado.changelog_enabled' => '1']),
            Mockery::mock(SlugManager::class),
            $this->extensions(tagsEnabled: true),
        );

        $this->assertTrue($products->enabled());
    }

    public function test_home_feed_preload_does_not_ask_for_tags_while_tags_is_disabled(): void
    {
        $this->assertSame('user,lastPostedUser', $this->homeFeedInclude(tagsEnabled: false));
    }

    public function test_home_feed_preload_includes_tags_while_tags_is_enabled(): void
    {
        $this->assertSame('user,lastPostedUser,tags', $this->homeFeedInclude(tagsEnabled: true));
    }

    public function test_showcase_preload_skips_the_request_while_tags_is_disabled(): void
    {
        $api = Mockery::mock(Client::class);
        $api->shouldNotReceive('get');
        $slugs = Mockery::mock(SlugManager::class);
        $slugs->shouldNotReceive('forResource');

        $preload = new PreloadShowcase(
            $api,
            $this->settings(['avocado.showcase_enabled' => '1', 'avocado.showcase_tag' => '["1"]']),
            $slugs,
            $this->extensions(tagsEnabled: false),
        );

        $document = Mockery::mock(Document::class);
        $preload($document, (new ServerRequest())->withAttribute('routeName', 'default'));

        $this->assertArrayNotHasKey('avocadoShowcase', $document->payload);
    }

    private function homeFeedInclude(bool $tagsEnabled): ?string
    {
        $include = null;

        $api = Mockery::mock(Client::class);
        $api->shouldReceive('withoutErrorHandling', 'withParentRequest')->andReturnSelf();
        $api->shouldReceive('withQueryParams')->andReturnUsing(function (array $params) use ($api, &$include) {
            $include = $params['include'] ?? null;

            return $api;
        });
        $api->shouldReceive('get')->andReturn(new JsonResponse(['data' => []]));

        // 20 discussões no feed + 5 no showcase: a página da index não basta e o preload busca.
        $preload = new PreloadHomeFeed(
            $api,
            $this->settings([
                'avocado.home_feed_count'  => '20',
                'avocado.showcase_enabled' => '1',
                'avocado.showcase_count'   => '5',
            ]),
            $this->extensions($tagsEnabled),
        );

        $preload(Mockery::mock(Document::class), (new ServerRequest())->withAttribute('routeName', 'default'));

        return $include;
    }

    /**
     * @param array<string, string> $values
     */
    private function settings(array $values): SettingsRepositoryInterface
    {
        $settings = Mockery::mock(SettingsRepositoryInterface::class);
        $settings->shouldReceive('get')->andReturnUsing(fn (string $key, mixed $default = null) => $values[$key] ?? $default);

        return $settings;
    }

    private function extensions(bool $tagsEnabled): ExtensionManager
    {
        $extensions = Mockery::mock(ExtensionManager::class);
        $extensions->shouldReceive('isEnabled')->andReturnUsing(fn (string $id) => $id === 'flarum-tags' && $tagsEnabled);

        return $extensions;
    }
}
