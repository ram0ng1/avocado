import app from 'flarum/common/app';
import extractText from 'flarum/common/utils/extractText';

/**
 * Para passar em `app.request({ ..., ...handleErrorsHere })` quando o próprio
 * código mostra o erro: sem isso o Flarum mostra o alerta padrão e o do tema
 * aparece por cima, duas mensagens para um problema só.
 */
export const handleErrorsHere = { errorHandler: () => {} };

/** Erros de validação (422) que o servidor devolveu, com o campo de cada um. */
export function validationErrors(error: any): { field: string | null; message: string }[] {
  if (error?.status !== 422) return [];

  return (error.response?.errors ?? []).map((e: any) => ({
    field:
      String(e?.source?.pointer ?? '')
        .split('/')
        .pop() || null,
    message: decodeURI(String(e?.detail ?? '')),
  }));
}

/**
 * A mensagem que a pessoa deve ver: o motivo do servidor quando ele explica o
 * que corrigir (validação, sem conexão, sem permissão…), e `fallback` quando
 * a falha é do lado do servidor e não há o que ela possa mudar.
 */
export function requestErrorMessage(error: any, fallback: string): string {
  const reasons = validationErrors(error)
    .map((e) => e.message)
    .filter(Boolean);
  if (reasons.length) return reasons.join(' ');

  // Status 0 é falha de rede: a mensagem do core (sem conexão, etc.) orienta melhor.
  if (typeof error?.status !== 'number' || error.status >= 500 || !error.alert?.content) return fallback;

  return extractText(error.alert.content) || fallback;
}

/** Um alerta só, com a mensagem de `requestErrorMessage`. */
export function showRequestError(error: any, fallback: string): void {
  app.alerts.show({ type: 'error' }, requestErrorMessage(error, fallback));
}
