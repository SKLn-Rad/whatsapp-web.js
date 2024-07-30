'use strict';

const Base = require('./Base');
const Message = require('./Message');

/**
 * Represents a Chat on WhatsApp
 * @extends {Base}
 */
class Chat extends Base {
    constructor(client, data) {
        super(client);

        if (data) this._patch(data);
    }

    _patch(data) {
        /**
         * ID that represents the chat
         * @type {object}
         */
        this.id = data.id;

        /**
         * Title of the chat
         * @type {string}
         */
        this.name = data.formattedTitle;

        /**
         * Indicates if the Chat is a Group Chat
         * @type {boolean}
         */
        this.isGroup = data.isGroup;

        /**
         * Indicates if the Chat is readonly
         * @type {boolean}
         */
        this.isReadOnly = data.isReadOnly;

        /**
         * Amount of messages unread
         * @type {number}
         */
        this.unreadCount = data.unreadCount;

        /**
         * Unix timestamp for when the last activity occurred
         * @type {number}
         */
        this.timestamp = data.t;

        /**
         * Indicates if the Chat is archived
         * @type {boolean}
         */
        this.archived = data.archive;

        /**
         * Indicates if the Chat is pinned
         * @type {boolean}
         */
        this.pinned = !!data.pin;

        /**
         * Indicates if the chat is muted or not
         * @type {boolean}
         */
        this.isMuted = data.isMuted;

        /**
         * Unix timestamp for when the mute expires
         * @type {number}
         */
        this.muteExpiration = data.muteExpiration;

        /**
         * Last message fo chat
         * @type {Message}
         */
        this.lastMessage = data.lastMessage ? new Message(super.client, data.lastMessage) : undefined;

        return super._patch(data);
    }

    /**
     * Send a message to this chat
     * @param {string|MessageMedia|Location} content
     * @param {MessageSendOptions} [options] 
     * @returns {Promise<Message>} Message that was just sent
     */
    async sendMessage(content, options) {
        return this.client.sendMessage(this.id._serialized, content, options);
    }

    /**
     * Set the message as seen
     * @returns {Promise<Boolean>} result
     */
    async sendSeen() {
        return this.client.sendSeen(this.id._serialized);
    }

    /**
     * Clears all messages from the chat
     * @returns {Promise<Boolean>} result
     */
    async clearMessages() {
        return this.client.pupPage.evaluate(chatId => {
            return window.WWebJS.sendClearChat(chatId);
        }, this.id._serialized);
    }

    /**
     * Deletes the chat
     * @returns {Promise<Boolean>} result
     */
    async delete() {
        return this.client.pupPage.evaluate(chatId => {
            return window.WWebJS.sendDeleteChat(chatId);
        }, this.id._serialized);
    }

    /**
     * Archives this chat
     */
    async archive() {
        return this.client.archiveChat(this.id._serialized);
    }

    /**
     * un-archives this chat
     */
    async unarchive() {
        return this.client.unarchiveChat(this.id._serialized);
    }

    /**
     * Pins this chat
     * @returns {Promise<boolean>} New pin state. Could be false if the max number of pinned chats was reached.
     */
    async pin() {
        return this.client.pinChat(this.id._serialized);
    }

    /**
     * Unpins this chat
     * @returns {Promise<boolean>} New pin state
     */
    async unpin() {
        return this.client.unpinChat(this.id._serialized);
    }

    /**
     * Mutes this chat forever, unless a date is specified
     * @param {?Date} unmuteDate Date at which the Chat will be unmuted, leave as is to mute forever
     */
    async mute(unmuteDate) {
        return this.client.muteChat(this.id._serialized, unmuteDate);
    }

    /**
     * Unmutes this chat
     */
    async unmute() {
        return this.client.unmuteChat(this.id._serialized);
    }

    /**
     * Mark this chat as unread
     */
    async markUnread() {
        return this.client.markChatUnread(this.id._serialized);
    }

    static scrolledChats = new Set();

