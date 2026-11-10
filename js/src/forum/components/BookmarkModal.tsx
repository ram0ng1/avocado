import app from 'flarum/forum/app';
import Modal from 'flarum/common/components/Modal';
import Button from 'flarum/common/components/Button';

import { trans } from '../utils';
import { requestErrorMessage, showRequestError, validationErrors } from '../../common/requestErrors';
import { toggleBookmark, updateBookmark, bookmarkNote, bookmarkRemindAt } from '../utils/bookmarks';
import { is24HourClock } from '../utils/clock';

type ReminderChoice = 'none' | 'later' | 'tomorrow' | 'week' | 'custom';

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;

/** Grade do seletor de minutos: de 5 em 5. */
const REMINDER_MINUTE_STEP = 5;

/** Presets do "Me lembrar" — os rótulos em locale/*.yml citam estes valores. */
const HOURS_UNTIL_LATER_TODAY = 4;
const DAYS_UNTIL_TOMORROW = 1;
const DAYS_UNTIL_NEXT_WEEK = 7;
const MORNING_REMINDER_HOUR = 9;

/** Mesmos limites do UpdateBookmarkController. */
const NOTE_MAX_LENGTH = 1000;
const NOTE_COUNTER_FROM = 800;

/** Ordem que um relógio de 12h mostra: meia-noite e meio-dia são "12". */
const HOURS_IN_12_HOUR_CLOCK = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

/** Lembrete personalizado que não dá para salvar. `message` já vem traduzida. */
class InvalidReminderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidReminderError';
  }
}

/**
 * Editor de bookmark no estilo Discourse: uma nota e um lembrete opcional.
 * Salvar é um upsert (PATCH /avocado/bookmark), então serve também para salvar
 * uma discussão que ainda não estava salva.
 *
 * A hora usa selects próprios em vez de `datetime-local`: o input nativo segue o
 * formato do navegador (en-US fica preso em AM/PM) e ignoraria utils/clock.
 */
export default class BookmarkModal extends Modal<any> {
  private note = '';
  private reminderChoice: ReminderChoice = 'none';
  /** Data do lembrete no formato `YYYY-MM-DD` que o input type=date usa. */
  private reminderDate = '';
  /** Hora sempre guardada em 0–23; o modo 12h só muda como ela é exibida. */
  private reminderHour = MORNING_REMINDER_HOUR;
  private reminderMinute = 0;
  /** Erros mostrados embaixo do campo a que se referem. */
  private noteError: string | null = null;
  private reminderError: string | null = null;
  private formError: string | null = null;

  oninit(vnode: any) {
    super.oninit(vnode);

    const discussion = this.attrs.discussion;
    this.note = bookmarkNote(discussion);

    // Um lembrete já vencido não é reaproveitado: cairia direto na validação de
    // "data no futuro" ao salvar.
    const saved = bookmarkRemindAt(discussion);
    const isSavedReminderPending = !!saved && saved.getTime() > Date.now();
    const start = isSavedReminderPending ? (saved as Date) : buildDefaultReminderStart();

    if (isSavedReminderPending) this.reminderChoice = 'custom';

    this.reminderDate = formatAsDateInputValue(start);
    this.reminderHour = start.getHours();
    this.reminderMinute = start.getMinutes();
  }

  className() {
    return 'AvocadoBookmarkModal Modal--small';
  }

  title() {
    return trans('ramon-avocado.forum.bookmarks.modal_title', 'Bookmark');
  }

