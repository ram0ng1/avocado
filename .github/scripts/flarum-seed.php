<?php
// Popula o Flarum de teste com dados mínimos para que /, /tags e /all
// não fiquem vazios. Roda dentro do diretório raiz do Flarum.

declare(strict_types=1);

require __DIR__ . '/../../../site.php';

use Flarum\Foundation\InstalledSite;
use Flarum\Discussion\Discussion;
use Flarum\Post\CommentPost;
use Flarum\User\User;
use Flarum\Tags\Tag;
use Illuminate\Support\Carbon;

/** @var InstalledSite|null $site */
$site = $site ?? null;
$app  = ($site ?? require __DIR__ . '/../../../site.php')->bootApp();
$app->getContainer()->make(\Illuminate\Database\ConnectionInterface::class);

$admin = User::query()->where('username', 'admin')->firstOrFail();

// Tags (cria 3 se a extensão flarum/tags estiver instalada)
if (class_exists(Tag::class)) {
    foreach ([['General', 'general', '#5856D6'], ['Annunci', 'announcements', '#34C759'], ['Bug', 'bug', '#FF3B30']] as $i => [$name, $slug, $color]) {
        Tag::firstOrCreate(
            ['slug' => $slug],
            [
                'name'     => $name,
                'color'    => $color,
                'position' => $i,
            ]
        );
    }
}

// Discussões (30) com 1 post cada
$now = Carbon::now();
for ($i = 1; $i <= 30; $i++) {
    $title = sprintf('Discussion %02d — benchmark seed', $i);
    if (Discussion::query()->where('title', $title)->exists()) continue;

    $disc = Discussion::start($title, $admin);
    $disc->save();
    $post = CommentPost::reply($disc->id, "Conteúdo de teste número $i para benchmark.\n\nlorem ipsum dolor sit amet.", $admin->id, null);
    $post->save();
    $disc->setFirstPost($post);
    $disc->refreshLastPost();
    $disc->refreshCommentCount();
    $disc->refreshParticipantCount();
    $disc->save();
}

echo "Seed concluído.\n";
