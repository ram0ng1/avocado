/**
 * RealtimeIntegration.js - Realtime message integration for AvocadoMessages.
 */

import { extend } from 'flarum/common/extend';

const MESSAGE_CREATED_EVENT = 'Flarum\\Messages\\DialogMessage\\Event\\Created';

export function setupRealtimeIntegration() {
  // ── oninit: prepare both handlers in a single extend ──────────────────────
  extend('ext:flarum/messages/forum/components/MessageStream', 'oninit', function () {
    this.messageCreatedHandler = (data) => {
      if (!data) return;
      const message = app.store.pushPayload(data);
      if (message?.dialog?.()?.id() === this.attrs?.dialog?.id() && this.attrs.state.hasItems()) {
        this.attrs.state.push(message);
        this.scrollToBottom?.();
        m.redraw();
      }
    };

    this.userTypingHandler = (data) => {
      this.userTyping?.(data);
    };
  });

  // ── oncreate: bind both handlers ──────────────────────────────────────────
  extend('ext:flarum/messages/forum/components/MessageStream', 'oncreate', function () {
    if (app.websocket_channels?.user && this.messageCreatedHandler) {
      app.websocket_channels.user.bind(MESSAGE_CREATED_EVENT, this.messageCreatedHandler);
    }

    if (!app.websocket) return;

    const dialogId = this.attrs?.dialog?.id?.();
    if (!dialogId) return;

    if (!app.websocket_channels) app.websocket_channels = {};

    app.websocket_channels.privateMessages = app.websocket.subscribe(
      `private-privateMessageTyping=${dialogId}`
    );

    if (app.websocket_channels.privateMessages && this.userTypingHandler) {
      app.websocket_channels.privateMessages.bind('client-typing', this.userTypingHandler);
    }
  });

  // ── onremove: clean up both handlers ─────────────────────────────────────
  extend('ext:flarum/messages/forum/components/MessageStream', 'onremove', function () {
    if (app.websocket_channels?.user && this.messageCreatedHandler) {
      app.websocket_channels.user.unbind(MESSAGE_CREATED_EVENT, this.messageCreatedHandler);
    }
    if (app.websocket_channels?.privateMessages && this.userTypingHandler) {
      app.websocket_channels.privateMessages.unbind('client-typing', this.userTypingHandler);
    }
  });
}
