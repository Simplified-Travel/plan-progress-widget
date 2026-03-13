import Pusher from 'pusher-js'

/**
 * WsManager
 * Wraps pusher-js for the Pusher protocol.
 * Handles connection, channel subscription, and graceful teardown.
 * No authentication required — public channels only (auth endpoint
 * is accepted in config for future private channel support).
 */
export class WsManager {
    /**
     * @param {object} config
     * @param {string}   config.appKey        - Pusher app key
     * @param {string}   config.host          - WebSocket host (default: "realtime.simplified.travel")
     * @param {number}   config.port          - WebSocket port (default: 6001)
     * @param {boolean}  [config.forceTLS]    - Use wss:// (default: true)
     * @param {string}   config.channel       - Pusher channel name to subscribe to
     * @param {string[]} config.events        - Event names to bind
     * @param {string}   [config.authEndpoint]- Auth endpoint for future private channels
     * @param {function} config.onMessage     - Called with (eventName, parsedData) for each matched event
     * @param {function} config.onConnect     - Called when connection is established
     * @param {function} config.onDisconnect  - Called when connection drops
     * @param {function} config.onError       - Called with (error) on connection failure
     */
    constructor(config) {
        this._config = config
        this._pusher = null
        this._channel = null
        this._connect()
    }

    _connect() {
        const {
            appKey,
            host,
            port,
            forceTLS = true,
            channel: channelName,
            events,
            authEndpoint,
            onMessage,
            onConnect,
            onDisconnect,
            onError,
        } = this._config

        try {
            this._pusher = new Pusher(appKey, {
                cluster: 'mt1',
                wsHost: host,
                wsPort: port,
                wssPort: port,
                forceTLS,
                disableStats: true,
                enabledTransports: ['ws'],
                ...(authEndpoint ? { authEndpoint } : {}),
            })
        } catch (err) {
            console.error('[generation-widget] Failed to initialise Pusher client:', err)
            onError?.(err)
            return
        }

        // Connection lifecycle
        this._pusher.connection.bind('connected', () => {
            onConnect?.()
        })

        this._pusher.connection.bind('disconnected', () => {
            onDisconnect?.()
        })

        this._pusher.connection.bind('failed', (err) => {
            console.error('[generation-widget] WebSocket connection failed — widget will not display.', err)
            onError?.(err)
        })

        this._pusher.connection.bind('error', (err) => {
            console.error('[generation-widget] WebSocket error:', err?.error?.data?.message ?? err)
            onError?.(err)
        })

        // Channel subscription
        this._channel = this._pusher.subscribe(channelName)

        this._channel.bind('pusher:subscription_error', (err) => {
            console.error('[generation-widget] Channel subscription error:', err)
            onError?.(err)
        })

        // Bind all requested events
        for (const eventName of events) {
            this._channel.bind(eventName, (rawData) => {
                // pusher-js auto-parses JSON data; rawData may be an object or a string
                const data = typeof rawData === 'string' ? _tryParse(rawData) : rawData
                onMessage?.(eventName, data)
            })
        }
    }

    destroy() {
        if (this._channel && this._config.channel) {
            this._pusher?.unsubscribe(this._config.channel)
        }
        this._pusher?.disconnect()
        this._pusher = null
        this._channel = null
    }
}

function _tryParse(str) {
    try {
        return JSON.parse(str)
    } catch {
        return str
    }
}