  content() {
    const choices: { key: ReminderChoice; label: string }[] = [
      { key: 'none', label: trans('ramon-avocado.forum.bookmarks.reminder_none', 'No reminder') as string },
      { key: 'later', label: trans('ramon-avocado.forum.bookmarks.reminder_later', 'Later today (in 4 hours)') as string },
      { key: 'tomorrow', label: trans('ramon-avocado.forum.bookmarks.reminder_tomorrow', 'Tomorrow morning') as string },
      { key: 'week', label: trans('ramon-avocado.forum.bookmarks.reminder_week', 'Next week') as string },
      { key: 'custom', label: trans('ramon-avocado.forum.bookmarks.reminder_custom', 'Pick date & time') as string },
    ];

    return (
      <div className="Modal-body">
        <form onsubmit={(e: Event) => this.onsubmit(e)}>
          <div className="Form-group">
            <label className="AvocadoBookmarkModal-label" for="avocado-bookmark-note">
              {trans('ramon-avocado.forum.bookmarks.note_label', 'Note')}
            </label>
            <textarea
              id="avocado-bookmark-note"
              className="FormControl AvocadoBookmarkModal-note"
              rows="3"
              maxlength={NOTE_MAX_LENGTH}
              placeholder={trans('ramon-avocado.forum.bookmarks.note_placeholder', 'Why are you saving this? (optional)') as string}
              value={this.note}
              aria-invalid={this.noteError ? 'true' : undefined}
              aria-describedby={this.noteError ? 'avocado-bookmark-note-error' : undefined}
              oninput={(e: InputEvent) => {
                this.note = (e.target as HTMLTextAreaElement).value;
                this.noteError = null;
              }}
            />
            {this.note.length >= NOTE_COUNTER_FROM && (
              <p className="AvocadoBookmarkModal-counter" aria-live="polite">
                {trans('ramon-avocado.forum.bookmarks.note_counter', '{count} of {max} characters', {
                  count: this.note.length,
                  max: NOTE_MAX_LENGTH,
                })}
              </p>
            )}
            {this.renderError('avocado-bookmark-note-error', this.noteError)}
          </div>

          <div className="Form-group">
            <label className="AvocadoBookmarkModal-label" for="avocado-bookmark-reminder">
              {trans('ramon-avocado.forum.bookmarks.reminder_label', 'Remind me')}
            </label>
            <select
              id="avocado-bookmark-reminder"
              className="FormControl"
              value={this.reminderChoice}
              aria-invalid={this.reminderError && this.reminderChoice !== 'custom' ? 'true' : undefined}
              aria-describedby={this.reminderError ? 'avocado-bookmark-reminder-error' : undefined}
              onchange={(e: Event) => {
                this.reminderChoice = (e.target as HTMLSelectElement).value as ReminderChoice;
                this.reminderError = null;
              }}
            >
              {choices.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {this.reminderChoice === 'custom' && this.renderCustomReminderFields()}
          {this.renderError('avocado-bookmark-reminder-error', this.reminderError)}

          {this.renderError('avocado-bookmark-form-error', this.formError)}

          <div className="Form-group AvocadoBookmarkModal-actions">
            <Button className="Button Button--primary AvocadoBookmarkModal-save" type="submit" loading={this.loading}>
              {trans('ramon-avocado.forum.bookmarks.modal_save', 'Save')}
            </Button>
            <Button className="Button AvocadoBookmarkModal-cancel" type="button" disabled={this.loading} onclick={() => this.hide()}>
              {trans('ramon-avocado.forum.bookmarks.modal_cancel', 'Cancel')}
            </Button>
          </div>

          <div className="AvocadoBookmarkModal-danger">
            <Button
              className="Button AvocadoBookmarkModal-remove"
              type="button"
              icon="far fa-trash-alt"
              disabled={this.loading}
              onclick={() => this.removeWithUndo()}
            >
              {trans('ramon-avocado.forum.bookmarks.unsave', 'Remove from saved')}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  onsubmit(e: Event) {
    e.preventDefault();

    this.noteError = this.reminderError = this.formError = null;

    let remindAt: Date | null;
    try {
      remindAt = this.resolveReminderInstant();
    } catch (error) {
      if (!(error instanceof InvalidReminderError)) throw error;
      this.reminderError = error.message;

      return;
    }

    this.loading = true;

    updateBookmark(this.attrs.discussion, { note: this.note.trim() || null, remindAt: remindAt?.toISOString() ?? null })
      .then(() => this.hide())
      .catch((error: any) => {
        this.loaded();
        this.showServerErrors(error);
      });
  }

  /** Cada erro de validação vai para baixo do seu campo; o resto, para baixo do formulário. */
  private showServerErrors(error: any): void {
    const errors = validationErrors(error);

    for (const { field, message } of errors) {
      if (field === 'note') this.noteError = message;
      else if (field === 'remindAt') this.reminderError = message;
      else this.formError = message;
    }

    if (!errors.length) {
      this.formError = requestErrorMessage(
        error,
        trans('ramon-avocado.forum.bookmarks.update_error', 'Could not save your changes. Check your connection and try again.') as string
      );
    }

    m.redraw();
  }

  /** Remove na hora e oferece desfazer: nota e lembrete voltam junto. */
  private removeWithUndo(): void {
    const discussion = this.attrs.discussion;
    const note = bookmarkNote(discussion) || null;
    const remindAt = bookmarkRemindAt(discussion);

    toggleBookmark(discussion);
    this.hide();

    const alert = app.alerts.show(
      {
        type: 'success',
        controls: [
          // Sem key: o Alert do core junta estes controles ao botão de fechar, que não tem chave.
          // eslint-disable-next-line react/jsx-key
          <Button
            className="Button Button--link"
            onclick={() => {
              app.alerts.dismiss(alert);
              updateBookmark(discussion, {
                note,
                remindAt: remindAt && remindAt.getTime() > Date.now() ? remindAt.toISOString() : null,
              }).catch((error: any) =>
                showRequestError(
                  error,
                  trans(
                    'ramon-avocado.forum.bookmarks.toggle_error',
                    'Could not update your saved list. Check your connection and try again.'
                  ) as string
                )
              );
            }}
          >
            {trans('ramon-avocado.forum.bookmarks.undo', 'Undo')}
          </Button>,
        ],
      },
      trans('ramon-avocado.forum.bookmarks.removed', 'Removed from saved.')
    );
  }

  private renderError(id: string, message: string | null) {
    if (!message) return null;

    return (
      <p id={id} className="AvocadoBookmarkModal-error" role="alert">
        <i className="fas fa-exclamation-circle" aria-hidden="true" />
        {message}
      </p>
    );
  }

  /**
   * Instante do lembrete escolhido, ou `null` quando a escolha é "sem lembrete".
   *
   * @throws InvalidReminderError quando a data personalizada está vazia ou no passado.
   */
  private resolveReminderInstant(): Date | null {
    if (this.reminderChoice === 'later') return new Date(Date.now() + HOURS_UNTIL_LATER_TODAY * MILLISECONDS_PER_HOUR);
    if (this.reminderChoice === 'tomorrow') return buildMorningReminder(DAYS_UNTIL_TOMORROW);
    if (this.reminderChoice === 'week') return buildMorningReminder(DAYS_UNTIL_NEXT_WEEK);
    if (this.reminderChoice !== 'custom') return null;

    const chosen = this.buildCustomReminder();
    if (!chosen) {
      throw new InvalidReminderError(trans('ramon-avocado.forum.bookmarks.reminder_invalid_date', 'Choose a date for the reminder.') as string);
    }

    if (chosen.getTime() <= Date.now()) {
      throw new InvalidReminderError(
        trans('ramon-avocado.forum.bookmarks.reminder_invalid', 'That time has already passed. Choose a time from now on.') as string
      );
    }

    if (chosen.getTime() > latestReminderDate().getTime()) {
      throw new InvalidReminderError(
        trans('ramon-avocado.forum.bookmarks.reminder_too_far', 'Reminders can be set up to 1 year from today. Choose a closer date.') as string
      );
    }

    return chosen;
  }

  /** Data + hora do lembrete personalizado, ou null se a data estiver vazia/inválida. */
  private buildCustomReminder(): Date | null {
    const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(this.reminderDate);
    if (!parts) return null;

    const chosen = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]), this.reminderHour, this.reminderMinute, 0, 0);

    return isNaN(chosen.getTime()) ? null : chosen;
  }

