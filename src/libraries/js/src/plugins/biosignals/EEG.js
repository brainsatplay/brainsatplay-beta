import { StateManager } from '../../ui/StateManager'

export class EEG{
    
    static id = String(Math.floor(Math.random()*1000000))

    constructor(label, session, params={}) {
        this.label = label
        this.session = session
        

        this.props = {
            state: new StateManager(),
            deviceSubscriptions: [],
            toUnsubscribe: {
                stateAdded: [],
                stateRemoved: []
            },
            deviceState: null,
            // sps: null,
            // tags: null
        }

        this.ports = {
            atlas: {
                edit: false,
                input: {type:null},
                output: {type: Object, name: 'DataAtlas'},
                onUpdate: () =>{
                    return {data: this.session.atlas.data}
                }
            }
        }

        let keys = ['raw','filtered', 'position']

        // Auto-Generate Ports
        keys.forEach(key => {
            this.ports[key] = {
                edit: false,
                input: {type:null},
                output: {type:Array},
                onUpdate: (user) => {

                    let data = []
                    this.session.atlas.data.eeg.forEach(coord => {
                        data.push(coord[key])
                    })

                    return {data}
                }
            }

            // if (key === 'position') this.ports[key].output.type = 'position'
            // else this.ports[key].output.type = Array
        })
    }

    init = () => {
        this.props.toUnsubscribe = this.session.subscribeToDevices('eeg', (data) => {
            this.session.graph.triggerAllActivePorts(this)
        })
    }

    deinit = () => {
        for (let key in this.props.toUnsubscribe){
            this.session.state[this.props.toUnsubscribe[key].method](key,this.props.toUnsubscribe[key].idx)
        }
    }
}