    /**
     * Loads chat messages, sorted from earliest to latest.
     * @param {Object} searchOptions Options for searching messages. Right now only limit and fromMe is supported.
     * @param {Number} [searchOptions.limit] The amount of messages to return. If no limit is specified, the available messages will be returned. Note that the actual number of returned messages may be smaller if there aren't enough messages in the conversation. Set this to Infinity to load all messages.
     * @param {Boolean} [searchOptions.fromMe] Return only messages from the bot number or vise versa. To get all messages, leave the option undefined.
     * @returns {Promise<Array<Message>>}
     */
    async fetchMessages(searchOptions) {
        console.log(`[fetchMessages] Starting with searchOptions:`, JSON.stringify(searchOptions));

        const page = this.client.pupPage;

        // Function to scroll the chat
        const scrollChat = async () => {
            return await page.evaluate(() => {
                const getChatContainer = () => {
                    // Try multiple selectors
                    const selectors = [
                        'div[data-testid="conversation-panel-messages"]',
                        '#main div[role="region"]',
                        '#main div[tabindex="-1"]',
                        'div#main > div > div > div[class*="message-list"]',
                        'div.tvf2evcx.m0h2a7mj.lb5m6g5c.j7l1k36l.ktfrpxia.nu7pwgvd.p357zi0d.dnb887gk.gjuq5ydh.i2cterl7.i6vnu1w3.qjslfuze.ac3ptf1s',
                        // Add more selectors if needed
                    ];

                    for (let selector of selectors) {
                        const element = document.querySelector(selector);
                        if (element) {
                            console.log(`[Browser] Chat container found with selector: ${selector}`);
                            return element;
                        }
                    }

                    console.error('[Browser] Could not find chat container');
                    return null;
                };

                const chatContainer = getChatContainer();
                if (chatContainer) {
                    const beforeScrollHeight = chatContainer.scrollHeight;
                    chatContainer.scrollTop = 0;
                    console.log(`[Browser] Chat container scrolled. Before: ${beforeScrollHeight}, After: ${chatContainer.scrollHeight}`);
                    return { success: true, beforeHeight: beforeScrollHeight, afterHeight: chatContainer.scrollHeight };
                } else {
                    console.error('[Browser] Chat container not found. Dumping page structure:');
                    console.error(document.body.innerHTML);
                    return { success: false, error: 'Chat container not found' };
                }
            });
        };

        // Scroll to load more messages
        console.log(`[fetchMessages] Starting to scroll chat`);
        let previousHeight = 0;
        let attempts = 0;
        const maxAttempts = 100;

        while (attempts < maxAttempts) {
            console.log(`[fetchMessages] Scroll attempt ${attempts + 1}`);

            const scrollResult = await scrollChat();
            console.log(`[fetchMessages] Scroll result:`, JSON.stringify(scrollResult));

            if (!scrollResult || !scrollResult.success) {
                console.log(`[fetchMessages] Failed to find chat container. Stopping scroll attempts.`);
                break;
            }

            if (scrollResult.afterHeight === previousHeight) {
                console.log(`[fetchMessages] No more messages to load after ${attempts} attempts`);
                break;
            }

            previousHeight = scrollResult.afterHeight;
            attempts++;

            await page.waitForTimeout(500);
        }

        // Now fetch the messages
        const messages = await page.evaluate(async (searchOptions) => {
            if (!window.Store || !window.Store.Msg) {
                console.error('[Browser] window.Store or window.Store.Msg is not available');
                return { error: 'Store not available' };
            }

            const serializedMessages = window.Store.Msg.getModelsArray()
                .filter(msg => {
                    if (searchOptions && searchOptions.fromMe !== undefined) {
                        return msg.id.fromMe === searchOptions.fromMe;
                    }
                    return true;
                })
                .map(msg => {
                    try {
                        return window.WWebJS.getMessageModel(msg);
                    } catch (err) {
                        console.error(`[Browser] Error serializing message:`, err);
                        return null;
                    }
                })
                .filter(msg => msg !== null);

            console.log(`[Browser] Total messages after filtering: ${serializedMessages.length}`);

            if (serializedMessages.length > 0) {
                console.log(`[Browser] First message: `, JSON.stringify(serializedMessages[0], null, 2));
                console.log(`[Browser] Last message: `, JSON.stringify(serializedMessages[serializedMessages.length - 1], null, 2));
            }

            return { success: true, messages: serializedMessages };
        }, searchOptions);

        if (messages.error) {
            console.error(`[fetchMessages] Error fetching messages:`, messages.error);
            return [];
        }

        console.log(`[fetchMessages] Returned ${messages.messages.length} messages`);

        if (messages.messages.length > 0) {
            console.log(`[fetchMessages] First message details:`, JSON.stringify(messages.messages[0], null, 2));
            console.log(`[fetchMessages] Last message details:`, JSON.stringify(messages.messages[messages.messages.length - 1], null, 2));
        }

        return messages.messages.map(m => {
            console.log(`[fetchMessages] Creating Message object for: ${m.id._serialized}, Timestamp: ${m.timestamp}, Type: ${m.type}`);
            return new Message(this.client, m);
        });
    }

    // Add a method to reset the scrolled state for a chat (optional)
    static resetScrollState(chatId) {
        if (Chat.scrolledChats.has(chatId)) {
            Chat.scrolledChats.delete(chatId);
            console.log(`[resetScrollState] Scroll state reset for chat ${chatId}`);
        } else {
            console.log(`[resetScrollState] Chat ${chatId} was not previously scrolled`);
        }
    }

    /**
     * Simulate typing in chat. This will last for 25 seconds.
     */
    async sendStateTyping() {
        return this.client.pupPage.evaluate(chatId => {
            window.WWebJS.sendChatstate('typing', chatId);
            return true;
        }, this.id._serialized);
    }

    /**
     * Simulate recording audio in chat. This will last for 25 seconds.
     */
    async sendStateRecording() {
        return this.client.pupPage.evaluate(chatId => {
            window.WWebJS.sendChatstate('recording', chatId);
            return true;
        }, this.id._serialized);
    }

    /**
     * Stops typing or recording in chat immediately.
     */
    async clearState() {
        return this.client.pupPage.evaluate(chatId => {
            window.WWebJS.sendChatstate('stop', chatId);
            return true;
        }, this.id._serialized);
    }

    /**
     * Returns the Contact that corresponds to this Chat.
     * @returns {Promise<Contact>}
     */
    async getContact() {
        return await this.client.getContactById(this.id._serialized);
    }

    /**
     * Returns array of all Labels assigned to this Chat
     * @returns {Promise<Array<Label>>}
     */
    async getLabels() {
        return this.client.getChatLabels(this.id._serialized);
    }

    /**
     * Add or remove labels to this Chat
     * @param {Array<number|string>} labelIds
     * @returns {Promise<void>}
     */
    async changeLabels(labelIds) {
        return this.client.addOrRemoveLabels(labelIds, [this.id._serialized]);
    }
}

module.exports = Chat;
