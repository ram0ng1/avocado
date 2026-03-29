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
    console.log('[Avocado] Setting up realtime integration...');

    // ──────────────────────────────────────────────────────────────────────────
    // COMPONENT HANDLER - MessageStream-specific listener
    // ──────────────────────────────────────────────────────────────────────────
    // This adds new messages to the currently-open stream
    
    // oninit: prepare handler function
    extend('ext:flarum/messages/forum/components/MessageStream', 'oninit', function (vnode) {
      this.messageCreatedHandler = (data) => {
        console.log('[Avocado] !!!MESSAGE HANDLER CALLED!!!:', data);
        if (!data) {
          console.warn('[Avocado] Empty data received');
          return;
        }
        
        try {
          const message = app.store.pushPayload(data);
          console.log('[Avocado] Message pushed to store:', message?.id());
          
          // Only add if it's for the current dialog and stream has content loaded
          if (message?.dialog?.()?.id() === this.attrs?.dialog?.id() && this.attrs.state.hasItems()) {
            console.log('[Avocado] Adding message to stream:', message?.id());
            this.attrs.state.push(message);
            // Auto-scroll to bottom
            setTimeout(() => this.scrollToBottom?.(), 50);
            m.redraw();
          }
        } catch (err) {
          console.error('[Avocado] Error handling message:', err);
        }
      };
    });

    // oncreate: register handler on user channel
    extend('ext:flarum/messages/forum/components/MessageStream', 'oncreate', function (vnode) {
      console.log('[Avocado] MessageStream oncreate fired');
      
      if (!app.websocket_channels?.user) {
        console.warn('[Avocado] User channel not ready in oncreate');
        return;
      }
      
      console.log('[Avocado] ✅ Binding message handler in oncreate');
      app.websocket_channels.user.bind(MESSAGE_CREATED_EVENT, this.messageCreatedHandler);
    });

    // onremove: clean up handler
    extend('ext:flarum/messages/forum/components/MessageStream', 'onremove', function (vnode) {
      if (app.websocket_channels?.user && this.messageCreatedHandler) {
        console.log('[Avocado] Unbinding message handler in onremove');
        app.websocket_channels.user.unbind(MESSAGE_CREATED_EVENT, this.messageCreatedHandler);
      }
    });

    // ──────────────────────────────────────────────────────────────────────────
    // TYPING INDICATOR SUPPORT
    // ──────────────────────────────────────────────────────────────────────────
    
    extend('ext:flarum/messages/forum/components/MessageStream', 'oninit', function (vnode) {
      this.userTypingHandler = (data) => {
        console.log('[Avocado] User typing:', data);
        this.userTyping?.(data);
      };
    });

    extend('ext:flarum/messages/forum/components/MessageStream', 'oncreate', function (vnode) {
      if (!app.websocket) {
        console.warn('[Avocado] WebSocket not available for typing indicator');
        return;
      }

      const dialogId = this.attrs?.dialog?.id?.();
      if (!dialogId) return;

      const typingChannelName = `private-privateMessageTyping=${dialogId}`;
      
      // Subscribe to typing indicator channel
      if (!app.websocket_channels) app.websocket_channels = {};
      
      app.websocket_channels.privateMessages = app.websocket.subscribe(typingChannelName);
      
      if (app.websocket_channels.privateMessages && this.userTypingHandler) {
        console.log('[Avocado] Binding typing indicator handler');
        app.websocket_channels.privateMessages.bind('client-typing', this.userTypingHandler);
      }
    });

    extend('ext:flarum/messages/forum/components/MessageStream', 'onremove', function (vnode) {
      if (app.websocket_channels?.privateMessages && this.userTypingHandler) {
        console.log('[Avocado] Unbinding typing indicator handler');
        app.websocket_channels.privateMessages.unbind('client-typing', this.userTypingHandler);
      }
    });

    console.log('[Avocado] Realtime integration setup complete');

  } catch (err) {
    console.error('[Avocado] Realtime integration failed:', err);
  }
}

