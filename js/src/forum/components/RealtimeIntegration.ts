// @ts-nocheck
/**
 * RealtimeIntegration — WebSocket/Pusher integration for flarum/messages.
 */
import { extend } from 'flarum/common/extend';

const MESSAGE_CREATED_EVENT = 'Flarum\\Messages\\DialogMessage\\Event\\Created';

export function setupRealtimeIntegration(): void {
  extend('ext:flarum/messages/forum/components/MessageStream', 'oninit', function (this: any) {
    this.messageCreatedHandler = (data: any) => {
      if (!data) return;
      const message = app.store.pushPayload(data);
      if (message?.dialog?.()?.id() === this.attrs?.dialog?.id() && this.attrs.state.hasItems()) {
        this.attrs.state.push(message);
        this.scrollToBottom?.();
        m.redraw();
      }
    };

    this.userTypingHandler = (data: any) => {
      this.userTyping?.(data);
    };
  });

  extend('ext:flarum/messages/forum/components/MessageStream', 'oncreate', function (this: any) {
    if ((app as any).websocket_channels?.user && this.messageCreatedHandler) {
      (app as any).websocket_channels.user.bind(MESSAGE_CREATED_EVENT, this.messageCreatedHandler);
    }

    if (!(app as any).websocket) return;

    const dialogId = this.attrs?.dialog?.id?.();
    if (!dialogId) return;

    if (!(app as any).websocket_channels) (app as any).websocket_channels = {};

    (app as any).websocket_channels.privateMessages = (app as any).websocket.subscribe(
      `private-privateMessageTyping=${dialogId}`
    );

    if ((app as any).websocket_channels.privateMessages && this.userTypingHandler) {
      (app as any).websocket_channels.privateMessages.bind('client-typing', this.userTypingHandler);
    }
  });

  extend('ext:flarum/messages/forum/components/MessageStream', 'onremove', function (this: any) {
    if ((app as any).websocket_channels?.user && this.messageCreatedHandler) {
      (app as any).websocket_channels.user.unbind(MESSAGE_CREATED_EVENT, this.messageCreatedHandler);
    }
    if ((app as any).websocket_channels?.privateMessages && this.userTypingHandler) {
      (app as any).websocket_channels.privateMessages.unbind('client-typing', this.userTypingHandler);
    }
  });
}
