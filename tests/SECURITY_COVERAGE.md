# Cobertura de segurança

Cada controle de segurança do tema e onde ele é verificado. **Testado** tem
teste automatizado; **Revisão** é garantido no código e revisado, sem teste de
regressão; **N/A** não tem ponto de entrada correspondente no tema.

```bash
vendor/bin/phpunit -c tests/phpunit.unit.xml --group security   # unitários de segurança
composer test:integration                                       # integração (flarum/testing)
```

| Controle | Status | Teste |
|---|---|---|
| Autorização das rotas (`assertAdmin`/`assertCan`) | Revisão | — |
| Policy de upload do hero (permite ou se abstém, nunca nega) | Testado | `tests/unit/DiscussionPolicyTest.php` |
| Permissões concedidas a visitantes | N/A | Nenhuma migração grava `group_permission` |
| Visibilidade de discussões nos contadores do fórum | Testado | `tests/integration/api/ForumAttributesTest.php` |
| Contador da equipe oculto sem `searchUsers` | Testado | `tests/integration/api/ForumAttributesTest.php` |
| Contagens do changelog sem discussões privadas/ocultas | Testado | `tests/integration/api/ChangelogCountsTest.php` |
| Lista de usuários online sem `viewForum` | Testado | `tests/integration/forum/OnlineUsersTest.php` |
| Lembretes só para discussões visíveis ao usuário | Testado | `tests/integration/console/BookmarkRemindersTest.php` |
| Horário do lembrete gravado em UTC | Testado | `tests/integration/api/BookmarkReminderTimeTest.php` |
| Mass assignment da chave primária do hero | Testado | `tests/unit/Migrations/DiscussionHeroMigrationTest.php` |
| Sanitização de HTML do admin (scripts, `on*`, URLs perigosas, mXSS) | Testado | `tests/unit/HtmlSanitizerTest.php` |
| Cache do HTML sanitizado | Testado | `tests/unit/SanitizedHtmlCacheTest.php` |
| Injeção em contexto CSS (cor do spinner) | Testado | `tests/unit/Security/LoadingSpinnerColorTest.php` |
| SVG do ícone de link interno no `<style>` do `<head>` | Testado | `tests/unit/Security/LinkIconStyleTest.php` |
| SVG do logo (DOCTYPE/ENTITY, scripts, refs externas) | Testado | `tests/unit/SvgSanitizerTest.php` |
| SVG de ícone de tag | Testado | `tests/unit/SvgIconSanitizerTest.php` |
| Upload do hero (limite de pixels, re-encode WebP) | Testado | `tests/integration/api/DiscussionHeroUploadTest.php` |
| Remoção do arquivo do hero com a discussão | Testado | `tests/integration/api/DiscussionHeroUploadTest.php` |
| Integridade da migração do hero (idempotência, `down`, cascade) | Testado | `tests/unit/Migrations/DiscussionHeroMigrationTest.php` |
| SQL injection | N/A | Só query builder; IDs convertidos para inteiro antes do `whereIn` |
| Path traversal | N/A | Nomes de arquivo gerados no servidor; disco confinado ao prefixo |
| SSRF, open redirect, bypass de CSRF | N/A | Sem fetch de URL externa, redirect ou exceção de CSRF |
| API keys, throttling, notificações próprias | N/A | O tema não cria nenhum |
| Broadcasts do realtime | Revisão | Roteados pelo modelo do próprio evento |
| Chaves de cache | Revisão | Valores globais do fórum; o ramo de visitante roda antes da leitura |
| JSON dos usuários online no `<head>` (`JSON_HEX_*`) | Revisão | — |
| Execução de comandos do sistema | N/A | Sem `exec`/`proc_open` |

O espelho em JS do sanitizador (`sanitizeAdminHtml`) e o `safeCssColor()` não
têm testes no repositório e seguem por revisão.