  private renderCustomReminderFields() {
    return (
      <div className="Form-group AvocadoBookmarkModal-when">
        <input
          type="date"
          className="FormControl AvocadoBookmarkModal-date"
          aria-label={trans('ramon-avocado.forum.bookmarks.reminder_date_label', 'Date') as string}
          min={formatAsDateInputValue(new Date())}
          max={formatAsDateInputValue(latestReminderDate())}
          value={this.reminderDate}
          aria-invalid={this.reminderError ? 'true' : undefined}
          aria-describedby={this.reminderError ? 'avocado-bookmark-reminder-error' : undefined}
          oninput={(e: InputEvent) => {
            this.reminderDate = (e.target as HTMLInputElement).value;
            this.reminderError = null;
          }}
        />

        <div className="AvocadoBookmarkModal-time">
          {this.renderHourSelect()}

          <span className="AvocadoBookmarkModal-timeSep" aria-hidden="true">
            :
          </span>

          {this.renderMinuteSelect()}
          {!is24HourClock() && this.renderMeridiemSelect()}
        </div>
      </div>
    );
  }

  /** Em 12h o select mostra 12,1..11 e o período traduz a escolha de volta para 0–23. */
  private renderHourSelect() {
    const uses24HourClock = is24HourClock();
    const isAfternoon = this.reminderHour >= 12;
    const hours = uses24HourClock ? buildNumberRange(0, 23) : HOURS_IN_12_HOUR_CLOCK;

    return (
      <select
        className="FormControl AvocadoBookmarkModal-hour"
        aria-label={trans('ramon-avocado.forum.bookmarks.reminder_hour_label', 'Hour') as string}
        value={String(uses24HourClock ? this.reminderHour : convertTo12Hour(this.reminderHour))}
        onchange={(e: Event) => {
          const chosen = Number((e.target as HTMLSelectElement).value);
          this.reminderHour = uses24HourClock ? chosen : convertTo24Hour(chosen, isAfternoon);
        }}
      >
        {hours.map((hour) => (
          <option key={hour} value={String(hour)}>
            {uses24HourClock ? padTwoDigits(hour) : String(hour)}
          </option>
        ))}
      </select>
    );
  }

