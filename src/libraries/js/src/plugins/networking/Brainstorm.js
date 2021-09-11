export class Brainstorm {

    static id = String(Math.floor(Math.random() * 1000000))

    constructor(label, session, params = {}) {
        this.label = label
        this.session = session
        

        this.props = {
            subscriptions: {},
            users: {}
        }

        this.ports = {
            default: {
                input: { type: undefined },
                output: { type: null },
                onUpdate: (user) => {
                    // Register as New Port
                    let port = user.meta.source
                    let sessionId = user.meta.session

                    // Register New Port
                    if (port != null) {
                        let label = port
                        let splitId = label.split('_')
                        let sourceName = splitId[0]
                        let sourcePort = splitId[1] ?? 'default'

                        // Register New Port
                        this.session.graph.addPort(
                            this,
                            port,
                            {
                                data: user.data,
                                input: { type: null },
                                output: { type: undefined },
                                onUpdate: (user) => {
                                    return user // Pass through to update state data and trigger downstream nodes
                                }
                            }
                        )

                        // Subscribe in Session
                        if (sessionId != null) {
                            if (this.props.subscriptions[label] == null) {
                                if (this.props.subscriptions[label] == null) this.props.subscriptions[label] = []

                                let found = this.session.graph.findStreamFunction(label)

                                if (found == null) {

                                    // Create Brainstorm Stream
                                    let subId1 = this.session.streamAppData(label, this.session.graph.registry.local[sourceName].registry[sourcePort].state, sessionId, () => { })
                                    this.props.subscriptions[label].push({ id: subId1, target: null })

                                    this._addUserSubscription(this.session.info.auth.id, label, sessionId, ()=>{}, this.session.info.auth.username) // Subscribe to yourself

                                    // Subscribe to each user as they are added to the session
                                    if (this.session.state.data[sessionId]){

                                        let subId2 = this.session.state.subscribe(sessionId, (sessionInfo) => {
                                            
                                            if (sessionInfo.userLeft) {
                                                let key = (sessionInfo.userLeft === this.session.info.auth.id) ? `${label}` : `${sessionId}_${sessionInfo.userLeft}_${label}`
                                                
                                                if (this.ports.onUserDisconnected.data instanceof Function) this.ports.onUserDisconnected.data({id: sessionInfo.userLeft, username:this.props.users[sessionInfo.userLeft].username})

                                                // Unsubscribe from all keys
                                                Object.keys(this.props.users[sessionInfo.userLeft]).forEach(label => {
                                                    if (label != 'username') this.session.state.unsubscribe(key, this.props.users[sessionInfo.userLeft][label])
                                                })
                                            }

                                            // Add Subscription to Each User in the Game
                                            if (sessionInfo.users){
                                                Object.keys(sessionInfo.users).forEach(userId => {
                                                    this._addUserSubscription(userId, label, sessionId, ()=>{}, sessionInfo.users[userId])
                                                })
                                            }
                                        })

                                        this.props.subscriptions[label].push({ id: subId2, target: null })
                                    }
                                }
                            }
                        }
                    }
                }
            },
            onUserConnected: {},
            onUserDisconnected: {}
        }
    }

    init = () => { }

    deinit = () => { }

    _addUserSubscription = (userId, label, sessionId, callback, username) => {

        let _sendData = (user) => {
            let res = this.session.graph.runSafe(this, label, user)
            callback(res)
        }

        if (!(userId in this.props.users)) this.props.users[userId] = {}
        if (!(label in this.props.users[userId])){

            let key = (userId === this.session.info.auth.id) ? `${label}` : `${sessionId}_${userId}_${label}`

            let toPass = (this.session.state.data[key].data != null) ? this.session.state.data[key] : {}

            // Default Info
            if (!('id' in toPass)) toPass.id = userId
            if (!('username' in toPass)) toPass.username = username
            if (!('meta' in toPass)) toPass.meta = {}

            if (this.ports.onUserConnected.data instanceof Function) this.ports.onUserConnected.data(toPass)
            // if ('data' in toPass) _sendData(toPass) // NOTE: Might send twice
            this.props.users[userId].username = username

            this.props.users[userId][label] = this.session.state.subscribe(key, _sendData)
        }
    }

    _getBrainstormData(label, sessionId) {
        if (label && sessionId) {
            label = label.replace('brainstorm_', '')
            let brainstorm = this.session.getBrainstormData(sessionId, [label], 'app', 'plugin')
            return brainstorm
        }
    }
}