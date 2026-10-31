<?php

/*
 * This file is part of ramon/avocado.
 *
 * Copyright (c) 2026 Ramon.
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

namespace Ramon\Avocado\Tests\integration\api;

use Carbon\Carbon;
use Flarum\Discussion\Discussion;
use Flarum\Post\Post;
use Flarum\Testing\integration\RetrievesAuthorizedUsers;
use Flarum\Testing\integration\TestCase;
use Flarum\User\User;
use Laminas\Diactoros\UploadedFile;
use PHPUnit\Framework\Attributes\Test;
use Psr\Http\Message\ResponseInterface;

/**
 * POST /api/avocado/discussion-hero: a imagem é decodificada no servidor, então
 * o tamanho em pixels (não em bytes) é o que precisa de limite.
 */
class DiscussionHeroUploadTest extends TestCase
{
    use RetrievesAuthorizedUsers;

    /** @var list<string> */
    private array $files = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->extension('ramon-avocado');

        $this->prepareDatabase([
            User::class => [$this->normalUser()],
            Discussion::class => [
                ['id' => 1, 'title' => 'Com hero', 'created_at' => Carbon::now(), 'user_id' => 2, 'first_post_id' => 1, 'comment_count' => 1],
            ],
            Post::class => [
                ['id' => 1, 'discussion_id' => 1, 'created_at' => Carbon::now(), 'user_id' => 2, 'type' => 'comment', 'content' => '<t><p>x</p></t>', 'number' => 1],
            ],
        ]);
    }

    protected function tearDown(): void
    {
        foreach ($this->files as $file) {
            @unlink($file);
        }

        parent::tearDown();
    }

    private function upload(string $bytes, string $name): ResponseInterface
    {
        $path = tempnam(sys_get_temp_dir(), 'avocado-hero');
        file_put_contents($path, $bytes);
        $this->files[] = $path;

        $request = $this->request('POST', '/api/avocado/discussion-hero', ['authenticatedAs' => 1])
            ->withQueryParams(['discussionId' => '1'])
            ->withUploadedFiles(['avocado-discussion-hero' => new UploadedFile($path, filesize($path), UPLOAD_ERR_OK, $name)]);

        return $this->send($request);
    }

    /** PNG de uma cor só: poucos KB no disco, `$width × $height` pixels depois de decodificado. */
    private function flatPng(int $width, int $height): string
    {
        $chunk = fn (string $type, string $data) => pack('N', strlen($data)).$type.$data.pack('N', crc32($type.$data));

        $deflate = deflate_init(ZLIB_ENCODING_DEFLATE, ['level' => 9]);
        $row = "\0".str_repeat("\0", $width * 3);
        $idat = '';
        for ($y = 0; $y < $height; $y++) {
            $idat .= deflate_add($deflate, $row, ZLIB_NO_FLUSH);
        }
        $idat .= deflate_add($deflate, '', ZLIB_FINISH);

        return "\x89PNG\r\n\x1a\n"
            .$chunk('IHDR', pack('NNCCCCC', $width, $height, 8, 2, 0, 0, 0))
            .$chunk('IDAT', $idat)
            .$chunk('IEND', '');
    }

    #[Test]
    public function image_with_too_many_pixels_is_refused_before_decoding(): void
    {
        $bytes = $this->flatPng(7000, 7000);
        $this->assertLessThan(1024 * 1024, strlen($bytes), 'o arquivo é pequeno; o problema é a imagem decodificada');

        $response = $this->upload($bytes, 'grande.png');

        $this->assertEquals(422, $response->getStatusCode(), (string) $response->getBody());
        $this->assertSame(0, Discussion::find(1)->avocadoHero()->count());
    }

    #[Test]
    public function regular_image_is_stored_as_webp(): void
    {
        $response = $this->upload($this->flatPng(1200, 400), 'normal.png');

        $this->assertEquals(200, $response->getStatusCode(), (string) $response->getBody());
        $this->assertStringEndsWith('.webp', json_decode((string) $response->getBody(), true)['heroImagePath']);
    }

    #[Test]
    public function deleting_the_discussion_removes_the_hero_file(): void
    {
        $response = $this->upload($this->flatPng(1200, 400), 'normal.png');
        $path = json_decode((string) $response->getBody(), true)['heroImagePath'];
        $disk = $this->app()->getContainer()->make('filesystem')->disk('flarum-assets');

        $this->assertTrue($disk->exists($path));

        $response = $this->send($this->request('DELETE', '/api/discussions/1', ['authenticatedAs' => 1]));

        $this->assertEquals(204, $response->getStatusCode(), (string) $response->getBody());
        $this->assertFalse($disk->exists($path));
    }
}