  private renderMinuteSelect() {
    return (
      <select
        className="FormControl AvocadoBookmarkModal-minute"
        aria-label={trans('ramon-avocado.forum.bookmarks.reminder_minute_label', 'Minute') as string}
        value={String(this.reminderMinute)}
        onchange={(e: Event) => (this.reminderMinute = Number((e.target as HTMLSelectElement).value))}
      >
        {buildMinuteOptions(this.reminderMinute).map((minute) => (
          <option key={minute} value={String(minute)}>
            {padTwoDigits(minute)}
          </option>
        ))}
      </select>
    );
  }

  private renderMeridiemSelect() {
    return (
      <select
        className="FormControl AvocadoBookmarkModal-meridiem"
        aria-label={trans('ramon-avocado.forum.bookmarks.reminder_meridiem_label', 'AM or PM') as string}
        value={this.reminderHour >= 12 ? 'pm' : 'am'}
        onchange={(e: Event) => {
          const isAfternoon = (e.target as HTMLSelectElement).value === 'pm';
          this.reminderHour = convertTo24Hour(convertTo12Hour(this.reminderHour), isAfternoon);
        }}
      >
        <option key="am" value="am">
          {trans('ramon-avocado.forum.bookmarks.reminder_am', 'AM')}
        </option>
        <option key="pm" value="pm">
          {trans('ramon-avocado.forum.bookmarks.reminder_pm', 'PM')}
        </option>
      </select>
    );
  }
}

/** O último instante aceito pelo servidor: daqui a exatamente 1 ano. */
function latestReminderDate(): Date {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);

  return date;
}

function padTwoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

function buildNumberRange(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

/** Formata uma data no shape `YYYY-MM-DD` que o input[type=date] espera. */
function formatAsDateInputValue(date: Date): string {
  return `${date.getFullYear()}-${padTwoDigits(date.getMonth() + 1)}-${padTwoDigits(date.getDate())}`;
}

function convertTo12Hour(hour24: number): number {
  return hour24 % 12 === 0 ? 12 : hour24 % 12;
}

function convertTo24Hour(hour12: number, isAfternoon: boolean): number {
  return (hour12 % 12) + (isAfternoon ? 12 : 0);
}

/**
 * Grade de 5 em 5 minutos, mais o valor atual quando ele veio de fora da grade
 * (um lembrete salvo às 14:07 continua editável sem ser arrastado para 14:05).
 */
function buildMinuteOptions(current: number): number[] {
  const grid = buildNumberRange(0, Math.floor(59 / REMINDER_MINUTE_STEP)).map((slot) => slot * REMINDER_MINUTE_STEP);

  return grid.includes(current) ? grid : [...grid, current].sort((a, b) => a - b);
}

/** Ponto de partida do seletor personalizado: daqui a uma hora, na grade de minutos. */
function buildDefaultReminderStart(): Date {
  const start = new Date(Date.now() + MILLISECONDS_PER_HOUR);
  start.setMinutes(Math.ceil(start.getMinutes() / REMINDER_MINUTE_STEP) * REMINDER_MINUTE_STEP, 0, 0);

  return start;
}

/** Manhã (09:00 local) daqui a `days` dias. */
function buildMorningReminder(days: number): Date {
  const morning = new Date();
  morning.setDate(morning.getDate() + days);
  morning.setHours(MORNING_REMINDER_HOUR, 0, 0, 0);

  return morning;
}
