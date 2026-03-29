/**
 * RealtimeIntegration.js - Complete realtime message integration for AvocadoMessages
 * 
 * Ensures that:
 * 1. Component-specific message handlers are registered when MessageStream opens
 * 2. Typing indicators show who is typing
 * 3. Messages appear in real-time without page reload
 */

import { extend } from 'flarum/common/extend';

const MESSAGE_CREATED_EVENT = 'Flarum\\Messages\\DialogMessage\\Event\\Created';

export function setupRealtimeIntegration() {
  try {

    // ──────────────────────────────────────────────────────────────────────────
    // COMPONENT HANDLER - MessageStream-specific listener
    // ──────────────────────────────────────────────────────────────────────────
    // This adds new messages to the currently-open stream
    
    // oninit: prepare handler function
    extend('ext:flarum/messages/forum/components/MessageStream', 'oninit', function (vnode) {
      this.messageCreatedHandler = (data) => {
        if (!data) {
          return;
        }
        
        try {
          const message = app.store.pushPayload(data);
          
          // Only add if it's for the current dialog and stream has content loaded
          if (message?.dialog?.()?.id() === this.attrs?.dialog?.id() && this.attrs.state.hasItems()) {
            this.attrs.state.push(message);
            // Auto-scroll to bottom
            setTimeout(() => this.scrollToBottom?.(), 50);
            m.redraw();
          }
        } catch (err) {
        }
      };
    });

    // oncreate: register handler on user channel
    extend('ext:flarum/messages/forum/components/MessageStream', 'oncreate', function (vnode) {
      if (!app.websocket_channels?.user) {
        return;
      }
      
      app.websocket_channels.user.bind(MESSAGE_CREATED_EVENT, this.messageCreatedHandler);
    });

    // onremove: clean up handler
    extend('ext:flarum/messages/forum/components/MessageStream', 'onremove', function (vnode) {
      if (app.websocket_channels?.user && this.messageCreatedHandler) {
        app.websocket_channels.user.unbind(MESSAGE_CREATED_EVENT, this.messageCreatedHandler);
      }
    });

    // ──────────────────────────────────────────────────────────────────────────
    // TYPING INDICATOR SUPPORT
    // ──────────────────────────────────────────────────────────────────────────
    
    extend('ext:flarum/messages/forum/components/MessageStream', 'oninit', function (vnode) {
      this.userTypingHandler = (data) => {
        this.userTyping?.(data);
      };
    });

    extend('ext:flarum/messages/forum/components/MessageStream', 'oncreate', function (vnode) {
      if (!app.websocket) {
        return;
      }

      const dialogId = this.attrs?.dialog?.id?.();
      if (!dialogId) return;

      const typingChannelName = `private-privateMessageTyping=${dialogId}`;
      
      // Subscribe to typing indicator channel
      if (!app.websocket_channels) app.websocket_channels = {};
      
      app.websocket_channels.privateMessages = app.websocket.subscribe(typingChannelName);
      
      if (app.websocket_channels.privateMessages && this.userTypingHandler) {
        app.websocket_channels.privateMessages.bind('client-typing', this.userTypingHandler);
      }
    });

    extend('ext:flarum/messages/forum/components/MessageStream', 'onremove', function (vnode) {
      if (app.websocket_channels?.privateMessages && this.userTypingHandler) {
        app.websocket_channels.privateMessages.unbind('client-typing', this.userTypingHandler);
      }
    });

  } catch (err) {
  }
}

